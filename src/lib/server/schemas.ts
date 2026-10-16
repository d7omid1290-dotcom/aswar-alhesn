import { z } from 'zod';
import type { Action } from '@/lib/game/types';

const id = z.string().min(1).max(40);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const custom = z.object({ c: z.string().max(60), l: level, q: z.string().min(1).max(400), a: z.string().min(1).max(200), w: z.array(z.string().max(200)).max(5) });

/** التحقق من كل حركة قادمة من المتصفح قبل تمريرها لمحرك اللعبة */
export const actionSchema: z.ZodType<Action> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('settings'),
    gridSize: z.number().int().optional(), rounds: z.number().int().optional(), timer: z.number().int().optional(),
    levelMultiplier: z.boolean().optional(), categories: z.array(z.string().max(60)).max(50).optional(),
    levels: z.array(z.number().int()).max(3).optional(), custom: z.array(custom).max(500).optional(),
    element: z.object({ id, count: z.number().int().optional(), points: z.number().int().optional() }).optional(),
    resetElements: z.boolean().optional(),
  }),
  z.object({ type: z.literal('addTeam') }),
  z.object({ type: z.literal('removeTeam'), teamId: id }),
  z.object({ type: z.literal('renameTeam'), teamId: id, name: z.string().max(40).optional(), color: z.string().max(7).optional() }),
  z.object({ type: z.literal('toSetup') }),
  z.object({ type: z.literal('toLobby') }),
  z.object({ type: z.literal('setLayout'), teamId: id, layout: z.array(id).max(64).nullable(), ready: z.boolean().optional() }),
  z.object({ type: z.literal('randomLayout'), teamId: id }),
  z.object({ type: z.literal('setReady'), teamId: id, ready: z.boolean() }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('question'), level: z.number().int().min(0).max(3).optional() }),
  z.object({ type: z.literal('reveal') }),
  z.object({ type: z.literal('judge'), teamId: id.nullable() }),
  z.object({ type: z.literal('strike'), target: id, cell: z.number().int().min(0).max(63) }),
  z.object({ type: z.literal('extraShot') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('adjustScore'), teamId: id, delta: z.number().int().min(-1000).max(1000) }),
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('restart') }),
]) as z.ZodType<Action>;
