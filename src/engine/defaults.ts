import type { ElementDef, Settings, ElementKind } from './types';

export const ELEMENT_META: Record<ElementKind, { label: string; glyph: string; tint: string }> = {
  king: { label: 'الملك', glyph: '♛', tint: '#d4a843' },
  knight: { label: 'الفارس', glyph: '♞', tint: '#9db4d6' },
  guard: { label: 'الحارس', glyph: '⛨', tint: '#a8b3a0' },
  artillery: { label: 'المدفعية', glyph: '✹', tint: '#d27b4b' },
  market: { label: 'السوق', glyph: '⚖', tint: '#c9a46a' },
  empty: { label: 'فارغ', glyph: '○', tint: '#8d97a8' },
  custom: { label: 'عنصر', glyph: '◆', tint: '#b08fd8' },
};

export const DEFAULT_ELEMENTS: ElementDef[] = [
  { id: 'king', name: 'الملك', kind: 'king', count: 1, points: 500 },
  { id: 'knight', name: 'الفارس', kind: 'knight', count: 2, points: 250 },
  { id: 'guard', name: 'الحارس', kind: 'guard', count: 3, points: 100 },
  { id: 'artillery', name: 'المدفعية', kind: 'artillery', count: 1, points: 150 },
  { id: 'market', name: 'السوق', kind: 'market', count: 2, points: 200 },
  { id: 'empty', name: 'موقع فارغ', kind: 'empty', count: 6, points: 0 },
];

export const DEFAULT_SETTINGS: Settings = {
  winMode: 'points',
  rounds: 6,
  matchMinutes: 0,
  questionSeconds: 30,
  answerMode: 'host',
  opMode: 'mixed',
  slotCount: 15,
  elements: DEFAULT_ELEMENTS,
  rebuildKing: { enabled: false, required: 3, maxAttempts: 5 },
  noTargetBonus: 100,
  fortressStyle: 'numbered',
  effects: 'full',
  volume: 0.8,
  categories: [],
  difficulty: 'any',
  ageGroup: 'any',
};

export const TEAM_COLORS = ['#2f6fd6', '#c8463d', '#2f9e6a', '#d39b2a', '#8a55c9', '#1fa3a8', '#d0621f', '#6b7a8f'];
export const TEAM_NAMES = ['حصن الشمال', 'حصن الجنوب', 'حصن الشرق', 'حصن الغرب', 'حصن الوادي', 'حصن الساحل', 'حصن الجبل', 'الحصن القديم'];
