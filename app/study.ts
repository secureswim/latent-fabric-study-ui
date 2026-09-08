import { movePosition } from './latent-position';

export type ScreenMode =
  | 'welcome' | 'familiarization' | 'practice' | 'trial' | 'captured'
  | 'responding' | 'response-complete' | 'question-why' | 'question-expect'
  | 'rating-naturalness' | 'rating-confidence' | 'interview' | 'complete';

export type ResponseKind =
  | 'idle' | 'navigate' | 'broad' | 'local' | 'zoom-out' | 'anchor'
  | 'return-anchor' | 'branch' | 'lock' | 'unlock' | 'undo' | 'compare'
  | 'reset' | 'history' | 'timeline-branch' | 'select' | 'uncertain';

export type Referent = {
  id: string;
  label: string;
  tier: 'A' | 'B';
  prompt: string;
};

export type LatentSnapshot = {
  viewScale?: number;
  branchHeads?: Record<string,number>;
  lockedDesignIndex?: number;
  designIndex: number;
  branch: string;
  anchors: number[];
  locked: string[];
  visitedDesigns: number[];
};

export const REFERENTS: Referent[] = [
  { id: 'navigate', label: 'Navigate', tier: 'A', prompt: 'Move through the possibilities in a direction that feels right to you.' },
  { id: 'explore-broadly', label: 'Explore More Broadly', tier: 'A', prompt: 'You want to move away from designs like this and discover substantially different possibilities.' },
  { id: 'refine-locally', label: 'Refine Locally', tier: 'A', prompt: 'You like this direction. Explore possibilities that remain only slightly different from this design.' },
  { id: 'zoom-out', label: 'Zoom Out', tier: 'A', prompt: 'You have been focusing on a small group of possibilities. Broaden the scope of what you can explore.' },
  { id: 'anchor', label: 'Anchor', tier: 'A', prompt: 'Keep this design in a way that would let you return to it later, without ending your exploration.' },
  { id: 'return-anchor', label: 'Return to Anchor', tier: 'A', prompt: 'Return to the design you preserved earlier.' },
  { id: 'branch', label: 'Branch From Anchor', tier: 'A', prompt: 'From the design you saved earlier, begin exploring a different direction while keeping what you explored before.' },
  { id: 'lock', label: 'Lock / Preserve a Part', tier: 'A', prompt: 'Keep one part of this design unchanged while you continue exploring changes to the rest.' },
  { id: 'select', label: 'Final Select', tier: 'A', prompt: 'You are satisfied with this design and want to choose it as your outcome.' },
  { id: 'undo', label: 'Undo Immediate Move', tier: 'B', prompt: 'The most recent change was not what you wanted. Return to the design immediately before it.' },
  { id: 'unlock', label: 'Unlock Component', tier: 'B', prompt: 'The part you preserved earlier may now change again with the rest of the design.' },
  { id: 'compare', label: 'Compare Two Anchors', tier: 'B', prompt: 'Look at two designs you preserved earlier so you can compare them directly.' },
  { id: 'reset', label: 'Reset to Starting State', tier: 'B', prompt: 'Return the entire exploration to where it began.' },
  { id: 'history', label: 'Open Timeline / History', tier: 'B', prompt: 'Review the sequence of designs you have visited so far.' },
  { id: 'switch-branch', label: 'Switch Timeline / Branch', tier: 'B', prompt: 'Continue from a different exploration path that you created earlier.' },
];

const A = REFERENTS.map((_, i) => i);
export const SEQUENCES: Record<string, number[]> = {
  A,
  B: [2, 0, 4, 1, 7, 5, 3, 6, 8, 9, 11, 10, 13, 12, 14],
  C: [1, 3, 0, 2, 4, 7, 6, 5, 8, 12, 9, 13, 10, 11, 14],
  D: [0, 4, 2, 7, 1, 5, 6, 3, 8, 14, 13, 11, 9, 10, 12],
};

