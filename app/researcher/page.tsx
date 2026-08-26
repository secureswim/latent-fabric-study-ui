'use client';

import { useEffect, useRef, useState } from 'react';
import { CHANNEL_NAME, currentReferent, DEFAULT_STATE, designId, LOG_KEY, REFERENTS, ResponseKind, SEQUENCES, STORAGE_KEY, StudyState } from '../study';

type TrialLog = Record<string, string | number | boolean> & {
  trialDurationMs: number;
  trialStartedAt: number;
  status: string;
};

type StoredSession = {
  id: string; participantId: string; sequence: string; researcherInitials: string;
  status: string; currentTrial: number; stateJson: string; startedAt: number;
  elapsedMs: number; completedAt?: number | null; updatedAt: number;
};

const emptyLog = (): TrialLog => ({
  handCount:'', contactType:'', initialLocation:'', finalLocation:'', direction:'', pathShape:'', distance:'', surfaceArea:'',
  zDepth:'', maxDepthDuration:'', deformationRate:'', releasePattern:'', elicitationTime:'', gestureDuration:'', repetitions:1,
  hesitation:false, discreteContinuous:'', staticDynamic:'', singleMultiTouch:'', spatialNonSpatial:'', deformationPlanar:'',
  symbolicDirect:'', naturalness:0, confidence:0, explanation:'', expectedResponse:'', researcherNotes:'',
  trialDurationMs:0, trialStartedAt:0, status:'not-started',
});

function formatDuration(ms:number){const total=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
function Field({label,value,onChange,type='text'}:{label:string;value:string|number|boolean;onChange:(v:string|number|boolean)=>void;type?:string}){return <label className="form-field"><span>{label}</span>{type==='checkbox'?<input type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked)}/>:<input type={type} value={String(value)} onChange={e=>onChange(type==='number'?Number(e.target.value):e.target.value)}/>}</label>}
function SelectField({label,value,options,onChange}:{label:string;value:string|number|boolean;options:string[];onChange:(v:string)=>void}){return <label className="form-field"><span>{label}</span><select value={String(value)} onChange={e=>onChange(e.target.value)}><option value="">—</option>{options.map(o=><option key={o}>{o}</option>)}</select></label>}

