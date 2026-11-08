import type { SocketClient } from '@/lib/net/socket';

import type { TalkieSink } from './talkie-player';

/**
 * **LE TALKIE QUI A RÉVEILLÉ CE NAVIGATEUR** (#17141, #17144) — un Proche a
 * parlé pendant que l'onglet était fermé ou endormi. Le service worker
 * (`public/sw-push.js`) a posé « X vous parle » ; le toucher (ou « Écouter »)
 * remet ici une INTENTION, par deux portes : l'adresse d'un onglet NEUF
 * (`?talkie=<id>`, plus `&talkieAudio=<url>` pour « Écouter »), retirée aussitôt,
 * ou le message qu'un onglet DÉJÀ OUVERT reçoit du worker.
 *
 * L'intention se consomme dès qu'une socket vivante existe :
 * - avec l'audio porté par le push (« Écouter »), le lecteur du talkie EXISTANT
 *   ({@link TalkieSink}) le joue — aucun nouveau lecteur ;
 * - sinon, `talkie:join { talkieId }` : la passerelle rejoue la prise de parole
 *   dans l'ordre, et l'hôte du talkie reçu la fait sortir.
 *
 * Elle expire avec la fenêtre de rattrapage : une prise de parole finie depuis
 * plus longtemps ne se rejoue plus.
 */

/** JUMEAUX de `TALKIE_PARAM`, `TALKIE_AUDIO_PARAM` et `TALKIE_WAKE_MESSAGE` dans `public/sw-push.js`. */
export const TALKIE_PARAM = 'talkie';
export const TALKIE_AUDIO_PARAM = 'talkieAudio';
export const TALKIE_WAKE_MESSAGE = 'TALKIE_WAKE';
/** Le nom client → serveur du rattrapage (contrat de #17142). */
export const TALKIE_JOIN_EVENT = 'talkie:join';
/** 30 s de prise de parole + 60 s de rattrapage servi. */
export const TALKIE_WAKE_TTL_MS = 90_000;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export type TalkieWakeIntent = { readonly talkieId: string; readonly audioUrl: string | null };

const talkieIdOf = (value: unknown): string | null => (typeof value === 'string' && OBJECT_ID.test(value.trim()) ? value.trim() : null);

const audioUrlOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

export function talkieWakeFromSearch(search: string): TalkieWakeIntent | null {
  const params = new URLSearchParams(search);
  const talkieId = talkieIdOf(params.get(TALKIE_PARAM));
  return talkieId === null ? null : { talkieId, audioUrl: audioUrlOf(params.get(TALKIE_AUDIO_PARAM)) };
}

export function talkieWakeFromMessage(message: unknown): TalkieWakeIntent | null {
  if (message === null || typeof message !== 'object') return null;
  const { type, talkieId, audioUrl } = message as { readonly type?: unknown; readonly talkieId?: unknown; readonly audioUrl?: unknown };
  if (type !== TALKIE_WAKE_MESSAGE) return null;
  const id = talkieIdOf(talkieId);
  return id === null ? null : { talkieId: id, audioUrl: audioUrlOf(audioUrl) };
}

export type TalkieWakeIntents = {
  remember(intent: TalkieWakeIntent): void;
  /** L'intention encore fraîche, retirée ; `null` sinon. */
  take(): TalkieWakeIntent | null;
  subscribe(listener: () => void): () => void;
};

export function createTalkieWakeIntents({ now = Date.now }: { readonly now?: () => number } = {}): TalkieWakeIntents {
  let pending: { readonly intent: TalkieWakeIntent; readonly until: number } | null = null;
  const listeners = new Set<() => void>();
  return {
    remember: (intent) => {
      pending = { intent, until: now() + TALKIE_WAKE_TTL_MS };
      listeners.forEach((listener) => listener());
    },
    take: () => {
      const current = pending;
      pending = null;
      return current !== null && now() <= current.until ? current.intent : null;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const talkieWakeIntents: TalkieWakeIntents = createTalkieWakeIntents();

export type FetchAudio = (url: string) => Promise<Uint8Array>;

const fetchAudio: FetchAudio = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`talkie audio ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Consomme les intentions sur la socket vivante. Un audio servi qui ne se
 * charge pas retombe sur le rattrapage par la socket : la voix sort quand même.
 */
export function bindTalkieWake({
  socket,
  sink,
  intents = talkieWakeIntents,
  load = fetchAudio,
}: {
  readonly socket: SocketClient;
  readonly sink: TalkieSink;
  readonly intents?: TalkieWakeIntents;
  readonly load?: FetchAudio;
}): () => void {
  let live = true;
  const join = (talkieId: string): void => {
    if (live) socket.emit(TALKIE_JOIN_EVENT, { talkieId });
  };
  const consume = (): void => {
    const intent = intents.take();
    if (intent === null) return;
    if (intent.audioUrl === null) return join(intent.talkieId);
    void load(intent.audioUrl).then(
      (bytes) => {
        if (!live) return;
        sink.play(intent.talkieId, bytes);
        sink.release(intent.talkieId);
      },
      () => join(intent.talkieId),
    );
  };
  consume();
  const unsubscribe = intents.subscribe(consume);
  return () => {
    live = false;
    unsubscribe();
  };
}

/** L'ENVIRONNEMENT RÉEL — même découpage que `listenCallAnswerIntentsInBrowser`. */
export function listenTalkieWakeIntentsInBrowser(intents: TalkieWakeIntents = talkieWakeIntents): void {
  const fromSearch = talkieWakeFromSearch(window.location.search);
  if (fromSearch !== null) {
    const url = new URL(window.location.href);
    url.searchParams.delete(TALKIE_PARAM);
    url.searchParams.delete(TALKIE_AUDIO_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    intents.remember(fromSearch);
  }
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const intent = talkieWakeFromMessage(event.data);
    if (intent !== null) intents.remember(intent);
  });
}
