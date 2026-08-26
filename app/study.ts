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
  sessionId: string;
  sessionStatus: 'active' | 'paused' | 'completed';
  setupComplete: boolean;
  participantId: string;
  researcherInitials: string;
  sequence: keyof typeof SEQUENCES;
  screen: ScreenMode;
  currentTrial: number;
  response: ResponseKind;
  designIndex: number;
  branch: string;
  anchors: number[];
  locked: string[];
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
  designIndex: 8,
  branch: 'b0',
  anchors: [],
  locked: [],
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
  return `d_${((index * 1103 + 0x8c4) % 0xffff).toString(16).padStart(4, '0')}`;
}
