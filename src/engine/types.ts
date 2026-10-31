// ───────────── أنواع محرك «أسوار الحصن» ─────────────
// المحرك نقي بلا أي اعتماد على الواجهة أو الشبكة، ويعمل في المتصفح (الوضع المحلي) وعلى الخادم.

export type ElementKind = 'king' | 'knight' | 'guard' | 'artillery' | 'market' | 'empty' | 'custom';

export interface ElementDef {
  id: string;
  name: string;
  kind: ElementKind;
  count: number;
  points: number;
}

export type WinMode = 'points' | 'king';
export type AnswerMode = 'host' | 'mobile';
export type OpMode = 'host' | 'teams' | 'mixed';
export type FortressStyle = 'numbered' | 'hiddenNumbers';
export type EffectsLevel = 'full' | 'reduced' | 'off';

export interface Settings {
  winMode: WinMode;
  rounds: number; // عدد الجولات (كل جولة = دور لكل فريق نشط)
  matchMinutes: number; // 0 = بلا حد زمني
  questionSeconds: number;
  answerMode: AnswerMode;
  opMode: OpMode;
  slotCount: number;
  elements: ElementDef[];
  rebuildKing: { enabled: boolean; required: number; maxAttempts: number };
  noTargetBonus: number; // مكافأة إن لم يتبق هدف صالح
  fortressStyle: FortressStyle;
  effects: EffectsLevel;
  volume: number; // 0..1
  categories: string[]; // فارغ = الكل
  difficulty: 'any' | 'easy' | 'medium' | 'hard';
  ageGroup: 'any' | 'kids' | 'teens' | 'adults';
}

export type QuestionType = 'mcq' | 'tf' | 'short' | 'oral';
export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[]; // mcq
  answer: string; // mcq: نص الخيار الصحيح؛ tf: "صح" | "خطأ"؛ short: الإجابة (يُقبل بدائل مفصولة بـ |)
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  age: 'kids' | 'teens' | 'adults' | 'all';
}

export interface Hit {
  element: string; // ElementDef.id
  kind: ElementKind;
  points: number;
  by: string; // team id
  at: number;
  visualSlot: number; // موضع الإصابة المرئي في القلعة (0-based)
}

export interface Team {
  id: string;
  name: string;
  color: string;
  token: string; // سر الانضمام (في رابط QR)
  pin: string; // رمز يدوي من 4 أرقام
  fortress: (string | null)[]; // سري: لكل رقم (0-based) معرف العنصر
  locked: boolean;
  hits: Record<number, Hit>;
  score: number;
  kingDown: boolean;
  eliminated: boolean;
  rebuild: { active: boolean; progress: number; attempts: number };
  connected?: boolean;
}

export type Phase = 'lobby' | 'playing' | 'ended';

export interface Attempt {
  id: string;
  teamId: string;
  questionId: string;
  mode: AnswerMode;
  startedAt: number;
  deadline: number;
  submitted?: { answer: string; at: number; correct: boolean | null };
  result?: 'correct' | 'wrong' | 'timeout';
  purpose: 'attack' | 'rebuild';
}

export interface AttackRight {
  teamId: string;
  token: string;
  grantedAt: number;
}

export interface StrikeRecord {
  id: string;
  attacker: string;
  target: string;
  slot: number;
  visualSlot: number;
  element: string;
  kind: ElementKind;
  points: number;
  kingFell: boolean;
  eliminated: boolean;
  at: number;
}

export interface LogEntry {
  at: number;
  type: string;
  text: string;
  actor: 'host' | string;
  publicVisible: boolean;
}

