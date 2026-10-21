import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';
import { type ClientMessage, type ServerMessage, cleanCode, cleanName } from '../src/friends/protocol';
import { Room, RoomError, TURN_SECONDS, makeCode } from './room';

/**
 * Hindsight Hold'em friends server: serves the built app from dist/ and runs
 * friends' tables over a WebSocket at /ws. Everything else in the app works
 * without it — only the Friends tab needs this server (and the internet).
 *
 *   npm run build && npm run server        # http://localhost:8787
 */

const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist');
const MAX_ROOMS = 500;
const MAX_MESSAGE_BYTES = 4096;
const MAX_MESSAGES_PER_SECOND = 20;
const ROOM_IDLE_MS = 30 * 60 * 1000;

const rooms = new Map<string, Room>();
/** Which room and member each socket belongs to. */
const sessions = new Map<WebSocket, { room: Room; memberId: string }>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
};

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
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
  for (const [ws, s] of sessions) if (s.room === room) send(ws, { t: 'room', room: room.viewFor(s.memberId) });
}

/** A socket that creates or joins again gives up its previous seat first. */
function release(ws: WebSocket) {
  const s = sessions.get(ws);
  if (!s) return;
  sessions.delete(ws);
  s.room.disconnect(s.memberId);
  s.room.refresh();
  broadcast(s.room);
}

function handle(ws: WebSocket, msg: ClientMessage) {
  const session = sessions.get(ws);
  if (msg.t === 'create' || msg.t === 'join') release(ws);
  switch (msg.t) {
    case 'create': {
      const name = cleanName(msg.name);
      if (!name) throw new RoomError('Enter a name (up to 16 characters).');
      if (rooms.size >= MAX_ROOMS) throw new RoomError('The server is busy — try again later.');
      const room = new Room(makeCode((c) => rooms.has(c)));
      rooms.set(room.code, room);
      const member = room.join(name);
      sessions.set(ws, { room, memberId: member.id });
      send(ws, { t: 'welcome', code: room.code, memberId: member.id, token: member.token });
      broadcast(room);
      return;
    }
    case 'join': {
      const name = cleanName(msg.name);
      const code = cleanCode(msg.code);
      if (!name) throw new RoomError('Enter a name (up to 16 characters).');
      if (!code) throw new RoomError('That code doesn’t look right — codes are 6 letters and numbers.');
      const room = rooms.get(code);
      if (!room) throw new RoomError('No table with that code. Check it, or ask your friend for a new one.');
      const member = room.join(name, typeof msg.token === 'string' ? msg.token : undefined);
      sessions.set(ws, { room, memberId: member.id });
      send(ws, { t: 'welcome', code: room.code, memberId: member.id, token: member.token });
      broadcast(room);
      return;
    }
    case 'deal':
      if (!session) throw new RoomError('Join a table first.');
      session.room.deal(session.memberId);
      broadcast(session.room);
      return;
    case 'act':
      if (!session) throw new RoomError('Join a table first.');
      session.room.act(session.memberId, Number(msg.hand), msg.action);
      broadcast(session.room);
      return;
    case 'leave':
      if (!session) return;
      session.room.leave(session.memberId);
      sessions.delete(ws);
      session.room.refresh();
      broadcast(session.room);
      return;
    default:
      throw new RoomError('Unknown message.');
  }
}

wss.on('connection', (ws) => {
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
    const s = sessions.get(ws);
    sessions.delete(ws);
    if (!s) return;
    // The seat is kept so the player can reconnect with their token.
    if (![...sessions.values()].some((o) => o.memberId === s.memberId)) s.room.disconnect(s.memberId);
    s.room.refresh();
    broadcast(s.room);
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
    if (room.empty && now - room.lastActivity() > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 1000);

http.listen(PORT, () => {
  console.log(`Hindsight Hold'em friends server on http://localhost:${PORT} (WebSocket at /ws)`);
});
