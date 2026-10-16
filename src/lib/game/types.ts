export type Level = 1 | 2 | 3;
export type Phase = 'lobby' | 'setup' | 'play' | 'end';
export type Effect = 'king' | 'extra' | 'trap';

export interface ElementDef {
  id: string;
  name: string;
  count: number;
  points: number;
  effect?: Effect;
  /** الفراغ: يملأ بقية الخانات تلقائيًا */
  auto?: boolean;
}

export interface Question {
  id: string;
  c: string; // المجال
  l: Level;
  q: string;
  a: string;
  w: string[]; // خيارات خاطئة
}

export interface CustomQuestion {
  c: string;
  l: Level;
  q: string;
  a: string;
  w: string[];
}

export interface Settings {
  gridSize: number;
  rounds: number;
  timer: number;
  levelMultiplier: boolean;
  elements: ElementDef[];
  categories: string[];
  levels: Level[];
  custom: CustomQuestion[];
}

export interface Team {
  id: string;
  name: string;
  color: string;
  /** رمز دخول جوال الفريق — لا يُرسل لغير المقدم */
  joinCode?: string;
  /** null في عرض الخصوم للخانات غير المضروبة */
  layout: (string | null)[] | null;
  ready: boolean;
  score: number;
  /** رقم الخانة ← معرف الفريق المهاجم */
  hits: Record<number, string>;
  kingDown: boolean;
}

export interface ActiveQuestion {
  id: string;
  c: string;
  l: Level;
  q: string;
  /** null للفرق قبل كشف الإجابة */
  a: string | null;
  options: string[] | null;
}

export type Stage = 'question' | 'answer' | 'aim' | 'result' | 'none';

export interface Current {
  q: ActiveQuestion;
  stage: Stage;
  startedAt: number;
  turnTeam: string;
  attacker: string | null;
  extra: number;
}

export interface Strike {
  id: string;
  at: number;
  attacker: string;
  target: string;
  cell: number;
  el: string;
  points: number;
  mult: number;
  extra: boolean;
}

export interface GameState {
  v: number;
  phase: Phase;
  settings: Settings;
  teams: Team[];
  turn: number;
  round: number;
  current: Current | null;
  lastStrike: Strike | null;
  usedQ: string[];
  log: { at: number; text: string }[];
}

export type Actor = { role: 'host' } | { role: 'team'; teamId: string };

export type Action =
  | { type: 'settings'; gridSize?: number; rounds?: number; timer?: number; levelMultiplier?: boolean; categories?: string[]; levels?: number[]; custom?: CustomQuestion[]; element?: { id: string; count?: number; points?: number }; resetElements?: boolean }
  | { type: 'addTeam' }
  | { type: 'removeTeam'; teamId: string }
  | { type: 'renameTeam'; teamId: string; name?: string; color?: string }
  | { type: 'toSetup' }
  | { type: 'toLobby' }
  | { type: 'setLayout'; teamId: string; layout: string[] | null; ready?: boolean }
  | { type: 'randomLayout'; teamId: string }
  | { type: 'setReady'; teamId: string; ready: boolean }
  | { type: 'start' }
  | { type: 'question'; level?: number }
  | { type: 'reveal' }
  | { type: 'judge'; teamId: string | null }
  | { type: 'strike'; target: string; cell: number }
  | { type: 'extraShot' }
  | { type: 'next' }
  | { type: 'adjustScore'; teamId: string; delta: number }
  | { type: 'end' }
  | { type: 'restart' };
