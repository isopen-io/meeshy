import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { FEED_QUERY_KEY } from './feed';
import type { FeedPost } from './feed-pages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';
import { createTypingStore } from './typing-store';

/**
 * **`story:translation-updated` — LE TEXTE D'UNE SCÈNE DE STORY BASCULE EN
 * DIRECT** (#20287).
 *
 * Mesuré avant ce lot : l'événement part dans la room `feed:<moi>` que le web
 * rejoint à l'authentification, porte un contenu qu'il sait rendre
 * (`resolveSceneText`), et ses deux jumeaux (`post:` et
 * `comment:translation-updated`) étaient branchés — seul l'écouteur manquait.
 * Une story ouverte pendant que sa traduction atterrissait restait dans la
 * langue d'origine jusqu'au prochain fetch.
 *
 * **LE PRISME DES TÉMOINS A DEUX RANGS, ET LA LANGUE REÇUE EST CELLE DU
 * SECOND** (leçon 261) : au rang 1, la règle juste et le court-circuit interdit
 * rendent le même verdict, donc un témoin posé là ne peut pas tomber.
 *
 * Et chaque témoin lit ce que le lecteur VOIT (`resolveSceneText`), jamais
 * seulement ce que la caisse contient : une traduction rangée qu'aucun
 * résolveur n'élit n'a servi personne (CLAUDE.md § Prisme, cycle 122).
 */

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function connected(): { readonly socket: ReturnType<typeof fakeSocket>; readonly queryClient: QueryClient } {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
  };
  createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient };
}

const PRISM = ['fr', 'en'] as const;

const textObject = (id: string, payload: Record<string, unknown>, locale?: string) => ({
  id,
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  ...(locale !== undefined ? { locale } : {}),
  payload,
});

const canvas = (objects: readonly unknown[]) => ({ v: 3, scenes: [{ id: 's1', objects }] });

/** Une story ESPAGNOLE — hors du prisme `[fr, en]` — à un seul objet texte. */
const spanishStory = (patch: Partial<StoryFeedPost> = {}): StoryFeedPost => ({
  id: 'st-1',
  type: 'STORY',
  createdAt: '2026-11-21T10:00:00.000Z',
  storyEffects: canvas([textObject('t-1', { text: 'Hola a todos' }, 'es')]),
  ...patch,
});

const storyCard = (patch: Partial<FeedPost> = {}): FeedPost => ({
  id: 'st-1',
  type: 'STORY',
  createdAt: '2026-11-21T10:00:00.000Z',
  storyEffects: canvas([textObject('t-1', { text: 'Hola a todos' }, 'es')]),
  ...patch,
});

const event = (translations: Record<string, string>, textObjectIndex = 0, postId = 'st-1') => ({
  postId,
  textObjectIndex,
  translations,
});

/** Ce que le LECTEUR voit du texte de rang `at` — la chaîne jusqu'au pixel. */
const servedText = (storyEffects: unknown, at = 0) => {
  const document = parseCanvasDocument(storyEffects);
  const object = document?.scenes[0]?.objects.filter((o) => o.kind === 'text')[at];
  return object === undefined ? undefined : resolveSceneText({ object, preferredLanguages: PRISM });
};

const storyIn = (queryClient: QueryClient): StoryFeedPost | undefined =>
  queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.[0];

