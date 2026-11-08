import { describe, expect, test } from 'bun:test';

import type { SocketClient } from '@/lib/net/socket';

import type { TalkieSink } from './talkie-player';
import {
  TALKIE_JOIN_EVENT,
  TALKIE_WAKE_TTL_MS,
  bindTalkieWake,
  createTalkieWakeIntents,
  talkieWakeFromMessage,
  talkieWakeFromSearch,
} from './talkie-wake-intent';

/**
 * LE TALKIE QUI A RÉVEILLÉ CE NAVIGATEUR (#17144) — le toucher de la notification
 * rattrape la voix par `talkie:join` ; « Écouter » joue l'audio porté par le push
 * avec le lecteur du talkie existant.
 */

const TALKIE_ID = 'b'.repeat(24);
const AUDIO = 'https://gate.meeshy.me/talkie/b.aac';

function fakeSocket() {
  const emitted: { event: string; payload: unknown }[] = [];
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: () => undefined,
    off: () => undefined,
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
  };
  return { socket, emitted };
}

function fakeSink() {
  const calls: string[] = [];
  const sink: TalkieSink = {
    play: (talkieId, data) => calls.push(`play:${talkieId}:${data.byteLength}`),
    release: (talkieId) => calls.push(`release:${talkieId}`),
    silence: (talkieId) => calls.push(`silence:${talkieId}`),
  };
  return { sink, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('l’intention venue de la notification', () => {
  test('l’adresse d’un onglet neuf porte la prise de parole, et l’audio seulement en HTTPS', () => {
    expect(talkieWakeFromSearch(`?talkie=${TALKIE_ID}`)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
    expect(talkieWakeFromSearch(`?talkie=${TALKIE_ID}&talkieAudio=${encodeURIComponent(AUDIO)}`)).toEqual({ talkieId: TALKIE_ID, audioUrl: AUDIO });
    expect(talkieWakeFromSearch(`?talkie=${TALKIE_ID}&talkieAudio=${encodeURIComponent('javascript:alert(1)')}`)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
    expect(talkieWakeFromSearch('?talkie=pas-un-id')).toBeNull();
  });

  test('seul le message du réveil du talkie est lu', () => {
    expect(talkieWakeFromMessage({ type: 'TALKIE_WAKE', talkieId: TALKIE_ID, audioUrl: AUDIO })).toEqual({ talkieId: TALKIE_ID, audioUrl: AUDIO });
    expect(talkieWakeFromMessage({ type: 'NOTIFICATION_CLICKED', talkieId: TALKIE_ID })).toBeNull();
    expect(talkieWakeFromMessage(null)).toBeNull();
  });

  test('une intention expire avec la fenêtre de rattrapage', () => {
    let clock = 0;
    const intents = createTalkieWakeIntents({ now: () => clock });
    intents.remember({ talkieId: TALKIE_ID, audioUrl: null });
    clock = TALKIE_WAKE_TTL_MS + 1;
    expect(intents.take()).toBeNull();
  });
});

describe('la socket vivante consomme l’intention', () => {
  test('sans audio servi, `talkie:join` demande le rattrapage, une seule fois', () => {
    const intents = createTalkieWakeIntents();
    const { socket, emitted } = fakeSocket();
    const { sink } = fakeSink();
    intents.remember({ talkieId: TALKIE_ID, audioUrl: null });

    bindTalkieWake({ socket, sink, intents });
    bindTalkieWake({ socket, sink, intents });

    expect(emitted).toEqual([{ event: TALKIE_JOIN_EVENT, payload: { talkieId: TALKIE_ID } }]);
  });

  test('une intention arrivée après la socket part aussitôt', () => {
    const intents = createTalkieWakeIntents();
    const { socket, emitted } = fakeSocket();
    bindTalkieWake({ socket, sink: fakeSink().sink, intents });

    intents.remember({ talkieId: TALKIE_ID, audioUrl: null });

    expect(emitted).toHaveLength(1);
  });

  test('« Écouter » joue l’audio du push avec le lecteur du talkie, sans rattrapage', async () => {
    const intents = createTalkieWakeIntents();
    const { socket, emitted } = fakeSocket();
    const { sink, calls } = fakeSink();
    intents.remember({ talkieId: TALKIE_ID, audioUrl: AUDIO });

    bindTalkieWake({ socket, sink, intents, load: async () => new Uint8Array([1, 2, 3]) });
    await flush();

    expect(calls).toEqual([`play:${TALKIE_ID}:3`, `release:${TALKIE_ID}`]);
    expect(emitted).toEqual([]);
  });

  test('un audio qui ne se charge pas retombe sur le rattrapage par la socket', async () => {
    const intents = createTalkieWakeIntents();
    const { socket, emitted } = fakeSocket();
    intents.remember({ talkieId: TALKIE_ID, audioUrl: AUDIO });

    bindTalkieWake({ socket, sink: fakeSink().sink, intents, load: () => Promise.reject(new Error('404')) });
    await flush();

    expect(emitted).toEqual([{ event: TALKIE_JOIN_EVENT, payload: { talkieId: TALKIE_ID } }]);
  });
});
