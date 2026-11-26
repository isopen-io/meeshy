/**
 * #20579 — le talkie parle et reçoit en même temps, et une prise de parole dure 15 s au plus.
 *
 * - Une voix de A vers B s'ouvre et se relaie pendant que B parle lui-même à A : aucune voix entrante n'est refusée,
 *   coupée ni mise en file parce que son destinataire émet.
 * - L'accusé sert `maxDurationMs: 15000` : un ancien client le lit et suit la nouvelle limite.
 * - La passerelle coupe la session à 15 s (plus la marge du dernier fragment), quel que soit le client.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { TALKIE_MAX_DURATION_MS } from '@meeshy/shared/types/talkie';
import { TalkieRelay, type TalkieRelayDeps } from '../../../../services/talkie/talkieRelay';
import type { TalkieVerdict } from '../../../../services/talkie/talkieGate';

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439022';
const ALICE_SOCKET = 'sock-alice';
const BOB_SOCKET = 'sock-bob';

type Emission = { room: string; event: string; payload: Record<string, unknown> };

function relayWith(overrides: Partial<TalkieRelayDeps> = {}) {
  const emissions: Emission[] = [];
  let clock = Date.parse('2026-11-25T10:00:00Z');
  const deps: TalkieRelayDeps = {
    io: { to: (room: string) => ({ emit: (event: string, payload: Record<string, unknown>) => { emissions.push({ room, event, payload }); } }) } as never,
    judge: async (): Promise<TalkieVerdict> => ({ ok: true }),
    withinStartRate: async () => true,
    cutAt: async () => null,
    now: () => clock,
    report: () => undefined,
    ...overrides,
  };
  return { relay: new TalkieRelay(deps), emissions, advance: (ms: number) => { clock += ms; } };
}

const frame = (bytes = 2000) => new Uint8Array(bytes).fill(3);
const of = (emissions: Emission[], event: string, room: string) => emissions.filter((e) => e.event === event && e.room === room);

async function open(relay: TalkieRelay, socket: string, from: string, to: string): Promise<string> {
  const ack = await relay.start(socket, from, { toUserId: to, codec: 'aac-adts' });
  if (!ack.success) throw new Error(`refus ${ack.code}`);
  return ack.data.talkieId;
}

afterEach(() => jest.useRealTimers());

describe('#20579 — parler et recevoir en même temps', () => {
  it('B parle à A ; A ouvre vers B : les deux voix sont annoncées, chacune à son destinataire', async () => {
    const t = relayWith();
    const fromBob = await open(t.relay, BOB_SOCKET, BOB, ALICE);
    const fromAlice = await open(t.relay, ALICE_SOCKET, ALICE, BOB);

    expect(t.relay.openCount).toBe(2);
    expect(of(t.emissions, 'talkie:incoming', `user:${BOB}`).map((e) => e.payload.talkieId)).toEqual([fromAlice]);
    expect(of(t.emissions, 'talkie:incoming', `user:${ALICE}`).map((e) => e.payload.talkieId)).toEqual([fromBob]);
    expect(t.emissions.filter((e) => e.event === 'talkie:ended')).toEqual([]);
    t.relay.dispose();
  });

  it('les fragments des deux sens se croisent sans se couper ni s’attendre', async () => {
    const t = relayWith();
    const fromBob = await open(t.relay, BOB_SOCKET, BOB, ALICE);
    const fromAlice = await open(t.relay, ALICE_SOCKET, ALICE, BOB);

    for (let seq = 0; seq < 4; seq += 1) {
      await t.relay.chunk(BOB_SOCKET, BOB, { talkieId: fromBob, seq, data: frame() });
      await t.relay.chunk(ALICE_SOCKET, ALICE, { talkieId: fromAlice, seq, data: frame() });
    }

    expect(of(t.emissions, 'talkie:chunk', `user:${BOB}`).map((e) => [e.payload.talkieId, e.payload.seq])).toEqual(
      [0, 1, 2, 3].map((seq) => [fromAlice, seq]),
    );
    expect(of(t.emissions, 'talkie:chunk', `user:${ALICE}`).map((e) => [e.payload.talkieId, e.payload.seq])).toEqual(
      [0, 1, 2, 3].map((seq) => [fromBob, seq]),
    );
    t.relay.dispose();
  });

  it('A relâche : la voix de B vers A continue, et la fin de A ne ferme que la sienne', async () => {
    const t = relayWith();
    const fromBob = await open(t.relay, BOB_SOCKET, BOB, ALICE);
    const fromAlice = await open(t.relay, ALICE_SOCKET, ALICE, BOB);

    t.relay.end(ALICE_SOCKET, ALICE, { talkieId: fromAlice });
    await t.relay.chunk(BOB_SOCKET, BOB, { talkieId: fromBob, seq: 0, data: frame() });

    expect(t.emissions.filter((e) => e.event === 'talkie:ended').map((e) => e.payload.talkieId)).toEqual([fromAlice, fromAlice]);
    expect(of(t.emissions, 'talkie:chunk', `user:${ALICE}`).map((e) => e.payload.talkieId)).toEqual([fromBob]);
    expect(t.relay.openCount).toBe(1);
    t.relay.dispose();
  });
});

describe('#20579 — quinze secondes au plus par prise de parole', () => {
  it('la limite partagée vaut 15 000 ms', () => {
    expect(TALKIE_MAX_DURATION_MS).toBe(15_000);
  });

  it('l’accusé et l’annonce servent 15 000 ms : un ancien client suit la nouvelle limite', async () => {
    const t = relayWith();
    const ack = await t.relay.start(ALICE_SOCKET, ALICE, { toUserId: BOB, codec: 'aac-adts' });

    expect(ack).toMatchObject({ success: true, data: { maxDurationMs: 15_000 } });
    expect(of(t.emissions, 'talkie:incoming', `user:${BOB}`)[0].payload.maxDurationMs).toBe(15_000);
    t.relay.dispose();
  });

  it('un client qui ne s’arrête pas est coupé par la passerelle à 15 s, marge du dernier fragment comprise', async () => {
    jest.useFakeTimers();
    const t = relayWith();
    await open(t.relay, ALICE_SOCKET, ALICE, BOB);

    jest.advanceTimersByTime(15_000);
    expect(t.relay.openCount).toBe(1);
    jest.advanceTimersByTime(1_001);

    expect(t.relay.openCount).toBe(0);
    expect(t.emissions.filter((e) => e.event === 'talkie:ended').map((e) => [e.room, e.payload.reason]).sort()).toEqual(
      [[`user:${ALICE}`, 'limit'], [`user:${BOB}`, 'limit']].sort(),
    );
  });

  it('un fragment qui arrive à 15 s passe encore ; au-delà de la marge, il ferme la prise de parole', async () => {
    const t = relayWith();
    const talkieId = await open(t.relay, ALICE_SOCKET, ALICE, BOB);

    t.advance(15_000);
    await t.relay.chunk(ALICE_SOCKET, ALICE, { talkieId, seq: 0, data: frame() });
    t.advance(1_100);
    await t.relay.chunk(ALICE_SOCKET, ALICE, { talkieId, seq: 1, data: frame() });

    expect(of(t.emissions, 'talkie:chunk', `user:${BOB}`).map((e) => e.payload.seq)).toEqual([0]);
    expect(of(t.emissions, 'talkie:ended', `user:${BOB}`)[0].payload.reason).toBe('limit');
  });
});