export interface MatchState {
  version: number;
  roomCode: string;
  hostToken: string;
  createdAt: number;
  settings: Settings;
  pendingAnswerMode: AnswerMode | null;
  teams: Team[];
  phase: Phase;
  paused: boolean;
  pausedAt: number | null;
  startedAt: number | null;
  round: number;
  turnOrder: string[];
  turnIndex: number;
  attempt: Attempt | null;
  attackRight: AttackRight | null;
  lastStrike: StrikeRecord | null;
  strikes: StrikeRecord[];
  usedQuestions: string[];
  questions: Question[];
  log: LogEntry[];
  processed: string[]; // معرّفات الطلبات المنفذة (منع التكرار)
  winnerIds: string[];
}

export type Actor = { role: 'host' } | { role: 'team'; teamId: string } | { role: 'audience' };

export type Command =
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'ADD_TEAM'; name: string; color: string }
  | { type: 'EDIT_TEAM'; teamId: string; name?: string; color?: string }
  | { type: 'REMOVE_TEAM'; teamId: string }
  | { type: 'SET_FORTRESS'; teamId: string; fortress: (string | null)[]; reason?: string }
  | { type: 'RANDOMIZE_FORTRESS'; teamId: string }
  | { type: 'LOCK_FORTRESS'; teamId: string; locked: boolean }
  | { type: 'START_MATCH' }
  | { type: 'ASK_QUESTION'; questionId?: string }
  | { type: 'SUBMIT_ANSWER'; attemptId: string; answer: string }
  | { type: 'JUDGE_ANSWER'; attemptId: string; correct: boolean }
  | { type: 'TIMEOUT'; attemptId: string }
  | { type: 'STRIKE'; targetId: string; slot: number; rightToken: string }
  | { type: 'SKIP_TURN' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ADJUST_SCORE'; teamId: string; delta: number; reason: string }
  | { type: 'SET_ANSWER_MODE'; mode: AnswerMode; immediate: boolean }
  | { type: 'SET_QUESTIONS'; questions: Question[] }
  | { type: 'END_MATCH' }
  | { type: 'RESET_TO_LOBBY' }
  | { type: 'HEARTBEAT'; teamId: string };

export interface Envelope {
  requestId: string;
  command: Command;
}

export type EngineResult =
  | { ok: true; state: MatchState; strike?: StrikeRecord }
  | { ok: false; error: string };

// ───── العروض المرسلة إلى كل دور (لا تحمل أسرارًا لا تخصه) ─────
export interface PublicTeam {
  id: string;
  name: string;
  color: string;
  locked: boolean;
  hits: Record<number, Hit>;
  score: number;
  kingDown: boolean;
  eliminated: boolean;
  rebuild: { active: boolean; progress: number; attempts: number };
  connected?: boolean;
}

export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  category: string;
  difficulty: Question['difficulty'];
  answer?: string; // يظهر فقط بعد حسم المحاولة
}

export interface PublicView {
  kind: 'audience' | 'team' | 'host';
  version: number;
  roomCode: string;
  settings: Settings;
  pendingAnswerMode: AnswerMode | null;
  teams: PublicTeam[];
  phase: Phase;
  paused: boolean;
  startedAt: number | null;
  pausedAt: number | null;
  round: number;
  turnOrder: string[];
  turnIndex: number;
  attempt: (Omit<Attempt, 'submitted'> & { submitted?: { at: number; correct: boolean | null; answer?: string } }) | null;
  question: PublicQuestion | null;
  attackTeamId: string | null;
  lastStrike: StrikeRecord | null;
  strikes: StrikeRecord[];
  log: LogEntry[];
  winnerIds: string[];
  /** في نمط «الأرقام المخفية»: العنصر الظاهر في كل موضع مرئي (عام لأنه مشتق من الأعداد فقط) */
  publicLayout: string[] | null;
  /** بعد نهاية المباراة فقط: كل الحصون مكشوفة */
  revealed: Record<string, (string | null)[]> | null;
}

export interface TeamView extends PublicView {
  kind: 'team';
  me: { id: string; fortress: (string | null)[]; rightToken: string | null };
}

export interface HostView extends PublicView {
  kind: 'host';
  full: MatchState;
}

export type AnyView = PublicView | TeamView | HostView;
