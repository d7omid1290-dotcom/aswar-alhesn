'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Actor, GameState } from '@/lib/game/types';
import { connectLocal, connectOnline, type RoomConn } from './room';
import { toast } from '@/components/game/toaster';

export type Target = { mode: 'local' } | { mode: 'online'; code: string; key: string };
export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'denied' | 'local';

export function useRoom(target: Target | null) {
  const [state, setState] = useState<GameState | null>(null);
  const [me, setMe] = useState<Actor | null>(null);
  const [status, setStatus] = useState<NetStatus>('connecting');
  const conn = useRef<RoomConn | null>(null);
  const tkey = target ? (target.mode === 'local' ? 'local' : `${target.code}:${target.key}`) : '';

  useEffect(() => {
    if (!target) return;
    const onState = (s: GameState, a: Actor) => { setState(s); setMe(a); };
    if (target.mode === 'local') { conn.current = connectLocal(onState); setStatus('local'); }
    else conn.current = connectOnline(target.code, target.key, onState, setStatus);
    return () => { conn.current?.close(); conn.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tkey]);

  const send = useCallback(async (a: Action) => {
    const r = (await conn.current?.send(a)) ?? { error: 'غير متصل' };
    if (r.error) toast(r.error, 'error');
    return r;
  }, []);

  return { state, me, status, send };
}