export type StudyState = {
  viewScale?: number;
  branchHeads?: Record<string,number>;
  lockedDesignIndex?: number;
  explorationRevision?: number;
  sessionId: string;
  sessionStatus: 'active' | 'paused' | 'completed';
  setupComplete: boolean;
  participantId: string;
  researcherInitials: string;
  sequence: keyof typeof SEQUENCES;
  screen: ScreenMode;
  currentTrial: number;
  response: ResponseKind;
  animationId: string;
  responsePhase: 'idle' | 'queued' | 'running' | 'complete';
  responseStartedAt: number;
  responseDurationMs: number;
  responseCompletedAt: number;
  responseFrom: LatentSnapshot;
  responseTarget: LatentSnapshot;
  previousDesignIndex: number;
  designIndex: number;
  branch: string;
  anchors: number[];
  locked: string[];
  visitedDesigns: number[];
  recording: boolean;
  sessionStartedAt: number;
  sessionAccumulatedMs: number;
  sessionRunStartedAt: number;
  trialStartedAt: number;
  trialAccumulatedMs: number;
  trialRunning: boolean;
  overlayVisible: boolean;
  studyNeutralMode: boolean;
};

export const DEFAULT_STATE: StudyState = {
  sessionId: '',
  sessionStatus: 'paused',
  setupComplete: false,
  participantId: 'P07',
  researcherInitials: '',
  sequence: 'A',
  screen: 'welcome',
  currentTrial: 0,
  response: 'idle',
  animationId: '',
  responsePhase: 'idle',
  responseStartedAt: 0,
  responseDurationMs: 2800,
  responseCompletedAt: 0,
  responseFrom: { designIndex: 8, branch: 'b0', anchors: [], locked: [], visitedDesigns: [8] },
  responseTarget: { designIndex: 8, branch: 'b0', anchors: [], locked: [], visitedDesigns: [8] },
  previousDesignIndex: 8,
  designIndex: 8,
  branch: 'b0',
  anchors: [],
  locked: [],
  visitedDesigns: [8],
  recording: false,
  // Keep the server-rendered and first client-rendered snapshots identical.
  // The researcher console assigns the real start time after hydration.
  sessionStartedAt: 0,
  sessionAccumulatedMs: 0,
  sessionRunStartedAt: 0,
  trialStartedAt: 0,
  trialAccumulatedMs: 0,
  trialRunning: false,
  overlayVisible: true,
  studyNeutralMode: true,
};

export const STORAGE_KEY = 'latent-fabric-study-state-v1';
export const LOG_KEY = 'latent-fabric-trial-logs-v1';
export const CHANNEL_NAME = 'latent-fabric-study-channel';

export function currentReferent(state: StudyState): Referent {
  const order = SEQUENCES[state.sequence] || SEQUENCES.A;
  return REFERENTS[order[state.currentTrial] ?? 0];
}

export function designId(index: number) {
  if (index >= 1_000_000) return `p_${index.toString(36)}`;
  return `d_${((index * 1103 + 0x8c4) % 0xffff).toString(16).padStart(4, '0')}`;
}

export function latentSnapshot(s: StudyState): LatentSnapshot {
  return {designIndex:s.designIndex,branch:s.branch,anchors:[...s.anchors],locked:[...s.locked],visitedDesigns:[...(s.visitedDesigns||[s.designIndex])],viewScale:s.viewScale||1,branchHeads:{...(s.branchHeads||{}),[s.branch]:s.designIndex},lockedDesignIndex:s.lockedDesignIndex};
}

export function responseTarget(s: StudyState, response: ResponseKind): LatentSnapshot {
  const target = latentSnapshot(s);
  const id = s.designIndex;
  if (response === 'anchor' && !target.anchors.includes(id)) target.anchors.push(id);
  if (response === 'return-anchor' && target.anchors.length) target.designIndex = target.anchors.at(-1)!;
  if (response === 'lock' && !target.locked.includes('Backrest')) {target.locked.push('Backrest');target.lockedDesignIndex=id;}
  if (response === 'unlock') {target.locked=[];target.lockedDesignIndex=undefined;}
  if (response === 'branch' && target.anchors.length) {
    target.branch=`b${Math.max(0,...Object.keys(target.branchHeads!).map(key=>Number(key.slice(1))||0))+1}`;
    target.designIndex=target.anchors.at(-1)!;
  }
  if (response === 'reset') {target.designIndex=8;target.branch='b0';target.anchors=[];target.locked=[];target.lockedDesignIndex=undefined;target.viewScale=1;target.branchHeads={b0:8};target.visitedDesigns=[8];}
  if (response === 'undo' && target.visitedDesigns.length>1) {target.visitedDesigns.pop();target.designIndex=target.visitedDesigns.at(-1)!;}
  if (response === 'timeline-branch') {const other=Object.keys(target.branchHeads!).filter(key=>key!==s.branch).at(-1);if(other){target.branch=other;target.designIndex=target.branchHeads![other];}}
  if (response === 'broad' || response === 'zoom-out') target.viewScale=Math.max(.65,(s.viewScale||1)*.65);
  if (response === 'local') target.viewScale=Math.min(3,(s.viewScale||1)*1.5);
  // Navigation confirms the location chosen by the participant; it never adds
  // an arbitrary displacement after they finish moving.
  if(target.designIndex!==id&&target.visitedDesigns.at(-1)!==target.designIndex) target.visitedDesigns.push(target.designIndex);
  target.branchHeads![target.branch]=target.designIndex;
  return target;
}

