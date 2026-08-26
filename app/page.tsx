'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL_NAME, currentReferent, DEFAULT_STATE, designId, STORAGE_KEY, StudyState } from './study';

type Pt = { x: number; y: number; a: number; s: number };

function seededPoints(count = 1100): Pt[] {
  let seed = 48271;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const centres = [[.2,.27],[.37,.62],[.55,.38],[.7,.67],[.83,.31],[.51,.78]];
  return Array.from({ length: count }, (_, i) => {
    const c = centres[i % centres.length];
    const r = Math.pow(rand(), 1.65) * (.12 + rand() * .08);
    const t = rand() * Math.PI * 2;
    return { x: Math.max(.03, Math.min(.97, c[0] + Math.cos(t) * r * 1.3)), y: Math.max(.05, Math.min(.95, c[1] + Math.sin(t) * r)), a: .13 + rand() * .34, s: rand() > .96 ? 1.7 : .8 + rand() * .55 };
  });
}

function CandidateField({ state }: { state: StudyState }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useMemo(() => seededPoints(), []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = el.getBoundingClientRect();
      el.width = rect.width * dpr; el.height = rect.height * dpr;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
      const cx = rect.width * (.38 + (state.designIndex % 9) * .035);
      const cy = rect.height * (.46 + ((state.designIndex * 3) % 7) * .022);
      points.forEach(p => {
        const x = p.x * rect.width, y = p.y * rect.height;
        const dist = Math.hypot(x - cx, y - cy);
        const near = dist < 115;
        ctx.fillStyle = `rgba(214,218,223,${near ? Math.min(.72,p.a+.28) : p.a})`;
        ctx.beginPath(); ctx.arc(x, y, near ? p.s + .25 : p.s, 0, Math.PI * 2); ctx.fill();
      });
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,159,69,.38)';
      ctx.beginPath(); ctx.moveTo(cx - 170, cy + 76); ctx.quadraticCurveTo(cx - 78, cy + 52, cx, cy); ctx.stroke();
      for (let i = 0; i < state.anchors.length; i++) {
        const ax = rect.width * (.27 + i * .13), ay = rect.height * (.31 + (i % 2) * .22);
        ctx.strokeStyle = '#4FA3D1'; ctx.strokeRect(ax - 5, ay - 5, 10, 10);
        ctx.fillStyle = '#8bc8e7'; ctx.font = '10px ui-monospace'; ctx.fillText(`A${i + 1}`, ax + 9, ay + 4);
      }
      if (state.response === 'select') {
        ctx.strokeStyle = '#6FBF73'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 12, cy - 12, 24, 24);
      } else if (state.response === 'uncertain') {
        ctx.setLineDash([5,5]); ctx.strokeStyle = 'rgba(214,218,223,.65)'; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const deforming = state.response === 'broad' || state.response === 'local' || state.response === 'zoom-out';
        if (deforming) {
          [22,36,52,72].forEach((r, i) => { ctx.strokeStyle = `rgba(255,159,69,${.8 - i*.13})`; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); });
        }
        ctx.strokeStyle = '#FF9F45'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx-25,cy);ctx.lineTo(cx+25,cy);ctx.moveTo(cx,cy-25);ctx.lineTo(cx,cy+25);ctx.stroke();
        ctx.fillStyle='#FF9F45';ctx.beginPath();ctx.arc(cx,cy,2.4,0,Math.PI*2);ctx.fill();
      }
    };
    paint(); const obs = new ResizeObserver(paint); obs.observe(el); return () => obs.disconnect();
  }, [points, state]);
  return <canvas ref={canvas} className="candidate-canvas" aria-label="Continuous field of generated design candidates" />;
}

function ChairModel({ state, small = false }: { state: StudyState; small?: boolean }) {
  const variant = state.designIndex % 5;
  const style = { '--chair-v': variant } as CSSProperties;
  return <div className={`chair-frame ${small ? 'chair-small' : ''}`} style={style} aria-label="Current generated chair preview">
    <div className="chair-3d">
      <div className="chair-back"><i /><i /></div><div className="chair-seat" />
      <div className="chair-leg l1"/><div className="chair-leg l2"/><div className="chair-leg l3"/><div className="chair-leg l4"/>
      {variant % 2 === 1 && <><div className="chair-arm a1"/><div className="chair-arm a2"/></>}
    </div>
    <div className="chair-ground" />
  </div>;
}

