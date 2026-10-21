import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerAction } from '../engine/game';
import type { ClientMessage, RoomView, ServerMessage } from '../friends/protocol';

export type Connection = 'idle' | 'connecting' | 'connected' | 'unreachable';

const SESSION_KEY = 'hindsight-holdem.friends-session.v1';

interface SavedSession {
  code: string;
  name: string;
  token: string;
}

function loadSession(): SavedSession | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveSession(s: SavedSession | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Non-fatal: a page reload just won't rejoin automatically.
  }
}

const serverUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * Connection to the friends server. Connects only while the Friends tab is
 * in use, reconnects with back-off, and rejoins the same seat after a drop
 * or a page reload (using the seat token the server issued).
 */
export function useFriends(enabled: boolean) {
  const [connection, setConnection] = useState<Connection>('idle');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const session = useRef<SavedSession | null>(loadSession());
  const pendingName = useRef('');
  const retry = useRef(0);
  // Stay connected while seated at a table, even when the tab isn't visible.
  const [seated, setSeated] = useState(!!session.current);
  const shouldConnect = enabled || seated;

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else setError('Not connected to the game server yet.');
  }, []);

  useEffect(() => {
    if (!shouldConnect) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setConnection((c) => (c === 'connected' ? c : 'connecting'));
      const socket = new WebSocket(serverUrl());
      ws.current = socket;
      socket.onopen = () => {
        retry.current = 0;
        setConnection('connected');
        setError(null);
        const s = session.current;
        if (s) socket.send(JSON.stringify({ t: 'join', code: s.code, name: s.name, token: s.token } satisfies ClientMessage));
      };
      socket.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        if (msg.t === 'welcome') {
          const name = session.current?.name ?? pendingName.current;
          session.current = { code: msg.code, token: msg.token, name };
          saveSession(session.current);
          setSeated(true);
        } else if (msg.t === 'room') {
          setRoom(msg.room);
        } else if (msg.t === 'error') {
          setError(msg.message);
          // A saved seat that no longer exists (server restarted, table expired).
          if (/No table with that code/.test(msg.message)) {
            session.current = null;
            saveSession(null);
          }
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
  }, [shouldConnect]);

  const create = useCallback(
    (name: string) => {
      pendingName.current = name;
      session.current = null;
      send({ t: 'create', name });
    },
    [send],
  );
  const join = useCallback(
    (code: string, name: string) => {
      pendingName.current = name;
      session.current = null;
      send({ t: 'join', code, name });
    },
    [send],
  );
  const leave = useCallback(() => {
    send({ t: 'leave' });
    session.current = null;
    saveSession(null);
    setRoom(null);
    setSeated(false);
  }, [send]);
  const deal = useCallback(() => send({ t: 'deal' }), [send]);
  const act = useCallback((hand: number, action: PlayerAction) => send({ t: 'act', hand, action }), [send]);

  return { connection, room, error, clearError: () => setError(null), create, join, leave, deal, act };
}
