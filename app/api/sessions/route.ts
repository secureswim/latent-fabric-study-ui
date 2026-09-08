import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDb } from '../../../db';
import { studySessions, studyTrials } from '../../../db/schema';
import { latentSnapshot, responseTarget } from '../../study';
import { validPositionId } from '../../latent-position';

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

  if (body.action === 'explore') {
    if(!validPositionId(body.designIndex)) return NextResponse.json({error:'Invalid position'}, {status:400});
    for(let attempt=0;attempt<5;attempt++) {
      const [session]=await db.select().from(studySessions).where(eq(studySessions.id,String(body.sessionId))).limit(1);
      if(!session)return NextResponse.json({error:'Session not found'},{status:404});
      const state=JSON.parse(session.stateJson);
      if(session.status!=='active'||!state.trialRunning||!state.recording||state.overlayVisible||state.responsePhase!=='idle'||state.currentTrial!==body.currentTrial||state.trialStartedAt!==body.trialStartedAt)
        return NextResponse.json({error:'Trial is no longer open for exploration',state},{status:409});
      const history=[...(state.visitedDesigns||[state.designIndex])];
      const sameGesture=typeof body.gestureId==='string'&&state.explorationGestureId===body.gestureId;
      if(sameGesture&&history.length>1)history[history.length-1]=body.designIndex;
      else if(history.at(-1)!==body.designIndex)history.push(body.designIndex);
      const next={...state,previousDesignIndex:sameGesture?state.previousDesignIndex:state.designIndex,designIndex:body.designIndex,visitedDesigns:history,branchHeads:{...(state.branchHeads||{}),[state.branch]:body.designIndex},explorationGestureId:body.gestureId,explorationRevision:Number(state.explorationRevision||0)+1};
      next.responseFrom=latentSnapshot(next);next.responseTarget=latentSnapshot(next);
      const updated=await db.update(studySessions).set({stateJson:JSON.stringify(next),updatedAt:now}).where(and(eq(studySessions.id,session.id),eq(studySessions.stateJson,session.stateJson))).returning({id:studySessions.id});
      if(updated.length)return NextResponse.json({state:next});
    }
    return NextResponse.json({error:'Concurrent update; retry exploration'},{status:409});
  }

  if (body.action === 'autosave') {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) return NextResponse.json({ error: 'Missing session id' }, { status: 400 });
    let saved=false;
    for(let attempt=0;attempt<8;attempt++) {
    const [existing] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    // Completion is terminal: older in-flight autosaves cannot downgrade it.
    if (existing.status === 'completed' && body.sessionStatus !== 'completed') {
      return NextResponse.json({ ok: true, savedAt: now, ignored: 'completed-session' });
    }
    const stored=JSON.parse(existing.stateJson||'{}');
    const phaseRank:Record<string,number>={idle:0,queued:1,running:2,complete:3};
    if(stored.animationId&&stored.animationId===body.state?.animationId&&phaseRank[stored.responsePhase]>phaseRank[body.state.responsePhase])body.state={...body.state,...stored};
    if(Number(stored.explorationRevision||0)>Number(body.state?.explorationRevision||0)) {
      body.state={...body.state,designIndex:stored.designIndex,previousDesignIndex:stored.previousDesignIndex,visitedDesigns:stored.visitedDesigns,explorationRevision:stored.explorationRevision};
      body.state.responseFrom=latentSnapshot(body.state);
      body.state.responseTarget=body.state.responsePhase==='queued'?responseTarget(body.state,body.state.response):latentSnapshot(body.state);
    }
    const updated=await db.update(studySessions).set({
      status: String(body.sessionStatus || 'active'),
      currentTrial: Number(body.currentTrial || 0),
      stateJson: JSON.stringify(body.state || {}),
      elapsedMs: Number(body.elapsedMs || 0),
      completedAt: body.sessionStatus === 'completed' ? now : null,
      updatedAt: now,
    }).where(and(eq(studySessions.id, sessionId),eq(studySessions.stateJson,existing.stateJson))).returning({id:studySessions.id});
    if(updated.length){saved=true;break}
    }
    if(!saved)return NextResponse.json({error:'Concurrent update; retry save'},{status:409});

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
    return NextResponse.json({ ok: true, savedAt: now, state:body.state });
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
    if(state.responsePhase==='complete')return NextResponse.json({ok:true,state,savedAt:now});
    const target = state.responseTarget || {};
    const nextState = phase === 'complete' ? {
      ...state,
      viewScale:target.viewScale??state.viewScale??1,
      branchHeads:target.branchHeads??state.branchHeads,
      lockedDesignIndex:target.lockedDesignIndex,
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
