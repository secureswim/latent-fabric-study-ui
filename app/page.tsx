'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL_NAME, currentReferent, DEFAULT_STATE, designId, STORAGE_KEY, StudyState } from './study';
import { activeDesignLabel, animationProgress, CandidateField, RESPONSE_LABELS } from './latent-field';

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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const cursorPoint = (index: number, width: number, height: number) => ({
  x: width * (.38 + (index % 9) * .035),
  y: height * (.46 + ((index * 3) % 7) * .022),
});

const LEGACY_RESPONSE_LABELS: Record<string, string> = {
  navigate: 'TRAVERSING LATENT NEIGHBOURHOOD', broad: 'EXPANDING SEARCH RADIUS', local: 'REFINING LOCAL CLUSTER',
  'zoom-out': 'WIDENING LATENT VIEW', anchor: 'PLACING ANCHOR AT CURSOR', 'return-anchor': 'RETURNING TO PRESERVED STATE',
  branch: 'GENERATING NEW BRANCH', lock: 'PRESERVING BACKREST', unlock: 'RELEASING BACKREST', undo: 'REVERSING LAST MOVE',
  compare: 'ALIGNING PRESERVED STATES', reset: 'RESTORING INITIAL STATE', history: 'RECONSTRUCTING VISITED PATH',
  'timeline-branch': 'SWITCHING EXPLORATION PATH', select: 'COMMITTING FINAL SELECTION',
};

