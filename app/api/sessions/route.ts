import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDb } from '../../../db';
import { studySessions, studyTrials } from '../../../db/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const id = request.nextUrl.searchParams.get('id');
  const live = request.nextUrl.searchParams.get('live');
  const exportAll = request.nextUrl.searchParams.get('export');
  if (id) {
    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const trials = await db.select().from(studyTrials).where(eq(studyTrials.sessionId, id)).orderBy(studyTrials.trialNumber);
    return NextResponse.json({ session, trials });
  }
  if (live === '1') {
    const [session] = await db.select().from(studySessions).orderBy(desc(studySessions.updatedAt)).limit(1);
    return NextResponse.json({ session: session ?? null });
  }
  if (exportAll === 'all') {
    const sessions = await db.select().from(studySessions).orderBy(desc(studySessions.updatedAt));
    const trials = await db.select().from(studyTrials).orderBy(studyTrials.sessionId, studyTrials.trialNumber);
    return NextResponse.json({ sessions, trials });
  }
  const sessions = await db.select().from(studySessions).orderBy(desc(studySessions.updatedAt)).limit(40);
  // Repair records affected by the former final-save race. A session is only
  // promoted when every one of the 15 persisted trials is already complete.
  const repaired = await Promise.all(sessions.map(async (session) => {
    if (session.status !== 'paused' || session.currentTrial < 14) return session;
    const trials = await db.select({ status: studyTrials.status }).from(studyTrials).where(eq(studyTrials.sessionId, session.id));
    if (trials.length < 15 || trials.some((trial) => trial.status !== 'completed')) return session;
    const completedAt = session.completedAt ?? session.updatedAt;
    await db.update(studySessions).set({ status: 'completed', completedAt }).where(eq(studySessions.id, session.id));
    return { ...session, status: 'completed', completedAt };
  }));
  return NextResponse.json({ sessions: repaired });
}

export async function POST(request: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const body = await request.json() as Record<string, any>;
  const now = Date.now();

  if (body.action === 'create') {
    const id = crypto.randomUUID();
    await db.update(studySessions).set({ status: 'paused', updatedAt: now }).where(eq(studySessions.status, 'active'));
    await db.insert(studySessions).values({
      id,
      participantId: String(body.participantId || '').trim(),
      sequence: String(body.sequence || 'A'),
      researcherInitials: String(body.researcherInitials || '').trim(),
      status: 'active',
      currentTrial: 0,
      stateJson: JSON.stringify(body.state || {}),
      startedAt: Number(body.startedAt || now),
      elapsedMs: 0,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id });
  }

  if (body.action === 'autosave') {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) return NextResponse.json({ error: 'Missing session id' }, { status: 400 });
    const [existing] = await db.select({ status: studySessions.status }).from(studySessions).where(eq(studySessions.id, sessionId)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    // Completion is terminal: older in-flight autosaves cannot downgrade it.
    if (existing.status === 'completed' && body.sessionStatus !== 'completed') {
      return NextResponse.json({ ok: true, savedAt: now, ignored: 'completed-session' });
    }
    await db.update(studySessions).set({
      status: String(body.sessionStatus || 'active'),
      currentTrial: Number(body.currentTrial || 0),
      stateJson: JSON.stringify(body.state || {}),
      elapsedMs: Number(body.elapsedMs || 0),
      completedAt: body.sessionStatus === 'completed' ? now : null,
      updatedAt: now,
    }).where(eq(studySessions.id, sessionId));

    if (body.trial) {
      const trial = body.trial;
      const trialNumber = Number(trial.trialNumber || 1);
      await db.insert(studyTrials).values({
        id: `${sessionId}:${trialNumber}`,
        sessionId,
        trialNumber,
        referentId: String(trial.referentId || ''),
        referentLabel: String(trial.referentLabel || ''),
        status: String(trial.status || 'draft'),
        draftJson: JSON.stringify(trial.data || {}),
        durationMs: Number(trial.durationMs || 0),
        startedAt: trial.startedAt ? Number(trial.startedAt) : null,
        completedAt: trial.status === 'completed' ? now : null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [studyTrials.sessionId, studyTrials.trialNumber],
        set: {
          referentId: String(trial.referentId || ''),
          referentLabel: String(trial.referentLabel || ''),
          status: String(trial.status || 'draft'),
          draftJson: JSON.stringify(trial.data || {}),
          durationMs: Number(trial.durationMs || 0),
          startedAt: trial.startedAt ? Number(trial.startedAt) : null,
          completedAt: trial.status === 'completed' ? now : null,
          updatedAt: now,
        },
      });
    }
    return NextResponse.json({ ok: true, savedAt: now });
  }

  if (body.action === 'animation-ack') {
    const sessionId = String(body.sessionId || '');
    const animationId = String(body.animationId || '');
    const phase = String(body.phase || '');
    if (!sessionId || !animationId || !['running', 'complete'].includes(phase)) {
      return NextResponse.json({ error: 'Invalid animation acknowledgement' }, { status: 400 });
    }
    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId)).limit(1);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const state = JSON.parse(session.stateJson || '{}');
    if (state.animationId !== animationId) {
      return NextResponse.json({ error: 'Animation is no longer current' }, { status: 409 });
    }
    const target = state.responseTarget || {};
    const nextState = phase === 'complete' ? {
      ...state,
      designIndex: Number(target.designIndex ?? state.designIndex ?? 8),
      branch: String(target.branch ?? state.branch ?? 'b0'),
      anchors: Array.isArray(target.anchors) ? target.anchors : (state.anchors || []),
      locked: Array.isArray(target.locked) ? target.locked : (state.locked || []),
      visitedDesigns: Array.isArray(target.visitedDesigns) ? target.visitedDesigns : (state.visitedDesigns || [8]),
      previousDesignIndex: Number(state.responseFrom?.designIndex ?? state.designIndex ?? 8),
      responsePhase: 'complete',
      responseCompletedAt: now,
      screen: 'response-complete',
    } : {
      ...state,
      responsePhase: 'running',
      responseStartedAt: Number(body.startedAt || now),
      screen: 'responding',
    };
    await db.update(studySessions).set({ stateJson: JSON.stringify(nextState), updatedAt: now }).where(eq(studySessions.id, sessionId));
    return NextResponse.json({ ok: true, state: nextState, savedAt: now });
  }

  if (body.action === 'resume') {
    const sessionId = String(body.sessionId || '');
    await db.update(studySessions).set({ status: 'active', updatedAt: now }).where(eq(studySessions.id, sessionId));
    const [session] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId)).limit(1);
    const trials = await db.select().from(studyTrials).where(and(eq(studyTrials.sessionId, sessionId))).orderBy(studyTrials.trialNumber);
    return NextResponse.json({ session, trials });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
