import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';
import { type ClientMessage, type ServerMessage, cleanCode } from '../src/friends/protocol';
import { handleApi } from './api';
import { Auth, type User } from './auth';
import { Store } from './db';
import { History } from './history';
import { BUY_IN, Room, RoomError, TURN_SECONDS, makeCode } from './room';

/**
 * Hindsight Hold'em server:
 *  - serves the built app from dist/;
 *  - /api/* — accounts and saved game history (SQLite file in DATA_DIR);
 *  - /ws — friends' tables over WebSocket.
 * Every training tab works without it; only Friends and Profile need it.
 *
 *   npm run build && npm run server        # http://localhost:8787
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(HERE, '../dist');
const DATA_DIR = resolve(process.env.DATA_DIR ?? resolve(HERE, '../data'));
const MAX_ROOMS = 500;
const MAX_MESSAGE_BYTES = 4096;
const MAX_MESSAGES_PER_SECOND = 20;
const ROOM_IDLE_MS = 30 * 60 * 1000;

const store = await Store.open(join(DATA_DIR, 'hindsight.sqlite'));
const auth = new Auth(store);
const history = new History(store);
history.closeStaleGames();

const rooms = new Map<string, Room>();
/** Who each socket is logged in as, and which table they're at. */
const sessions = new Map<WebSocket, { user: User | null; room: Room | null; memberId: string | null }>();

/** Saves table activity to the database as it happens. */
const persistence = {
  handFinished(room: Room) {
    if (room.gameId === null) return;
    for (const m of room.members) history.savePlayer(room.gameId, m);
    history.saveHands(room.gameId, room.handsDealt);
  },
  buyIn(room: Room, m: Parameters<History['savePlayer']>[1], kind: 'buy-in' | 'rebuy') {
    if (room.gameId === null) return;
    history.logEvent(room.gameId, m.userId, kind, BUY_IN);
    history.savePlayer(room.gameId, m);
  },
  left(room: Room, m: Parameters<History['savePlayer']>[1]) {
    if (room.gameId === null) return;
    history.logEvent(room.gameId, m.userId, 'leave', m.chips);
    history.savePlayer(room.gameId, m);
  },
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (await handleApi(req, res, url.pathname, auth, history)) return;

  // Static files from dist/, never outside it.
  let requested: string;
  try {
    requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = join(DIST, requested);
  if (!file.startsWith(DIST + sep) && file !== DIST) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Build the app first: npm run build');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.endsWith('sw.js') || file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

const send = (ws: WebSocket, msg: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

function broadcast(room: Room) {
  for (const [ws, s] of sessions) if (s.room === room && s.memberId) send(ws, { t: 'room', room: room.viewFor(s.memberId) });
}

/** A socket that creates or joins another table gives up its previous seat's connection first. */
function release(ws: WebSocket) {
  const s = sessions.get(ws);
  if (!s?.room || !s.memberId) return;
  const { room, memberId } = s;
  s.room = null;
  s.memberId = null;
  if (![...sessions.values()].some((o) => o.room === room && o.memberId === memberId)) room.disconnect(memberId);
  room.refresh();
  broadcast(room);
}

function seat(ws: WebSocket, room: Room) {
  const s = sessions.get(ws)!;
  const member = room.join(s.user!);
  s.room = room;
  s.memberId = member.id;
  send(ws, { t: 'welcome', code: room.code });
  broadcast(room);
}

function handle(ws: WebSocket, msg: ClientMessage) {
  const s = sessions.get(ws)!;
  if (msg.t === 'auth') {
    const user = auth.userForToken(msg.token);
    if (!user) {
      send(ws, { t: 'error', message: 'Your login has expired — please log in again.', reason: 'auth' });
      return;
    }
    s.user = user;
    send(ws, { t: 'authed', username: user.username });
    return;
  }
  if (!s.user) throw new RoomError('Please log in to play with friends.');
  switch (msg.t) {
    case 'create': {
      if (rooms.size >= MAX_ROOMS) throw new RoomError('The server is busy — try again later.');
      release(ws);
      const room = new Room(makeCode((c) => rooms.has(c)), persistence);
      room.gameId = history.startGame(room.code, s.user.id);
      rooms.set(room.code, room);
      seat(ws, room);
      return;
    }
    case 'join': {
      const code = cleanCode(msg.code);
      if (!code) throw new RoomError('That code doesn’t look right — codes are 6 letters and numbers.');
      const room = rooms.get(code);
      if (!room) {
        send(ws, { t: 'error', message: 'No table with that code. Check it, or ask your friend for a new one.', reason: 'no-table' });
        return;
      }
      if (s.room !== room) release(ws);
      seat(ws, room);
      return;
    }
    case 'deal':
    case 'act':
    case 'rebuy':
    case 'leave': {
      if (!s.room || !s.memberId) throw new RoomError('Join a table first.');
      const room = s.room;
      if (msg.t === 'deal') room.deal(s.memberId);
      else if (msg.t === 'act') room.act(s.memberId, Number(msg.hand), msg.action);
      else if (msg.t === 'rebuy') room.rebuy(s.memberId);
      else {
        room.leave(s.memberId);
        s.room = null;
        s.memberId = null;
      }
      broadcast(room);
      return;
    }
    default:
      throw new RoomError('Unknown message.');
  }
}

wss.on('connection', (ws) => {
  sessions.set(ws, { user: null, room: null, memberId: null });
  let windowStart = Date.now();
  let count = 0;
  ws.on('message', (data) => {
    // Simple per-connection rate limit.
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > MAX_MESSAGES_PER_SECOND) return;
    try {
      const msg = JSON.parse(String(data)) as ClientMessage;
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') throw new RoomError('Bad message.');
      handle(ws, msg);
    } catch (err) {
      send(ws, { t: 'error', message: err instanceof RoomError ? err.message : 'Something went wrong with that request.' });
      if (!(err instanceof RoomError)) console.error(err);
    }
  });
  ws.on('close', () => {
    release(ws);
    sessions.delete(ws);
  });
});

// Turn timer, countdown updates, and clean-up of idle tables.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.handRunning) {
      if (now - room.turnStartedAt > TURN_SECONDS * 1000) room.timeOut();
      broadcast(room);
    }
    if (room.empty && now - room.lastActivity() > ROOM_IDLE_MS) {
      if (room.gameId !== null) history.endGame(room.gameId);
      rooms.delete(code);
    }
  }
}, 1000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const room of rooms.values()) if (room.gameId !== null) history.endGame(room.gameId);
    store.flush();
    process.exit(0);
  });
}

http.listen(PORT, () => {
  console.log(`Hindsight Hold'em server on http://localhost:${PORT} (WebSocket at /ws, data in ${DATA_DIR})`);
});
