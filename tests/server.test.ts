import { describe, it, expect } from 'vitest';
import { RoomService } from '../server/rooms';
import { MemoryStore } from '../server/memory';
import { handle } from '../server/http';
import type { MatchState } from '../src/engine/types';

function svc() {
  const store = new MemoryStore();
  const published: MatchState[] = [];
  return { store, published, s: new RoomService(store, { publish: async (st) => void published.push(st) }) };
}

describe('خادم الغرف', () => {
  it('ينشئ غرفة ويعطي المقدم رمزه', async () => {
    const { s } = svc();
    const r = await s.create({ teams: 3 });
    expect(r.roomCode).toHaveLength(6);
    expect(r.view.kind).toBe('host');
  });
  it('الجمهور بلا رموز لا يرى أسرارًا ولا يستطيع الأوامر', async () => {
    const { s } = svc();
    const r = await s.create({});
    const v = await s.view(r.roomCode, {});
    expect(v.view.kind).toBe('audience');
    expect(JSON.stringify(v.view)).not.toContain(r.hostToken);
    await expect(s.command(r.roomCode, {}, { requestId: 'x', command: { type: 'START_MATCH' } })).rejects.toThrow();
  });
  it('رمز خاطئ يُرفض', async () => {
    const { s } = svc();
    const r = await s.create({});
    await expect(s.view(r.roomCode, { hostToken: 'nope' })).rejects.toThrow('رمز الدخول');
  });
  it('الفريق ينضم برمز الغرفة ورمزه ويتلقى حصنه فقط', async () => {
    const { s, store } = svc();
    const r = await s.create({});
    const st = (await store.get(r.roomCode))!;
    const v = await s.view(r.roomCode, { roomCode: r.roomCode, pin: st.teams[1].pin });
    expect(v.view.kind).toBe('team');
    expect((v.view as any).me.id).toBe(st.teams[1].id);
    expect(v.topic).toContain(st.teams[1].token);
  });
  it('ينشر بعد كل أمر ناجح، والطلب المكرر لا يُنشر مرتين', async () => {
    const { s, published } = svc();
    const r = await s.create({});
    await s.command(r.roomCode, { hostToken: r.hostToken }, { requestId: 'a1', command: { type: 'START_MATCH' } });
    await s.command(r.roomCode, { hostToken: r.hostToken }, { requestId: 'a1', command: { type: 'START_MATCH' } });
    expect(published).toHaveLength(1);
  });
  it('معالج HTTP يعيد أخطاء مفهومة', async () => {
    const { s } = svc();
    const res = await handle(s, { method: 'POST', path: '/api/view', query: {}, body: { roomCode: 'ZZZZZZ' } });
    expect(res.status).toBe(404);
  });
});