function TaskOverlay({ state }: { state: StudyState }) {
  const ref = currentReferent(state);
  if (!state.overlayVisible) return null;
  if (state.screen === 'welcome') return <div className="study-overlay welcome-overlay"><span className="overlay-index">GESTURE ELICITATION STUDY</span><h1>LATENT FABRIC</h1><p>Explore a generative design system through a deformable physical surface.</p><small>The researcher will begin the session when ready.</small></div>;
  if (state.screen === 'familiarization') return <div className="study-overlay"><span className="overlay-index">MATERIAL FAMILIARIZATION</span><h2>Take a moment to explore the surface.</h2><p>Touch or manipulate it however you like. There is no correct way to interact with it.</p></div>;
  if (state.screen === 'practice') return <div className="study-overlay"><span className="overlay-index">PRACTICE · PROCEDURE</span><h2>You will be shown a situation.</h2><p>Perform whatever action feels most natural for the requested outcome. There are no predefined correct gestures.</p></div>;
  if (state.screen === 'question-why') return <div className="study-overlay question"><span className="overlay-index">REFLECTION</span><h2>Why did you choose that action?</h2></div>;
  if (state.screen === 'question-expect') return <div className="study-overlay question"><span className="overlay-index">REFLECTION</span><h2>What did you expect the surface to do?</h2></div>;
  if (state.screen === 'rating-naturalness') return <Rating title="How natural did that action feel?" low="Not natural" high="Very natural" />;
  if (state.screen === 'rating-confidence') return <Rating title="How confident are you that this action matched what you wanted the system to do?" low="Not confident" high="Very confident" />;
  if (state.screen === 'interview') return <div className="study-overlay question"><span className="overlay-index">POST-STUDY INTERVIEW</span><h2>Thank you. The researcher will guide the final conversation.</h2></div>;
  if (state.screen === 'complete') return <div className="study-overlay welcome-overlay complete"><span className="overlay-index">SESSION COMPLETE</span><h1>THANK YOU</h1><p>Your responses have been recorded.</p></div>;
  if (['trial','captured'].includes(state.screen)) return <div className="study-overlay task"><span className="overlay-index">TASK {String(state.currentTrial + 1).padStart(2,'0')} / 15</span><h2>{ref.prompt}</h2><p>Use the surface in whatever way feels most natural.</p></div>;
  return null;
}

function Rating({ title, low, high }: { title: string; low: string; high: string }) { return <div className="study-overlay rating"><span className="overlay-index">YOUR EXPERIENCE</span><h2>{title}</h2><div className="rating-scale">{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}</div><div className="rating-labels"><span>{low}</span><span>{high}</span></div><p>Say the number aloud. The researcher will record it.</p></div>; }