export default function ResearcherPage(){
  const [state,setStateRaw]=useState<StudyState>(DEFAULT_STATE);
  const [log,setLog]=useState<TrialLog>(emptyLog());
  const [logs,setLogs]=useState<Record<string,TrialLog>>({});
  const [recent,setRecent]=useState<StoredSession[]>([]);
  const [now,setNow]=useState(0);
  const [savedAt,setSavedAt]=useState(0);
  const [storageState,setStorageState]=useState<'idle'|'saving'|'saved'|'offline'>('idle');
  const [setup,setSetup]=useState({participantId:'',sequence:'A',researcherInitials:''});
  const channel=useRef<BroadcastChannel|null>(null);
  const stateRef=useRef(state); const logRef=useRef(log); const logsRef=useRef(logs);
  const remoteTimer=useRef<number|undefined>(undefined);

  const publishState=(next:StudyState)=>{
    stateRef.current=next; setStateRaw(next); localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    channel.current?.postMessage({type:'state',state:next});
  };

  const sessionElapsed=(s=stateRef.current,at=Date.now())=>s.sessionAccumulatedMs+(s.recording&&s.sessionRunStartedAt?at-s.sessionRunStartedAt:0);
  const trialElapsed=(s=stateRef.current,l=logRef.current,at=Date.now())=>Number(l.trialDurationMs||0)+(s.trialRunning&&s.trialStartedAt?at-s.trialStartedAt:0);

  const loadRecent=async()=>{try{const response=await fetch('/api/sessions',{cache:'no-store'});if(response.ok)setRecent((await response.json()).sessions||[]);}catch{setStorageState('offline')}};

  const persistSnapshot=async(status='draft',providedLog?:TrialLog,providedState?:StudyState)=>{
    const s=providedState||stateRef.current; if(!s.sessionId)return;
    const l=providedLog||logRef.current; const ref=currentReferent(s);
    const sessionStatus=status==='session-complete'?'completed':s.sessionStatus;
    setStorageState('saving');
    try{
      const response=await fetch('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        action:'autosave',sessionId:s.sessionId,sessionStatus,
        currentTrial:s.currentTrial,state:s,elapsedMs:sessionElapsed(s),trial:{trialNumber:s.currentTrial+1,referentId:ref.id,referentLabel:ref.label,
        status:status==='completed'?'completed':l.status,data:l,durationMs:trialElapsed(s,l),startedAt:l.trialStartedAt||s.trialStartedAt||0}
      })});
      if(!response.ok)throw new Error('save failed');setStorageState('saved');setSavedAt(Date.now());
    }catch{setStorageState('offline')}
  };

  const queueRemoteSave=(nextLog:TrialLog,nextState=stateRef.current)=>{
    if(remoteTimer.current)window.clearTimeout(remoteTimer.current);
    remoteTimer.current=window.setTimeout(()=>persistSnapshot('draft',nextLog,nextState),650);
  };

  useEffect(()=>{
    channel.current=new BroadcastChannel(CHANNEL_NAME);
    const savedState=localStorage.getItem(STORAGE_KEY);const savedLogs=localStorage.getItem(LOG_KEY);
    if(savedState){const restored={...DEFAULT_STATE,...JSON.parse(savedState)} as StudyState;stateRef.current=restored;setStateRaw(restored);if(savedLogs){const parsed=JSON.parse(savedLogs);logsRef.current=parsed;setLogs(parsed);const selected=parsed[String(restored.currentTrial)]||emptyLog();logRef.current=selected;setLog(selected)}}
    loadRecent();setNow(Date.now());const clock=window.setInterval(()=>setNow(Date.now()),1000);
    const backup=window.setInterval(()=>{if(stateRef.current.sessionId)persistSnapshot('draft')},10000);
    return()=>{window.clearInterval(clock);window.clearInterval(backup);if(remoteTimer.current)window.clearTimeout(remoteTimer.current);channel.current?.close()};
  },[]);

  const storeDraft=(nextLog:TrialLog,trial=stateRef.current.currentTrial,queue=true)=>{
    logRef.current=nextLog;setLog(nextLog);
    const nextLogs={...logsRef.current,[String(trial)]:nextLog};logsRef.current=nextLogs;setLogs(nextLogs);localStorage.setItem(LOG_KEY,JSON.stringify(nextLogs));if(queue)queueRemoteSave(nextLog);
  };
  const updateLog=(key:string,value:string|number|boolean)=>storeDraft({...logRef.current,[key]:value});

  const beginStudy=async()=>{
    if(!setup.participantId.trim())return;
    const at=Date.now();const provisional:StudyState={...DEFAULT_STATE,sessionStatus:'active',setupComplete:true,participantId:setup.participantId.trim(),researcherInitials:setup.researcherInitials.trim(),sequence:setup.sequence as keyof typeof SEQUENCES,screen:'trial',currentTrial:0,recording:true,sessionStartedAt:at,sessionRunStartedAt:at,overlayVisible:true};
    setStorageState('saving');
    try{
      const response=await fetch('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',participantId:provisional.participantId,sequence:provisional.sequence,researcherInitials:provisional.researcherInitials,startedAt:at,state:provisional})});
      if(!response.ok)throw new Error('create failed');const {id}=await response.json();const started={...provisional,sessionId:id};
      const first=emptyLog();publishState(started);setLog(first);logRef.current=first;setLogs({});logsRef.current={};localStorage.setItem(LOG_KEY,'{}');setStorageState('saved');setSavedAt(Date.now());await persistSnapshot('draft',first,started);
    }catch{setStorageState('offline')}
  };

  const resumeSession=async(id:string)=>{
    setStorageState('saving');try{const response=await fetch(`/api/sessions?id=${encodeURIComponent(id)}`,{cache:'no-store'});if(!response.ok)throw new Error();const payload=await response.json();const restored={...DEFAULT_STATE,...JSON.parse(payload.session.stateJson),sessionId:id,sessionStatus:payload.session.status,setupComplete:true,recording:false,sessionRunStartedAt:0,trialRunning:false} as StudyState;
      const restoredLogs:Record<string,TrialLog>={};for(const row of payload.trials||[])restoredLogs[String(row.trialNumber-1)]={...emptyLog(),...JSON.parse(row.draftJson),trialDurationMs:row.durationMs,status:row.status,trialStartedAt:row.startedAt||0};
      logsRef.current=restoredLogs;setLogs(restoredLogs);localStorage.setItem(LOG_KEY,JSON.stringify(restoredLogs));const selected=restoredLogs[String(restored.currentTrial)]||emptyLog();logRef.current=selected;setLog(selected);publishState(restored);setStorageState('saved');setSavedAt(Date.now());
    }catch{setStorageState('offline')}};

  const selectTrial=async(index:number)=>{
    const currentDuration=trialElapsed();const currentDraft={...logRef.current,trialDurationMs:currentDuration,status:logRef.current.status==='completed'?'completed':logRef.current.status==='not-started'?'not-started':'draft'};storeDraft(currentDraft);await persistSnapshot('draft',currentDraft);
    const selected=logsRef.current[String(index)]||emptyLog();logRef.current=selected;setLog(selected);
    const next={...stateRef.current,currentTrial:index,screen:'trial' as const,response:'idle' as const,overlayVisible:true,trialRunning:false,trialStartedAt:0,trialAccumulatedMs:Number(selected.trialDurationMs||0)};publishState(next);
    await persistSnapshot('draft',selected,next);
  };

  const startTrial=()=>{
    const at=Date.now();const startedLog={...logRef.current,status:'running',trialStartedAt:logRef.current.trialStartedAt||at};storeDraft(startedLog);
    const started={...stateRef.current,screen:'trial' as const,response:'idle' as const,overlayVisible:false,trialRunning:true,trialStartedAt:at,trialAccumulatedMs:Number(startedLog.trialDurationMs||0)};publishState(started);persistSnapshot('draft',startedLog,started);
  };

  const trigger=()=>{
    const ref=currentReferent(stateRef.current);const response=(ref.id==='explore-broadly'?'broad':ref.id==='refine-locally'?'local':ref.id==='zoom-out'?'zoom-out':ref.id==='anchor'?'anchor':ref.id==='return-anchor'?'return-anchor':ref.id==='branch'?'branch':ref.id==='lock'?'lock':ref.id==='unlock'?'unlock':ref.id==='undo'?'undo':ref.id==='compare'?'compare':ref.id==='reset'?'reset':ref.id==='history'?'history':ref.id==='switch-branch'?'timeline-branch':ref.id==='select'?'select':'navigate') as ResponseKind;
    const s=stateRef.current;let anchors=s.anchors,locked=s.locked,branch=s.branch,designIndex=s.designIndex;if(response==='anchor'&&!anchors.includes(designIndex))anchors=[...anchors,designIndex];if(response==='lock'&&!locked.includes('Backrest'))locked=[...locked,'Backrest'];if(response==='unlock')locked=[];if(response==='branch')branch=`b${Number(s.branch.slice(1)||0)+1}`;if(['navigate','broad','local','zoom-out'].includes(response))designIndex=(designIndex+({navigate:2,broad:9,local:1,'zoom-out':6} as Record<string,number>)[response])%28;
    const responding={...s,response,screen:'responding' as const,overlayVisible:false,anchors,locked,branch,designIndex};publishState(responding);persistSnapshot('draft',logRef.current,responding);window.setTimeout(()=>{const completed={...stateRef.current,screen:'response-complete' as const};publishState(completed);persistSnapshot('draft',logRef.current,completed)},850);
  };

  const pauseResume=()=>{
    const at=Date.now();const s=stateRef.current;
    if(s.sessionStatus==='completed')return;
    if(s.recording){const duration=trialElapsed(s,logRef.current,at);const draft={...logRef.current,trialDurationMs:duration,status:s.trialRunning?'paused':logRef.current.status};storeDraft(draft);const paused={...s,sessionStatus:'paused' as const,recording:false,sessionAccumulatedMs:sessionElapsed(s,at),sessionRunStartedAt:0,trialRunning:false,trialStartedAt:0};publishState(paused);persistSnapshot('draft',draft,paused)}
    else{const resumed={...s,sessionStatus:'active' as const,recording:true,sessionRunStartedAt:at,trialRunning:logRef.current.status==='paused',trialStartedAt:logRef.current.status==='paused'?at:0};publishState(resumed);storeDraft({...logRef.current,status:logRef.current.status==='paused'?'running':logRef.current.status})}
  };

  const saveNext=async()=>{
    if(stateRef.current.sessionStatus==='completed')return;
    const at=Date.now();const duration=trialElapsed(stateRef.current,logRef.current,at);const completed={...logRef.current,trialDurationMs:duration,status:'completed'};
    if(remoteTimer.current)window.clearTimeout(remoteTimer.current);
    storeDraft(completed,stateRef.current.currentTrial,false);
    const stopped={...stateRef.current,trialRunning:false,trialStartedAt:0,trialAccumulatedMs:duration};
    if(stopped.currentTrial>=14){const finished={...stopped,sessionStatus:'completed' as const,screen:'complete' as const,overlayVisible:true,recording:false,sessionAccumulatedMs:sessionElapsed(stopped,at),sessionRunStartedAt:0};publishState(finished);await persistSnapshot('session-complete',completed,finished);await loadRecent();return}
    publishState(stopped);await persistSnapshot('completed',completed,stopped);
    await selectTrial(stopped.currentTrial+1);
  };

  const exitStudy=async()=>{
    const s=stateRef.current;
    if(s.sessionStatus==='completed'){publishState({...s,setupComplete:false});await loadRecent();return}
    const at=Date.now();const duration=trialElapsed(s,logRef.current,at);const draft={...logRef.current,trialDurationMs:duration,status:s.trialRunning?'paused':logRef.current.status};
    if(remoteTimer.current)window.clearTimeout(remoteTimer.current);
    storeDraft(draft,s.currentTrial,false);
    const paused={...s,sessionStatus:'paused' as const,setupComplete:false,recording:false,sessionAccumulatedMs:sessionElapsed(s,at),sessionRunStartedAt:0,trialRunning:false,trialStartedAt:0,overlayVisible:true};
    publishState(paused);await persistSnapshot('draft',draft,paused);await loadRecent();
  };

  const exportSession=()=>{const payload={session:stateRef.current,trials:logsRef.current};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=`${stateRef.current.participantId}-latent-fabric.json`;a.click();URL.revokeObjectURL(a.href)};
  const exportStoredSession=async(id:string)=>{
    setStorageState('saving');
    try{
      const response=await fetch(`/api/sessions?id=${encodeURIComponent(id)}`,{cache:'no-store'});if(!response.ok)throw new Error('export failed');
      const payload=await response.json();
      const exported={
        exportVersion:1,
        exportedAt:new Date().toISOString(),
        session:{...payload.session,state:JSON.parse(payload.session.stateJson||'{}'),stateJson:undefined},
        trials:(payload.trials||[]).map((trial:Record<string,unknown>)=>({...trial,data:JSON.parse(String(trial.draftJson||'{}')),draftJson:undefined})),
      };
      const participant=String(payload.session.participantId||'participant').replace(/[^a-z0-9_-]+/gi,'-');
      const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`${participant}-latent-fabric-${payload.session.status}.json`;a.click();URL.revokeObjectURL(url);setStorageState('saved');setSavedAt(Date.now());
    }catch{setStorageState('offline')}
  };
  const newParticipant=()=>{const fresh={...DEFAULT_STATE};publishState(fresh);setLog(emptyLog());logRef.current=emptyLog();setLogs({});logsRef.current={};localStorage.removeItem(LOG_KEY);setSetup({participantId:'',sequence:'A',researcherInitials:stateRef.current.researcherInitials});loadRecent()};

  const ref=currentReferent(state);const sessionTime=sessionElapsed(state,now||Date.now());const trialTime=trialElapsed(state,log,now||Date.now());

  if(!state.setupComplete)return <SetupScreen setup={setup} setSetup={setSetup} beginStudy={beginStudy} recent={recent} resume={resumeSession} exportStored={exportStoredSession} storageState={storageState}/>;

  return <main className="researcher-app simple-console">
    <header className="researcher-header"><div><b>LATENT FABRIC</b><span>GESTURE STUDY CONSOLE</span></div><div className="session-readout"><strong>{state.participantId} · SEQUENCE {state.sequence}</strong><span>STUDY <b>{formatDuration(sessionTime)}</b></span><span>TRIAL <b>{formatDuration(trialTime)}</b></span><span className={`storage-indicator ${storageState}`}>{storageState==='saving'?'◌ SAVING':storageState==='offline'?'△ LOCAL BACKUP':'● STORED'}</span><button className="exit-study" onClick={exitStudy}>{state.sessionStatus==='completed'?'EXIT RESULTS':'EXIT · SAVE PAUSED'}</button></div></header>
    <div className="single-console-grid">
      <aside className="trial-list simple-trials"><div className="console-title">TRIALS · {Object.values(logs).filter(l=>l.status==='completed').length} / 15 COMPLETE</div>{SEQUENCES[state.sequence].map((ri,i)=><button key={i} className={`${i===state.currentTrial?'active':''} ${logs[String(i)]?.status==='completed'?'done':''}`} onClick={()=>selectTrial(i)}><span>{String(i+1).padStart(2,'0')}</span><b>{REFERENTS[ri].label}</b><small>{logs[String(i)]?.status==='completed'?'✓':logs[String(i)]?.status==='draft'||logs[String(i)]?.status==='paused'?'DRAFT':REFERENTS[ri].tier}</small></button>)}<div className="storage-card"><span>STUDY STORAGE</span><b>{storageState==='offline'?'Local backup active':'Durable autosave active'}</b><small>{savedAt?`Last saved ${new Date(savedAt).toLocaleTimeString()}`:'Waiting for first change'}</small><button onClick={exportSession}>EXPORT JSON</button>{state.screen==='complete'&&<button className="new-participant" onClick={newParticipant}>NEXT PARTICIPANT</button>}</div></aside>
      <section className="study-controls">
        <div className="referent-card"><div className="referent-meta"><span>TASK {String(state.currentTrial+1).padStart(2,'0')} / 15 · TIER {ref.tier}</span><strong>{ref.label}</strong></div><p>Participant prompt: “{ref.prompt}”</p><div className="task-timing"><span>TRIAL TIME</span><b>{formatDuration(trialTime)}</b><small>{state.trialRunning?'RUNNING':log.status==='completed'?'SAVED':'READY'}</small></div></div>
        <div className="workflow-card simplified-workflow"><div className="console-title">TRIAL CONTROL</div><button className="start-trial" disabled={state.trialRunning||log.status==='completed'} onClick={startTrial}>{log.status==='completed'?'TRIAL SAVED':state.trialRunning?'TRIAL IN PROGRESS':'START TRIAL'}</button><button className="primary-trigger" disabled={!state.trialRunning&&log.status!=='running'} onClick={trigger}>TRIGGER RESPONSE</button><p>Selecting a task shows its prompt to the participant. Starting the trial dismisses the prompt and begins timing.</p></div>
        <div className="transport"><button onClick={()=>selectTrial(Math.max(0,state.currentTrial-1))}>← PREVIOUS</button><button disabled={state.sessionStatus==='completed'} onClick={pauseResume}>{state.sessionStatus==='completed'?'SESSION COMPLETE':state.recording?'PAUSE SESSION':'RESUME SESSION'}</button><button className={state.currentTrial===14?'next finish-study':'next'} disabled={state.sessionStatus==='completed'} onClick={saveNext}>{state.sessionStatus==='completed'?'PARTICIPANT COMPLETE':state.currentTrial===14?'COMPLETE PARTICIPANT STUDY ✓':'SAVE + NEXT TRIAL →'}</button></div>
      </section>
      <ObservationPanel log={log} updateLog={updateLog}/>
    </div>
  </main>;
}

