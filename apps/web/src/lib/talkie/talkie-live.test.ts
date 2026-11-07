import { describe, expect, test } from 'bun:test';

import { TALKIE_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bindTalkieLive, createTalkieStore, decodeTalkieChunk, decodeTalkieEnded, decodeTalkieIncoming } from './talkie-live';
import type { TalkieSink } from './talkie-player';

/**
 * LE TALKIE REÇU, ONGLET OUVERT (#16638, `proche-talkie@web`) — `talkie:incoming`
 * ouvre une prise de parole, chaque `talkie:chunk` se JOUE dès son arrivée, dans
 * l'ordre, `talkie:ended` la ferme ; un blocage (`cut`) fait taire sur-le-champ.
 */

const ME = 'me';
const PROCHE = 'proche';
const NOW = Date.parse('2026-11-07T10:00:05.000Z');

const incoming = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  talkieId: 't1',
  fromUserId: PROCHE,
  codec: 'aac-adts',
  startedAt: '2026-11-07T10:00:00.000Z',
  maxDurationMs: 30_000,
  ...overrides,
});

const chunk = (seq: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  talkieId: 't1',
  fromUserId: PROCHE,
  seq,
  data: new Uint8Array([seq, 1, 2]).buffer,
  relayedAt: NOW,
  ...overrides,
});

const ended = (reason: string, overrides: Readonly<Record<string, unknown>> = {}) => ({
  talkieId: 't1',
  fromUserId: PROCHE,
  toUserId: ME,
  reason,
  endedAt: '2026-11-07T10:00:06.000Z',
  ...overrides,
});

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, new Set([...(handlers.get(event) ?? []), handler]));
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    },
  } as unknown as SocketClient;
  const fire = (event: string, payload: unknown) => [...(handlers.get(event) ?? [])].forEach((handler) => handler(payload));
  const count = () => [...handlers.values()].reduce((total, set) => total + set.size, 0);
  return { socket, fire, count };
}

function recordingSink() {
  const played: { readonly talkieId: string; readonly first: number }[] = [];
  const silenced: string[] = [];
  const released: string[] = [];
  const sink: TalkieSink = {
    play: (talkieId, bytes) => played.push({ talkieId, first: bytes[0] ?? -1 }),
    silence: (talkieId) => silenced.push(talkieId),
    release: (talkieId) => released.push(talkieId),
  };
  return { sink, played, silenced, released };
}

function bound() {
  const store = createTalkieStore({ now: () => NOW });
  const { socket, fire, count } = fakeSocket();
  const { sink, played, silenced, released } = recordingSink();
  const unbind = bindTalkieLive({ socket, store, sink, viewerId: () => ME });
  return { store, fire, count, played, silenced, released, unbind };
}

describe('les décodeurs du talkie', () => {
  test('une charge complète se lit ; une charge incomplète ou d’un autre encodage est IGNORÉE entière', () => {
    expect(decodeTalkieIncoming(incoming())).toEqual(incoming());
    expect(decodeTalkieIncoming(incoming({ codec: 'opus' }))).toBeNull();
    expect(decodeTalkieIncoming(incoming({ maxDurationMs: -1 }))).toBeNull();
    expect(decodeTalkieEnded(ended('sender'))?.reason).toBe('sender');
    expect(decodeTalkieEnded(ended('blocked'))).toBeNull();
  });

  test('un fragment se lit en octets, qu’il arrive en ArrayBuffer ou en vue typée ; du texte n’est pas de l’audio', () => {
    expect(decodeTalkieChunk(chunk(0))?.data).toEqual(new Uint8Array([0, 1, 2]));
    expect(decodeTalkieChunk(chunk(1, { data: new Uint8Array([9]) }))?.data).toEqual(new Uint8Array([9]));
    expect(decodeTalkieChunk(chunk(2, { data: 'AAEC' }))).toBeNull();
    expect(decodeTalkieChunk(chunk(-1))).toBeNull();
  });
});

describe('la prise de parole reçue', () => {
  test('`talkie:incoming` ouvre la prise de parole : l’indicateur la lit dans le magasin', () => {
    const { store, fire } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    expect(store.getState().active.map((entry) => entry.fromUserId)).toEqual([PROCHE]);
  });

  test('chaque fragment se JOUE dès son arrivée, dans l’ordre ; un doublon ou un fragment en retard ne rejoue rien', () => {
    const { fire, played } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(0));
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(1));
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(1));
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(0));
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(3));
    expect(played.map((entry) => entry.first)).toEqual([0, 1, 3]);
  });

  test('un fragment d’une prise de parole inconnue, ou d’un autre émetteur que celui annoncé, ne joue pas', () => {
    const { fire, played } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(0));
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(1, { fromUserId: 'intrus' }));
    expect(played).toEqual([]);
  });

  test('ma propre voix (un autre de mes appareils) ne s’ouvre jamais ici', () => {
    const { store, fire } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming({ fromUserId: ME }));
    expect(store.getState().active).toEqual([]);
  });

  test('fin par l’émetteur : l’indicateur part, ce qui est déjà en file finit de sonner, rien de plus ne joue', () => {
    const { store, fire, played, silenced, released } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(0));
    fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, ended('sender'));
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(1));
    expect(store.getState().active).toEqual([]);
    expect(played.map((entry) => entry.first)).toEqual([0]);
    expect(silenced).toEqual([]);
    expect(released).toEqual(['t1']);
  });

  test('coupure (blocage, réglage, appel) : le son se TAIT sur-le-champ', () => {
    const { store, fire, silenced } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(0));
    fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, ended('cut'));
    expect(silenced).toEqual(['t1']);
    expect(store.getState().active).toEqual([]);
  });

  test('une prise de parole coupée ici (« Couper ») ne rejoue plus rien de sa suite', () => {
    const { store, fire, played } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(0));
    store.getState().close('t1');
    fire(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, chunk(1));
    expect(played.map((entry) => entry.first)).toEqual([0]);
    expect(store.getState().active).toEqual([]);
  });

  test('une prise de parole close ne se rouvre pas sur un `talkie:incoming` en retard', () => {
    const { store, fire } = bound();
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, ended('sender'));
    fire(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, incoming());
    expect(store.getState().active).toEqual([]);
  });

  test('sans `talkie:ended` (socket coupée), la prise de parole se ferme passé sa durée maximale, comptée à l’horloge de cet onglet', () => {
    let now = NOW;
    const store = createTalkieStore({ now: () => now });
    store.getState().open(decodeTalkieIncoming(incoming())!);
    expect(store.getState().expire()).toEqual([]);
    expect(store.getState().active).toHaveLength(1);
    now = Date.parse('2026-11-07T10:00:40.000Z');
    expect(store.getState().expire()).toEqual(['t1']);
    expect(store.getState().active).toEqual([]);
  });

  test('se détacher retire chaque écouteur posé', () => {
    const { count, unbind } = bound();
    expect(count()).toBe(3);
    unbind();
    expect(count()).toBe(0);
  });
});