export default function Home() {
  const [state, setState] = useState<StudyState>(DEFAULT_STATE);
  const pendingLocalState = useRef<string | null>(null);
  useEffect(() => {
    const signature = (value: StudyState) => [
      value.sessionId, value.sessionStatus, value.setupComplete, value.currentTrial,
      value.screen, value.response, value.overlayVisible, value.trialRunning,
    ].join('|');
    const acceptLocalState = (next: StudyState) => {
      pendingLocalState.current = signature(next);
      setState(next);
    };
    const saved = localStorage.getItem(STORAGE_KEY); if (saved) setState(JSON.parse(saved));
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = e => e.data?.type === 'state' && acceptLocalState(e.data.state);
    const storage = (e: StorageEvent) => e.key === STORAGE_KEY && e.newValue && acceptLocalState(JSON.parse(e.newValue));
    const syncHostedState = async () => {
      try {
        const response = await fetch('/api/sessions?live=1', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.session?.stateJson) {
          const hosted = JSON.parse(payload.session.stateJson) as StudyState;
          const pending = pendingLocalState.current;
          if (pending && signature(hosted) !== pending) return;
          pendingLocalState.current = null;
          setState(hosted);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(hosted));
        }
      } catch { /* The local same-browser channel remains available offline. */ }
    };
    syncHostedState();
    const hostedTimer = window.setInterval(syncHostedState, 700);
    window.addEventListener('storage', storage); return () => { channel.close(); window.clearInterval(hostedTimer); window.removeEventListener('storage', storage); };
  }, []);
  const id = designId(state.designIndex);
  const dims = [820 + state.designIndex*9%260, 730 + state.designIndex*7%210, 960 + state.designIndex*13%280, 390 + state.designIndex*3%80];
  return <main className={`instrument ${state.overlayVisible ? 'overlay-active' : ''}`}>
    <header className="instrument-header"><b>LATENT FABRIC</b><span>STATE <strong>{state.screen === 'responding' ? 'SOLVING' : state.response.toUpperCase()}</strong></span><span>DESIGN <strong>{id}</strong></span><span>BRANCH <strong>{state.branch}</strong></span><span>LOCKED <strong>{state.locked.length} / 5</strong></span><span className="header-domain">CHAIR · 2 049 CANDIDATES</span></header>
    <section className="instrument-body">
      <aside className="browser-panel">
        <div className="panel-title">BROWSER <span>⌄</span></div>
        <div className="browser-tree"><b>▾ Chair · exploration</b><span>Current point <code>{id}</code></span><b>▾ Anchors {state.anchors.length}</b>{state.anchors.length ? state.anchors.map((_,i)=><span key={i}>A{i+1} · preserved state</span>) : <span>none yet</span>}<b>▾ Branches {state.branch==='b0'?1:2}</b><span>b0 · trunk</span>{state.branch!=='b0'&&<span>{state.branch} · active</span>}<b>▾ Locked components {state.locked.length}</b><span>{state.locked.length ? state.locked.join(', ') : 'none'}</span></div>
        <div className="anchor-heading"><span>ANCHORS</span><b>{state.anchors.length}</b></div>
        <div className="anchor-dock">{state.anchors.length ? state.anchors.slice(-4).map((a,i)=><div className="anchor-tile" key={i}><strong>A{i+1}</strong><small>{designId(a)}</small></div>) : <div className="dock-empty">EMPTY</div>}</div>
        <div className="browser-stats"><span>STEPS {String(state.currentTrial+2).padStart(2,'0')}</span><span>BRANCHES {state.branch==='b0'?1:2}</span></div>
      </aside>
      <section className="map-panel">
        <CandidateField state={state}/>
        {state.response==='uncertain'&&<div className="field-note uncertain">NOT COMMITTED</div>}
        {state.screen==='responding'&&<div className="field-note solving">SOLVING</div>}
        {state.response==='anchor'&&<div className="field-note anchor-note">ANCHOR PRESERVED · EXPLORATION CONTINUES</div>}
        {state.response==='select'&&<div className="selection-strip"><b>SELECTION CONFIRMED</b><span>{id}</span></div>}
      </section>
      <aside className="preview-panel">
        <div className="panel-title">PREVIEW · {id.toUpperCase()} <span>ISO · FRONT · SIDE · TOP</span></div>
        <ChairModel state={state}/>
        <div className="ortho-row"><ChairModel state={state} small/><ChairModel state={{...state,designIndex:state.designIndex+1}} small/><ChairModel state={{...state,designIndex:state.designIndex+2}} small/></div>
        <div className="dimension-grid">{['W','D','H','SEAT'].map((d,i)=><div key={d}><span>{d}</span><strong>{dims[i]} <i>mm</i></strong></div>)}</div>
        <div className="lock-title">COMPONENT LOCKS <b>{state.locked.length} / 5</b></div>
        {['Headrest','Backrest','Seat','Armrests','Legs / base'].map(p=><div className={`lock-row ${state.locked.includes(p)?'is-locked':''}`} key={p}><span>{p}</span><b>{state.locked.includes(p)?'LOCKED':'FREE'}</b></div>)}
      </aside>
    </section>
    <section className="timeline"><div className="timeline-tabs"><b>TIMELINE</b><span>BRANCHES</span><small>SHOWING STEP SEQUENCE</small></div><div className="timeline-track"><i className="start-node"/><span>START</span>{Array.from({length:Math.min(8,state.currentTrial+3)},(_,i)=><i className={i===Math.min(7,state.currentTrial+2)?'current-node':''} key={i}/>)}<span className="step-label">CURRENT · STEP {String(state.currentTrial+2).padStart(2,'0')}</span></div></section>
    <footer className="instrument-status"><b>{state.recording?'● RECORDING':'PAUSED'}</b><span>DESIGN {id}</span><span>BRANCH {state.branch}</span><span>LOCKED {state.locked.length} / 5</span><span>mm · 1200 × 600 ACTIVE</span></footer>
    <TaskOverlay state={state}/>
  </main>;
}