// Trials are never blocked. When a referent depends on state the participant
// has not produced yet (an anchor, a second anchor, another branch, an earlier
// position), the missing piece is synthesised so the response can still play.
const PLACEHOLDER_STEPS:[number,number][]=[[-.07,.05],[.08,-.04],[-.05,-.08],[.06,.09]];

export function withPrerequisites(s:StudyState):StudyState {
  const id=currentReferent(s).id;
  const anchors=[...s.anchors];
  const locked=[...s.locked];
  const visitedDesigns=[...(s.visitedDesigns||[s.designIndex])];
  const branchHeads={...(s.branchHeads||{}),[s.branch]:s.designIndex};
  // Prefer somewhere the participant actually went; fall back to a nearby point.
  const earlier=visitedDesigns.filter(position=>position!==s.designIndex);
  let derived=0;
  const fresh=(exclude:number[]):number=>{
    while(earlier.length){const candidate=earlier.pop()!;if(!exclude.includes(candidate))return candidate}
    for(let attempt=0;attempt<PLACEHOLDER_STEPS.length;attempt++){
      const [dx,dy]=PLACEHOLDER_STEPS[derived++%PLACEHOLDER_STEPS.length];
      const candidate=movePosition(s.designIndex,dx,dy,derived);
      if(!exclude.includes(candidate))return candidate;
    }
    return movePosition(s.designIndex,.11,-.11,derived+1);
  };
  if(['return-anchor','branch'].includes(id)&&!anchors.length)anchors.push(fresh([s.designIndex]));
  if(id==='compare')while(anchors.length<2)anchors.push(fresh([...anchors]));
  if(id==='undo'&&visitedDesigns.length<2)visitedDesigns.unshift(fresh([s.designIndex]));
  // A history replay of a single point shows nothing; give it a path to trace.
  if(id==='history')while(visitedDesigns.length<3)visitedDesigns.unshift(fresh(visitedDesigns));
  // Releasing a constraint that was never applied is invisible; apply one.
  if(id==='unlock'&&!locked.length)locked.push('Backrest');
  if(id==='switch-branch'&&Object.keys(branchHeads).filter(key=>key!==s.branch).length===0){
    const name=`b${Math.max(0,...Object.keys(branchHeads).map(key=>Number(key.slice(1))||0))+1}`;
    branchHeads[name]=anchors.at(-1)??fresh([s.designIndex]);
  }
  const lockedDesignIndex=id==='unlock'&&!s.locked.length?s.designIndex:s.lockedDesignIndex;
  return {...s,anchors,locked,lockedDesignIndex,visitedDesigns,branchHeads};
}

// Informational only -- the console shows this, it never disables the trigger.
export function prerequisiteNote(s:StudyState):string {
  const id=currentReferent(s).id;
  if(['return-anchor','branch'].includes(id)&&!s.anchors.length)return 'No anchor saved yet — one will be created for this response.';
  if(id==='compare'&&s.anchors.length<2)return `Comparison needs two anchors — ${2-s.anchors.length} will be created.`;
  if(id==='switch-branch'&&Object.keys(s.branchHeads||{}).filter(key=>key!==s.branch).length===0)return 'No second path yet — one will be created to switch to.';
  if(id==='undo'&&(s.visitedDesigns||[]).length<2)return 'No earlier position yet — one will be created to step back to.';
  if(id==='history'&&(s.visitedDesigns||[]).length<3)return 'Short history — extra visited positions will be created to replay.';
  if(id==='unlock'&&!s.locked.length)return 'Nothing locked yet — a lock will be applied so it can be released.';
  return '';
}
