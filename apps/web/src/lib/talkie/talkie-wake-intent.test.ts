import { describe, expect, test } from 'bun:test';

import type { SocketClient } from '@/lib/net/socket';

import type { TalkieSink } from './talkie-player';
import {
  TALKIE_AUDIO_MAX_BYTES,
  TALKIE_JOIN_EVENT,
  TALKIE_WAKE_TTL_MS,
  bindTalkieWake,
  createTalkieWakeIntents,
  fetchTalkieAudio,
  gatewayOrigin,
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
const GATEWAY = 'https://gate.meeshy.me';

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
  test('l’adresse d’un onglet neuf ne porte QUE la prise de parole : un audio dans l’URL est ignoré', () => {
    expect(talkieWakeFromSearch(`?talkie=${TALKIE_ID}`)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
    for (const name of ['talkieAudio', 'audio', 'audioUrl']) {
      expect(talkieWakeFromSearch(`?talkie=${TALKIE_ID}&${name}=${encodeURIComponent('https://attaquant.example/faux.aac')}`)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
      expect(talkieWakeFromSearch(`?talkie=${TALKIE_ID}&${name}=${encodeURIComponent(AUDIO)}`)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
    }
    expect(talkieWakeFromSearch('?talkie=pas-un-id')).toBeNull();
  });

  test('seul le message du réveil du talkie est lu, et son audio seulement depuis la passerelle', () => {
    expect(talkieWakeFromMessage({ type: 'TALKIE_WAKE', talkieId: TALKIE_ID, audioUrl: AUDIO }, GATEWAY)).toEqual({ talkieId: TALKIE_ID, audioUrl: AUDIO });
    expect(talkieWakeFromMessage({ type: 'TALKIE_WAKE', talkieId: TALKIE_ID, audioUrl: 'https://attaquant.example/faux.aac' }, GATEWAY)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
    expect(talkieWakeFromMessage({ type: 'TALKIE_WAKE', talkieId: TALKIE_ID, audioUrl: 'http://gate.meeshy.me/talkie/b.aac' }, GATEWAY)).toEqual({ talkieId: TALKIE_ID, audioUrl: null });
    expect(talkieWakeFromMessage({ type: 'NOTIFICATION_CLICKED', talkieId: TALKIE_ID }, GATEWAY)).toBeNull();
    expect(talkieWakeFromMessage(null, GATEWAY)).toBeNull();
  });

  test('l’origine de la passerelle vient de la configuration, sinon de la page', () => {
    expect(gatewayOrigin('https://gate.meeshy.me/api', 'https://meeshy.me')).toBe(GATEWAY);
    expect(gatewayOrigin('', 'https://meeshy.me')).toBe('https://meeshy.me');
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

describe('le téléchargement de l’audio est plafonné', () => {
  const answer = (bytes: number, declared?: number) =>
    (async () =>
      new Response(new Uint8Array(bytes), { status: 200, headers: declared === undefined ? {} : { 'content-length': String(declared) } })) as unknown as typeof fetch;

  test('une voix sous le plafond se télécharge', async () => {
    expect((await fetchTalkieAudio(AUDIO, answer(10))).byteLength).toBe(10);
  });

  test('un corps annoncé ou reçu au-delà du plafond est refusé', async () => {
    await expect(fetchTalkieAudio(AUDIO, answer(10, TALKIE_AUDIO_MAX_BYTES + 1))).rejects.toThrow();
    await expect(fetchTalkieAudio(AUDIO, answer(TALKIE_AUDIO_MAX_BYTES + 1))).rejects.toThrow();
  });
});