function SetupScreen({setup,setSetup,beginStudy,recent,resume,exportStored,storageState}:{setup:{participantId:string;sequence:string;researcherInitials:string};setSetup:(v:{participantId:string;sequence:string;researcherInitials:string})=>void;beginStudy:()=>void;recent:StoredSession[];resume:(id:string)=>void;exportStored:(id:string)=>void;storageState:string}){
  return <main className="researcher-app setup-shell"><header className="researcher-header"><div><b>LATENT FABRIC</b><span>GESTURE STUDY</span></div><div className="session-readout"><span className={`storage-indicator ${storageState}`}>PERSISTENT STUDY STORAGE</span><a href="/" target="_blank">OPEN PARTICIPANT DISPLAY ↗</a></div></header><section className="participant-setup"><div className="setup-intro"><span>NEW PARTICIPANT</span><h1>Start a study session</h1><p>Enter participant details, choose the assigned sequence, then open the participant display on the projected machine.</p></div><div className="setup-form"><Field label="Participant ID" value={setup.participantId} onChange={v=>setSetup({...setup,participantId:String(v)})}/><SelectField label="Counterbalanced sequence" value={setup.sequence} options={['A','B','C','D']} onChange={v=>setSetup({...setup,sequence:v})}/><Field label="Researcher initials" value={setup.researcherInitials} onChange={v=>setSetup({...setup,researcherInitials:String(v)})}/><button disabled={!setup.participantId.trim()} onClick={beginStudy}>BEGIN PARTICIPANT STUDY →</button></div></section><section className="stored-sessions"><div className="console-title">STORED PARTICIPANT SESSIONS</div>{recent.length===0?<div className="no-sessions">No stored sessions yet.</div>:<div className="session-table"><div className="session-row session-head"><span>PARTICIPANT</span><span>SEQUENCE</span><span>STATUS</span><span>STUDY TIME</span><span>UPDATED</span><span>ACTIONS</span></div>{recent.map(s=><div className="session-row" key={s.id}><b>{s.participantId}</b><span>{s.sequence}</span><span className={s.status}>{s.status}</span><span>{formatDuration(s.elapsedMs)}</span><span>{new Date(s.updatedAt).toLocaleString()}</span><div className="session-actions"><button onClick={()=>resume(s.id)}>{s.status==='completed'?'VIEW RESULTS':'RESUME'}</button><button className="export-stored" onClick={()=>exportStored(s.id)}>EXPORT JSON</button></div></div>)}</div>}</section></main>
}

