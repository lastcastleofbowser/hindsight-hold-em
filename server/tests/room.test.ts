import { describe, expect, it } from 'vitest';
import { HIDDEN_CARD, cleanCode } from '../../src/friends/protocol';
import { BUY_IN, Room, RoomError, makeCode } from '../room';

const user = (id: number, username: string) => ({ id, username });

function table(...names: string[]) {
  const room = new Room('ABC234');
  const members = names.map((n, i) => room.join(user(i + 1, n)));
  return { room, members };
}

/** Plays the current hand to the end: the first player to act shoves, everyone calls. */
function allInHand(room: Room) {
  let first = true;
  while (room.handRunning) {
    const g = room.game!;
    const id = room.seats[g.toAct];
    room.act(id, g.handNumber, first ? { type: g.currentBet > 0 ? 'raise' : 'bet', to: 1_000_000 } : { type: 'call' });
    first = false;
  }
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

  it('only lets the host deal the first hand', () => {
    const { room, members } = table('Liam', 'Priya');
    expect(() => room.deal(members[1].id)).toThrow(/Only the host \(Liam\)/);
    room.deal(members[0].id);
    const g = room.game!;
    room.act(room.seats[g.toAct], g.handNumber, { type: 'fold' });
    expect(() => room.deal(members[1].id)).not.toThrow(); // later hands: anyone
  });

  it('carries chips over between hands and keeps the scoreboard', () => {
    const { room, members } = table('Liam', 'Priya');
    room.deal(members[0].id);
    const g = room.game!;
    const folder = room.seats[g.toAct];
    room.act(folder, g.handNumber, { type: 'fold' });
    const view = room.viewFor(members[0].id).members;
    const total = view.reduce((n, m) => n + m.chips, 0);
    expect(total).toBe(2 * BUY_IN);
    const winner = view.find((m) => m.id !== folder)!;
    const loser = view.find((m) => m.id === folder)!;
    expect(winner.chips).toBeGreaterThan(BUY_IN);
    expect(winner.net).toBe(winner.chips - BUY_IN);
    expect(loser.net).toBeLessThan(0);
    expect(winner.handsWon).toBe(1);
    expect(winner.handsPlayed).toBe(1);
    // Next hand starts from the carried-over stacks, not 1000 each.
    room.deal(members[0].id);
    const stacks = room.game!.players.map((p) => p.stack + p.totalCommitted).sort((a, b) => a - b);
    expect(stacks).toEqual([loser.chips, winner.chips].sort((a, b) => a - b));
  });

  it('lets a busted player buy back in, or leave, and logs it', () => {
    const { room, members } = table('Liam', 'Priya');
    // All-in until someone busts (a split pot leaves both with chips, so deal again).
    let view = room.viewFor(members[0].id).members;
    for (let i = 0; i < 20 && view.every((m) => m.chips > 0); i++) {
      room.deal(members[0].id);
      allInHand(room);
      view = room.viewFor(members[0].id).members;
    }
    const busted = view.find((m) => m.chips === 0)!;
    expect(() => room.deal(members[0].id)).toThrow(/at least two connected players with chips/);
    room.rebuy(busted.id);
    const after = room.viewFor(busted.id).members.find((m) => m.id === busted.id)!;
    expect(after.chips).toBe(BUY_IN);
    expect(after.buyIns).toBe(2);
    expect(after.boughtIn).toBe(2 * BUY_IN);
    expect(after.net).toBe(-BUY_IN);
    expect(room.events.some((e) => /bought back in/.test(e.text))).toBe(true);
    expect(() => room.rebuy(busted.id)).toThrow(/run out of chips/);
    room.leave(busted.id);
    expect(room.viewFor(members[0].id).members.find((m) => m.id === busted.id)!.left).toBe(true);
    expect(room.events.some((e) => /left the table/.test(e.text))).toBe(true);
  });

  it('only lets the player whose turn it is act', () => {
    const { room, members } = table('Liam', 'Priya');
    room.deal(members[0].id);
    const g = room.game!;
    const toAct = room.seats[g.toAct];
    const other = members.find((m) => m.id !== toAct)!;
    expect(() => room.act(other.id, g.handNumber, { type: 'call' })).toThrow(RoomError);
    expect(() => room.act(toAct, g.handNumber, { type: 'check' })).toThrow(/can’t check/);
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

  it('reconnects a returning user to the same seat and chips', () => {
    const { room, members } = table('Liam', 'Priya');
    room.disconnect(members[0].id);
    expect(room.join(user(1, 'Liam')).id).toBe(members[0].id);
    room.leave(members[0].id);
    const back = room.join(user(1, 'Liam'));
    expect(back.left).toBe(false);
    expect(back.chips).toBe(BUY_IN);
    expect(back.buyIns).toBe(1);
  });

  it('caps the table at six players and cleans codes', () => {
    const { room } = table('A', 'B', 'C', 'D', 'E', 'F');
    expect(() => room.join(user(7, 'G'))).toThrow(/full/);
    expect(cleanCode('abc-234')).toBe('ABC234');
    expect(cleanCode('ABC1O0')).toBeNull(); // ambiguous characters are never used
    const code = makeCode(() => false);
    expect(cleanCode(code)).toBe(code);
  });
});