function LegacyCandidateField({ state }: { state: StudyState }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useMemo(() => seededPoints(), []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let animationFrame = 0;
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = el.getBoundingClientRect();
      el.width = rect.width * dpr; el.height = rect.height * dpr;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
      const animating = state.screen === 'responding';
      const rawProgress = animating ? clamp01((Date.now() - Number(state.responseStartedAt || Date.now())) / Number(state.responseDurationMs || 3000)) : 1;
      const progress = ease(rawProgress);
      const from = cursorPoint(Number(state.previousDesignIndex ?? state.designIndex), rect.width, rect.height);
      const to = cursorPoint(state.designIndex, rect.width, rect.height);
      const moving = ['navigate','broad','local','zoom-out','return-anchor','undo','reset','timeline-branch'].includes(state.response);
      const cx = moving ? from.x + (to.x - from.x) * progress : to.x;
      const cy = moving ? from.y + (to.y - from.y) * progress : to.y;
      points.forEach(p => {
        let x = p.x * rect.width, y = p.y * rect.height;
        const baseDistance = Math.hypot(x - cx, y - cy);
        if (state.response === 'broad') { const scale = 1 + progress * .16; x = cx + (x - cx) * scale; y = cy + (y - cy) * scale; }
        if (state.response === 'zoom-out') { const scale = 1 - progress * .13; x = cx + (x - cx) * scale; y = cy + (y - cy) * scale; }
        if (state.response === 'local' && baseDistance < 150) { const scale = 1 - progress * .1; x = cx + (x - cx) * scale; y = cy + (y - cy) * scale; }
        const dist = Math.hypot(x - cx, y - cy);
        const near = dist < 115;
        const localBoost = state.response === 'local' && near ? progress * .18 : 0;
        ctx.fillStyle = `rgba(214,218,223,${near ? Math.min(.82,p.a+.28+localBoost) : p.a})`;
        ctx.beginPath(); ctx.arc(x, y, near ? p.s + .25 : p.s, 0, Math.PI * 2); ctx.fill();
      });
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,159,69,.38)';
      ctx.beginPath(); ctx.moveTo(cx - 170, cy + 76); ctx.quadraticCurveTo(cx - 78, cy + 52, cx, cy); ctx.stroke();
      if (moving && rawProgress < 1) {
        ctx.strokeStyle = `rgba(255,159,69,${.25 + progress * .6})`;ctx.lineWidth = 1.5;ctx.setLineDash([4,5]);
        ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.quadraticCurveTo((from.x+to.x)/2,Math.min(from.y,to.y)-55,to.x,to.y);ctx.stroke();ctx.setLineDash([]);
      }
      for (let i = 0; i < state.anchors.length; i++) {
        const anchor = cursorPoint(state.anchors[i], rect.width, rect.height); const ax = anchor.x, ay = anchor.y;
        const placingCurrent = animating && state.response === 'anchor' && i === state.anchors.length - 1 && state.anchors[i] === state.designIndex;
        if (placingCurrent) continue;
        ctx.strokeStyle = '#4FA3D1'; ctx.strokeRect(ax - 5, ay - 5, 10, 10);
        ctx.fillStyle = '#8bc8e7'; ctx.font = '10px ui-monospace'; ctx.fillText(`A${i + 1}`, ax + 9, ay + 4);
      }
      if (state.response === 'anchor') {
        const drop = clamp01(rawProgress / .72); const settle = ease(drop); const ay = cy - (1 - settle) * 105; const size = 8 + settle * 7;
        ctx.fillStyle = `rgba(79,163,209,${.08 + settle * .18})`;ctx.fillRect(cx-size,ay-size,size*2,size*2);
        ctx.strokeStyle = '#69b9e3';ctx.lineWidth = 1.5;ctx.strokeRect(cx-size,ay-size,size*2,size*2);
        ctx.beginPath();ctx.moveTo(cx,ay-size-18);ctx.lineTo(cx,ay-size);ctx.stroke();
        if (rawProgress > .72) { const pulse = 22 + Math.sin(rawProgress*22)*3;ctx.strokeStyle=`rgba(105,185,227,${1-rawProgress*.55})`;ctx.beginPath();ctx.arc(cx,cy,pulse,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#9bd8f4';ctx.font='10px ui-monospace';ctx.fillText(`A${state.anchors.length} · ${designId(state.designIndex)}`,cx+22,cy-20); }
      } else if (state.response === 'branch') {
        const length = 130 * progress;ctx.strokeStyle='#4FA3D1';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,cy);ctx.quadraticCurveTo(cx+length*.42,cy-58*progress,cx+length,cy-38*progress);ctx.stroke();
        ctx.strokeStyle='rgba(255,159,69,.75)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.quadraticCurveTo(cx+length*.38,cy+45*progress,cx+length*.82,cy+54*progress);ctx.stroke();
      } else if (state.response === 'lock' || state.response === 'unlock') {
        const closing = state.response === 'lock' ? progress : 1-progress; const span = 46 - closing*20;ctx.strokeStyle=state.response==='lock'?'#6FBF73':'#FF9F45';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(cx-span,cy-22);ctx.lineTo(cx-span,cy+22);ctx.moveTo(cx+span,cy-22);ctx.lineTo(cx+span,cy+22);ctx.stroke();
        ctx.strokeRect(cx-7,cy-2,14,12);ctx.beginPath();ctx.arc(cx,cy-2,6,Math.PI,0);ctx.stroke();
      } else if (state.response === 'compare') {
        const candidates = state.anchors.slice(-2).map(a=>cursorPoint(a,rect.width,rect.height));if(candidates.length<2)candidates.push({x:cx+100,y:cy-55},{x:cx-100,y:cy+45});
        const a=candidates[0],b=candidates[1];ctx.strokeStyle=`rgba(79,163,209,${.3+.7*progress})`;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);[a,b].forEach((pt,i)=>{ctx.strokeRect(pt.x-16*progress,pt.y-16*progress,32*progress,32*progress);ctx.fillStyle='#8bc8e7';ctx.fillText(`A${i+1}`,pt.x+20,pt.y)});
      } else if (state.response === 'history' || state.response === 'timeline-branch') {
        ctx.strokeStyle=state.response==='timeline-branch'?'#4FA3D1':'rgba(255,159,69,.82)';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<7;i++){const t=i/6*progress;const x=cx-150+t*300,y=cy+Math.sin(t*Math.PI*3)*38;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();
      } else if (state.response === 'select') {
        const size=12+progress*20;ctx.strokeStyle='#6FBF73';ctx.lineWidth=1.5;ctx.strokeRect(cx-size,cy-size,size*2,size*2);ctx.strokeStyle=`rgba(111,191,115,${1-progress*.5})`;ctx.beginPath();ctx.arc(cx,cy,18+progress*35,0,Math.PI*2);ctx.stroke();
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
      if (state.response === 'reset' && animating) {ctx.fillStyle=`rgba(10,12,14,${Math.sin(rawProgress*Math.PI)*.5})`;ctx.fillRect(0,0,rect.width,rect.height)}
      if (animating && rawProgress < 1) animationFrame = window.requestAnimationFrame(paint);
    };
    paint(); const obs = new ResizeObserver(paint); obs.observe(el); return () => { obs.disconnect(); window.cancelAnimationFrame(animationFrame); };
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

function PreviewMorph({state}:{state:StudyState}){
  const [progress,setProgress]=useState(()=>animationProgress(state));
  useEffect(()=>{
    let frame=0;
    const tick=()=>{const next=animationProgress(state);setProgress(next);if(state.responsePhase==='running'&&next<1)frame=requestAnimationFrame(tick)};
    tick();return()=>cancelAnimationFrame(frame);
  },[state.animationId,state.responsePhase,state.responseStartedAt,state.responseDurationMs]);
  if(state.responsePhase!=='running')return <ChairModel state={state}/>;
  const from={...state,...state.responseFrom};
  const target={...state,...state.responseTarget};
  const locked=state.response==='lock'?progress:state.response==='unlock'?1-progress:0;
  return <div className="chair-morph" style={{'--morph-progress':progress,'--lock-progress':locked} as CSSProperties}>
    <div className="chair-morph-layer from"><ChairModel state={from}/></div>
    <div className="chair-morph-layer target"><ChairModel state={target}/></div>
    {(state.response==='lock'||state.response==='unlock')&&<div className="preview-lock-brackets"><i/><i/><b>{state.response==='lock'?'CONSTRAINT APPLIED':'CONSTRAINT RELEASED'}</b></div>}
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
  const stateRef = useRef<StudyState>(DEFAULT_STATE);
  const pendingLocalState = useRef<string | null>(null);
  const acknowledgedStart = useRef('');
  const acknowledgedComplete = useRef('');
  const completionTimer = useRef<number | undefined>(undefined);
  const applyState = (next: StudyState) => {
    const normalized = {...DEFAULT_STATE,...next} as StudyState;
    stateRef.current = normalized;
    setState(normalized);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  };
  useEffect(() => {
    const signature = (value: StudyState) => [
      value.sessionId, value.sessionStatus, value.setupComplete, value.currentTrial,
      value.screen, value.response, value.overlayVisible, value.trialRunning,
      value.animationId, value.responsePhase,
    ].join('|');
    const acceptLocalState = (next: StudyState) => {
      const normalized={...DEFAULT_STATE,...next} as StudyState;
      const current=stateRef.current;
      if(current.animationId&&current.animationId===normalized.animationId&&current.responsePhase==='running'&&normalized.responsePhase==='queued')return;
      pendingLocalState.current = signature(normalized);
      applyState(normalized);
    };
    const saved = localStorage.getItem(STORAGE_KEY); if (saved) applyState(JSON.parse(saved));
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = e => e.data?.type === 'state' && acceptLocalState(e.data.state);
    const storage = (e: StorageEvent) => e.key === STORAGE_KEY && e.newValue && acceptLocalState(JSON.parse(e.newValue));
    const syncHostedState = async () => {
      try {
        const response = await fetch('/api/sessions?live=1', { cache: 'no-store' });
        if (!response.ok) return;
        const payload:any = await response.json();
        if (payload.session?.stateJson) {
          const hosted = JSON.parse(payload.session.stateJson) as StudyState;
          const current=stateRef.current;
          if(current.animationId&&current.animationId===hosted.animationId&&current.responsePhase==='running'&&hosted.responsePhase==='queued')return;
          const pending = pendingLocalState.current;
          if (pending && signature(hosted) !== pending) return;
          pendingLocalState.current = null;
          applyState(hosted);
        }
      } catch { /* The local same-browser channel remains available offline. */ }
    };
    syncHostedState();
    const hostedTimer = window.setInterval(syncHostedState, 700);
    window.addEventListener('storage', storage); return () => { channel.close(); window.clearInterval(hostedTimer); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(()=>{
    const id=state.animationId;
    if(!id||!state.sessionId)return;
    if(state.responsePhase==='queued'&&acknowledgedStart.current!==id){
      acknowledgedStart.current=id;
      const startedAt=Date.now();
      const running={...state,responsePhase:'running' as const,responseStartedAt:startedAt,screen:'responding' as const};
      pendingLocalState.current=null;
      applyState(running);
      fetch('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'animation-ack',sessionId:state.sessionId,animationId:id,phase:'running',startedAt})})
        .then(response=>response.ok?response.json() as Promise<any>:null)
        .then(payload=>{if(payload?.state&&stateRef.current.animationId===id&&stateRef.current.responsePhase!=='complete')applyState(payload.state)})
        .catch(()=>{/* Local playback still completes and the next poll can retry state synchronization. */});
      return;
    }
    if(state.responsePhase==='running'&&acknowledgedComplete.current!==id){
      if(completionTimer.current)window.clearTimeout(completionTimer.current);
      const remaining=Math.max(0,Number(state.responseDurationMs||2800)-(Date.now()-Number(state.responseStartedAt||Date.now())));
      const finish=async()=>{
        if(stateRef.current.animationId!==id||acknowledgedComplete.current===id)return;
        acknowledgedComplete.current=id;
        try{
          const response=await fetch('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'animation-ack',sessionId:state.sessionId,animationId:id,phase:'complete',completedAt:Date.now()})});
          if(!response.ok)throw new Error('animation completion failed');
          const payload:any=await response.json();
          if(payload.state&&stateRef.current.animationId===id)applyState(payload.state);
        }catch{
          acknowledgedComplete.current='';
          completionTimer.current=window.setTimeout(finish,800);
        }
      };
      completionTimer.current=window.setTimeout(finish,remaining+80);
    }
    return()=>{if(completionTimer.current)window.clearTimeout(completionTimer.current)};
  },[state.animationId,state.responsePhase,state.responseStartedAt,state.responseDurationMs,state.sessionId]);
  const id = designId(state.designIndex);
  const displayId=activeDesignLabel(state);
  const dims = [820 + state.designIndex*9%260, 730 + state.designIndex*7%210, 960 + state.designIndex*13%280, 390 + state.designIndex*3%80];
  return <main className={`instrument ${state.overlayVisible ? 'overlay-active' : ''}`}>
    <header className="instrument-header"><b>LATENT FABRIC</b><span>STATE <strong>{state.responsePhase==='queued'?'QUEUED':state.responsePhase==='running'?'TRANSFORMING':state.response.toUpperCase()}</strong></span><span>DESIGN <strong>{displayId}</strong></span><span>BRANCH <strong>{state.branch}</strong></span><span>LOCKED <strong>{state.locked.length} / 5</strong></span><span className="header-domain">CHAIR · 2 049 CANDIDATES</span></header>
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
        {state.responsePhase==='queued'&&<div className="field-note solving">RESPONSE RECEIVED · PREPARING DISPLAY</div>}
        {state.responsePhase==='running'&&<div className="field-note solving">{RESPONSE_LABELS[state.response] || 'APPLYING RESPONSE'} · 2.8 SEC</div>}
        {state.response==='anchor'&&state.responsePhase==='complete'&&<div className="field-note anchor-note">ANCHOR PRESERVED · EXPLORATION CONTINUES</div>}
        {state.response==='select'&&state.responsePhase==='complete'&&<div className="selection-strip"><b>SELECTION CONFIRMED</b><span>{id}</span></div>}
      </section>
      <aside className="preview-panel">
        <div className="panel-title">PREVIEW · {displayId.toUpperCase()} <span>ISO · FRONT · SIDE · TOP</span></div>
        <PreviewMorph state={state}/>
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
