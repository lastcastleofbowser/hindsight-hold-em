import { describe, expect, it } from 'vitest';
import { HIDDEN_CARD, cleanCode, cleanName } from '../../src/friends/protocol';
import { Room, RoomError, makeCode } from '../room';

function table(...names: string[]) {
  const room = new Room('ABC234');
  const members = names.map((n) => room.join(n));
  return { room, members };
}

describe('friends room', () => {
  it('deals one hand to everyone and hides other players’ cards', () => {
    const { room, members } = table('Liam', 'Priya');
    room.deal(members[0].id);
    const liam = room.viewFor(members[0].id).game!;
    const priya = room.viewFor(members[1].id).game!;
    expect(liam.board).toEqual(priya.board);
    expect(liam.deck).toEqual([]); // the deck never leaves the server
    const liamSeat = room.seats.indexOf(members[0].id);
    expect(liam.players[liamSeat].isHero).toBe(true);
    expect(liam.players[liamSeat].hole.every((c) => c >= 0)).toBe(true);
    expect(liam.players[1 - liamSeat].hole).toEqual([HIDDEN_CARD, HIDDEN_CARD]);
    expect(priya.players[liamSeat].hole).toEqual([HIDDEN_CARD, HIDDEN_CARD]);
  });

  it('only lets the player whose turn it is act, and keeps score', () => {
    const { room, members } = table('Liam', 'Priya');
    room.deal(members[0].id);
    const g = room.game!;
    const toAct = room.seats[g.toAct];
    const other = members.find((m) => m.id !== toAct)!;
    expect(() => room.act(other.id, g.handNumber, { type: 'call' })).toThrow(RoomError);
    expect(() => room.act(toAct, g.handNumber, { type: 'check' })).toThrow(/can’t check/); // small blind faces a call
    room.act(toAct, g.handNumber, { type: 'fold' });
    expect(room.game!.finished).toBe(true);
    const winner = members.find((m) => m.id !== toAct)!;
    expect(room.viewFor(winner.id).members.find((m) => m.id === winner.id)!.score).toBe(1);
    // Cards are revealed to everyone once the hand is over.
    expect(room.viewFor(winner.id).game!.players.every((p) => p.hole.every((c) => c >= 0))).toBe(true);
  });

  it('auto-folds or checks for disconnected players and on timeouts', () => {
    const { room, members } = table('A', 'B', 'C');
    room.deal(members[0].id);
    const actor = room.seats[room.game!.toAct];
    room.disconnect(actor);
    room.refresh();
    expect(room.seats[room.game!.toAct]).not.toBe(actor);
    room.timeOut();
    expect(room.game!.log.length).toBeGreaterThanOrEqual(2);
  });

  it('lets a player rejoin their seat with their token', () => {
    const { room, members } = table('Liam', 'Priya');
    room.disconnect(members[0].id);
    const again = room.join('Liam', members[0].token);
    expect(again.id).toBe(members[0].id);
    expect(() => room.join('liam')).toThrow(/already at this table/);
  });

  it('needs two connected players and caps the table at six', () => {
    const { room, members } = table('Solo');
    expect(() => room.deal(members[0].id)).toThrow(/at least two/);
    for (const n of ['B', 'C', 'D', 'E', 'F']) room.join(n);
    expect(() => room.join('G')).toThrow(/full/);
  });

  it('cleans names and codes', () => {
    expect(cleanName('  <Liam>\u0007 ')).toBe('Liam');
    expect(cleanName('   ')).toBeNull();
    expect(cleanCode('abc-234')).toBe('ABC234');
    expect(cleanCode('ABC1O0')).toBeNull(); // ambiguous characters are never used
    const code = makeCode(() => false);
    expect(cleanCode(code)).toBe(code);
  });
});