function ObservationPanel({log,updateLog}:{log:TrialLog;updateLog:(k:string,v:string|number|boolean)=>void}){
  return <section className="observation-panel"><div className="console-title">GESTURE OBSERVATION · AUTOSAVED DRAFT</div>
    <fieldset><legend>GESTURE GEOMETRY</legend><div className="two"><SelectField label="Hands" value={log.handCount} options={['One hand','Two hands']} onChange={v=>updateLog('handCount',v)}/><SelectField label="Contact" value={log.contactType} options={['Finger','Multiple fingers','Palm','Whole hand']} onChange={v=>updateLog('contactType',v)}/></div><div className="two"><Field label="Initial region" value={log.initialLocation} onChange={v=>updateLog('initialLocation',v)}/><Field label="Final region" value={log.finalLocation} onChange={v=>updateLog('finalLocation',v)}/></div><div className="two"><SelectField label="Direction" value={log.direction} options={['Left','Right','Forward','Back','Inward','Outward','None']} onChange={v=>updateLog('direction',v)}/><SelectField label="Path shape" value={log.pathShape} options={['Linear','Curved','Circular','Irregular','Stationary']} onChange={v=>updateLog('pathShape',v)}/></div><div className="two"><Field label="Movement distance" value={log.distance} onChange={v=>updateLog('distance',v)}/><Field label="Surface area involved" value={log.surfaceArea} onChange={v=>updateLog('surfaceArea',v)}/></div></fieldset>
    <fieldset><legend>DEFORMATION + TEMPORAL</legend><div className="three"><Field label="Approx. Z depth mm" type="number" value={log.zDepth} onChange={v=>updateLog('zDepth',v)}/><Field label="Max-depth hold s" type="number" value={log.maxDepthDuration} onChange={v=>updateLog('maxDepthDuration',v)}/><SelectField label="Deformation rate" value={log.deformationRate} options={['Slow','Moderate','Fast']} onChange={v=>updateLog('deformationRate',v)}/></div><div className="three"><Field label="Elicitation time s" type="number" value={log.elicitationTime} onChange={v=>updateLog('elicitationTime',v)}/><Field label="Gesture duration s" type="number" value={log.gestureDuration} onChange={v=>updateLog('gestureDuration',v)}/><Field label="Repetitions" type="number" value={log.repetitions} onChange={v=>updateLog('repetitions',v)}/></div><div className="two"><SelectField label="Release pattern" value={log.releasePattern} options={['Immediate','Gradual','Held then release','Repeated']} onChange={v=>updateLog('releasePattern',v)}/><Field label="Hesitation observed" type="checkbox" value={log.hesitation} onChange={v=>updateLog('hesitation',v)}/></div></fieldset>
    <fieldset><legend>BEHAVIOURAL STRUCTURE</legend><div className="two"><SelectField label="Temporal form" value={log.discreteContinuous} options={['Discrete','Continuous']} onChange={v=>updateLog('discreteContinuous',v)}/><SelectField label="Motion" value={log.staticDynamic} options={['Static','Dynamic']} onChange={v=>updateLog('staticDynamic',v)}/><SelectField label="Touch" value={log.singleMultiTouch} options={['Single-touch','Multitouch']} onChange={v=>updateLog('singleMultiTouch',v)}/><SelectField label="Spatial meaning" value={log.spatialNonSpatial} options={['Spatial','Non-spatial']} onChange={v=>updateLog('spatialNonSpatial',v)}/><SelectField label="Modality" value={log.deformationPlanar} options={['Deformation-based','Planar','Mixed']} onChange={v=>updateLog('deformationPlanar',v)}/><SelectField label="Interaction type" value={log.symbolicDirect} options={['Symbolic','Direct manipulation','Mixed']} onChange={v=>updateLog('symbolicDirect',v)}/></div></fieldset>
    <fieldset><legend>RATINGS + NOTES</legend><div className="score-row"><span>NATURALNESS</span>{[1,2,3,4,5].map(n=><button className={Number(log.naturalness)===n?'selected':''} onClick={()=>updateLog('naturalness',n)} key={n}>{n}</button>)}</div><div className="score-row"><span>CONFIDENCE</span>{[1,2,3,4,5].map(n=><button className={Number(log.confidence)===n?'selected':''} onClick={()=>updateLog('confidence',n)} key={n}>{n}</button>)}</div><label className="text-field"><span>Why did the participant choose this action?</span><textarea value={String(log.explanation)} onChange={e=>updateLog('explanation',e.target.value)}/></label><label className="text-field"><span>What did the participant expect the surface to do?</span><textarea value={String(log.expectedResponse)} onChange={e=>updateLog('expectedResponse',e.target.value)}/></label><label className="text-field notes"><span>Researcher notes</span><textarea value={String(log.researcherNotes)} onChange={e=>updateLog('researcherNotes',e.target.value)}/></label></fieldset>
  </section>
}
