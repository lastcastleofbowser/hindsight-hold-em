import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerAction } from '../engine/game';
import type { ClientMessage, RoomView, ServerMessage } from '../friends/protocol';

export type Connection = 'idle' | 'connecting' | 'connected' | 'unreachable';

/** The table this tab is sitting at, so a reload or dropped connection rejoins it. */
const TABLE_KEY = 'hindsight-holdem.friends-table.v1';

function savedTable(): string | null {
  try {
    return sessionStorage.getItem(TABLE_KEY);
  } catch {
    return null;
  }
}

function saveTable(code: string | null) {
  try {
    if (code) sessionStorage.setItem(TABLE_KEY, code);
    else sessionStorage.removeItem(TABLE_KEY);
  } catch {
    // Non-fatal: a reload just won't rejoin automatically.
  }
}

const serverUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * Connection to the friends server for a logged-in user. Connects while the
 * Friends tab is open (or while seated at a table), authenticates with the
 * session token, reconnects with back-off and rejoins the same table.
 */
export function useFriends(enabled: boolean, token: string | null, onAuthExpired: () => void) {
  const [connection, setConnection] = useState<Connection>('idle');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const table = useRef<string | null>(savedTable());
  const [seated, setSeated] = useState(!!table.current);
  const retry = useRef(0);
  const shouldConnect = (enabled || seated) && !!token;

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else setError('Not connected to the game server yet.');
  }, []);

  useEffect(() => {
    if (!shouldConnect || !token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setConnection((c) => (c === 'connected' ? c : 'connecting'));
      const socket = new WebSocket(serverUrl());
      ws.current = socket;
      socket.onopen = () => {
        retry.current = 0;
        socket.send(JSON.stringify({ t: 'auth', token } satisfies ClientMessage));
      };
      socket.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        if (msg.t === 'authed') {
          setConnection('connected');
          setError(null);
          if (table.current) socket.send(JSON.stringify({ t: 'join', code: table.current } satisfies ClientMessage));
        } else if (msg.t === 'welcome') {
          table.current = msg.code;
          saveTable(msg.code);
          setSeated(true);
        } else if (msg.t === 'room') {
          setRoom(msg.room);
        } else if (msg.t === 'error') {
          if (msg.reason === 'auth') {
            onAuthExpired();
            return;
          }
          if (msg.reason === 'no-table' && table.current) {
            // The table we were at is gone (server restarted, or it expired).
            table.current = null;
            saveTable(null);
            setSeated(false);
            setRoom(null);
          }
          setError(msg.message);
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        setConnection(retry.current >= 2 ? 'unreachable' : 'connecting');
        const delay = Math.min(10000, 1000 * 2 ** retry.current++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws.current?.close();
      ws.current = null;
      setConnection('idle');
    };
  }, [shouldConnect, token, onAuthExpired]);

  const create = useCallback(() => send({ t: 'create' }), [send]);
  const join = useCallback((code: string) => send({ t: 'join', code }), [send]);
  const leave = useCallback(() => {
    send({ t: 'leave' });
    table.current = null;
    saveTable(null);
    setRoom(null);
    setSeated(false);
  }, [send]);
  const deal = useCallback(() => send({ t: 'deal' }), [send]);
  const rebuy = useCallback(() => send({ t: 'rebuy' }), [send]);
  const act = useCallback((hand: number, action: PlayerAction) => send({ t: 'act', hand, action }), [send]);

  return { connection, room, error, clearError: () => setError(null), create, join, leave, deal, rebuy, act };
}