describe('`story:translation-updated` — le texte de la scène bascule dans la langue du lecteur', () => {
  test('le corpus du lecteur : une traduction de RANG 2, sans rang 1, fait basculer le texte servi', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [spanishStory()]);
    expect(servedText(storyIn(queryClient)?.storyEffects)?.text).toBe('Hola a todos');

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }));

    const served = servedText(storyIn(queryClient)?.storyEffects);
    expect(served?.text).toBe('Hello everyone');
    expect(served?.language).toBe('en');
  });

  test('la fiche unitaire de la story la reçoit aussi', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(storyPostQueryKey('st-1'), spanishStory());

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }));

    expect(servedText(queryClient.getQueryData<StoryFeedPost>(storyPostQueryKey('st-1'))?.storyEffects)?.text).toBe('Hello everyone');
  });

  test('la carte du Flux, qui rend la scène, la reçoit aussi', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(FEED_QUERY_KEY, { pages: [{ posts: [storyCard()] }], pageParams: [undefined] });

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }));

    const card = queryClient.getQueryData<{ pages: readonly { posts: readonly FeedPost[] }[] }>(FEED_QUERY_KEY)?.pages[0]?.posts[0];
    expect(servedText(card?.storyEffects)?.text).toBe('Hello everyone');
  });

  test('une REPUBLICATION reçoit la traduction du canvas de sa SOURCE', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [
      spanishStory({
        id: 'st-partage',
        storyEffects: undefined,
        repostOf: { id: 'st-1', storyEffects: canvas([textObject('t-1', { text: 'Hola a todos' }, 'es')]) },
      }),
    ]);

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }));

    expect(servedText(storyIn(queryClient)?.repostOf?.storyEffects)?.text).toBe('Hello everyone');
  });

  /**
   * LE PIÈGE DE L'INDEX, et c'est le témoin qui a décidé de l'énumération : le
   * serveur diffuse le rang dans `storyTranslatableTexts` — TOUS les objets
   * `text`, blancs compris — pendant que la seule énumération que le web
   * possédait (`sceneTextObjects`, `language-availability.ts`) écarte les
   * textes blancs. Les deux ne divergent QUE sur une scène qui porte un texte
   * vide, et la divergence fusionne alors dans le mauvais objet, en silence.
   */
  test('l’index compte les textes BLANCS, comme l’énumération du serveur', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [
      spanishStory({
        storyEffects: canvas([textObject('t-vide', { text: '   ' }), textObject('t-1', { text: 'Hola a todos' }, 'es')]),
      }),
    ]);

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }, 1));

    expect(servedText(storyIn(queryClient)?.storyEffects, 1)?.text).toBe('Hello everyone');
    expect(servedText(storyIn(queryClient)?.storyEffects, 0)?.text).toBe('   ');
  });

  test('une traduction HORS du prisme est RANGÉE, et le texte servi ne bouge pas', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [spanishStory()]);

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ de: 'Hallo zusammen' }));

    const story = storyIn(queryClient);
    const object = parseCanvasDocument(story?.storyEffects)?.scenes[0]?.objects[0];
    expect(object?.payload.translations).toEqual({ de: 'Hallo zusammen' });
    expect(servedText(story?.storyEffects)?.text).toBe('Hola a todos');
  });

  test('la fusion se fait PAR LANGUE : une seconde passe remplace, une autre langue s’ajoute', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [
      spanishStory({ storyEffects: canvas([textObject('t-1', { text: 'Hola a todos', translations: { de: 'Hallo' } }, 'es')]) }),
    ]);

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ de: 'Hallo zusammen', en: 'Hello everyone' }));

    const object = parseCanvasDocument(storyIn(queryClient)?.storyEffects)?.scenes[0]?.objects[0];
    expect(object?.payload.translations).toEqual({ de: 'Hallo zusammen', en: 'Hello everyone' });
  });

  test('un index hors du document, une charge malformée, une carte vide : la caisse n’est pas touchée', () => {
    const { socket, queryClient } = connected();
    const corpus = [spanishStory()];
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, corpus);

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }, 7));
    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({}, 0));
    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, { postId: 'st-1', translations: { en: 'Hello' } });
    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, { textObjectIndex: 0, translations: { en: 'Hello' } });
    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, null);

    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBe(corpus);
  });

  test('une seconde réception IDENTIQUE ne change pas l’identité de la caisse', () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [spanishStory()]);

    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }));
    const afterFirst = queryClient.getQueryData(STORY_FEED_QUERY_KEY);
    socket.fire(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, event({ en: 'Hello everyone' }));

    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBe(afterFirst);
  });
});
