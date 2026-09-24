import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { MediaCaptionTranslationUpdatedEventData, PostTranslationUpdatedEventData } from '@meeshy/shared/types/post';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { authorPostsQueryKey } from './author-posts';
import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { FEED_QUERY_KEY } from './feed';
import type { FeedPost } from './feed-pages';
import { hashtagQueryKey } from './hashtag-posts';
import { postQueryKey } from './publication-detail';
import { reelsQueryKey } from './reels-query-key';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * **UNE TRADUCTION LIVRÉE EN DIRECT ATTEINT CHAQUE ÉCRAN QUI MONTRE LA CARTE**
 * (#7383, #7382).
 *
 * Deux événements, deux contenus distincts d'une même publication :
 *  - `post:translation-updated` traduit `Post.content` — web-v2 ne l'écoutait
 *    NULLE PART, pendant qu'iOS l'écoute sur le Flux, la fiche, le profil et le
 *    lecteur de stories ;
 *  - `media:caption-translation-updated` traduit `PostMedia.caption` — écouté,
 *    mais écrit dans le SEUL Flux (`socket.ts#updateFeed`).
 *
 * Chaque témoin se joue sur les six caisses du registre (`card-caches.ts`) et
 * lit ce que la carte SERT (`resolveFeedCardModel`), jamais seulement ce que
 * la caisse contient : une traduction rangée qu'aucun résolveur n'élit n'a
 * servi personne (CLAUDE.md § Prisme, cycle 122).
 *
 * **LE PRISME DES TÉMOINS A DEUX RANGS, ET LA LANGUE REÇUE EST CELLE DU
 * SECOND.** Au rang 1, la règle juste et le court-circuit interdit (« la
 * dernière traduction reçue d'une langue du prisme gagne ») rendent le même
 * verdict — leçon 261 du dépôt. Le témoin HORS PRISME, lui, exige que la
 * traduction soit RANGÉE (iOS la fusionne toujours, `applyPostTranslation`)
 * et que le texte servi ne bouge pas : sans l'exigence du rangement, il serait
 * vert sur la base qui n'écoute rien.
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

/** Les six caisses du registre, chacune à la clé que son écran lit (même
 * table que `routes/post-card-hosts.test.ts`, qui garde le lien écran → clé). */
type Screen = { readonly name: string; readonly queryKey: QueryKey; readonly holds: 'pages' | 'card' };

const SCREENS: readonly Screen[] = [
  { name: 'le Flux', queryKey: FEED_QUERY_KEY, holds: 'pages' },
  { name: 'les Réels', queryKey: reelsQueryKey('p-1'), holds: 'pages' },
  { name: 'les enregistrées', queryKey: BOOKMARKS_QUERY_KEY, holds: 'pages' },
  { name: 'la page d’un hashtag', queryKey: hashtagQueryKey('marche'), holds: 'pages' },
  { name: 'le profil de l’auteur', queryKey: authorPostsQueryKey('u-auteur'), holds: 'pages' },
  { name: 'la fiche', queryKey: postQueryKey('p-1'), holds: 'card' },
];

type Pages = { readonly pages: readonly { readonly posts: readonly FeedPost[] }[] };

const seed = (queryClient: QueryClient, screen: Screen, post: FeedPost): void => {
  queryClient.setQueryData(screen.queryKey, screen.holds === 'card' ? post : { pages: [{ posts: [post] }], pageParams: [undefined] });
};

const cardOn = (queryClient: QueryClient, screen: Screen): FeedPost | undefined =>
  screen.holds === 'card'
    ? queryClient.getQueryData<FeedPost>(screen.queryKey)
    : queryClient.getQueryData<Pages>(screen.queryKey)?.pages[0]?.posts[0];

const PRISM = ['fr', 'en'] as const;

const servedBy = (post: FeedPost | undefined) =>
  post === undefined ? undefined : resolveFeedCardModel(post, { preferredLanguages: PRISM, now: new Date('2026-09-21T18:00:00.000Z') });

const entry = (text: string) => ({ text, translationModel: 'nllb-200', confidenceScore: 0.9, createdAt: '2026-09-21T18:00:00.000Z' });

/** Une publication ESPAGNOLE — hors du prisme `[fr, en]` —, avec un média
 * légendé en espagnol et un texte alternatif : trois contenus, trois cartes de
 * traduction qui ne se mélangent pas. */
const spanish = (patch: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p-1',
  type: 'POST',
  createdAt: '2026-09-21T10:00:00.000Z',
  content: 'Hola a todos',
  originalLanguage: 'es',
  translations: null,
  media: [
    { id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'El mercado', captionLanguage: 'es', captionTranslations: null, alt: 'Un puesto de frutas' },
  ],
  ...patch,
});

const postTranslation = (language: string, text: string, postId = 'p-1'): PostTranslationUpdatedEventData => ({
  postId,
  language,
  translation: entry(text),
});

const captionTranslation = (language: string, text: string, patch: Partial<MediaCaptionTranslationUpdatedEventData> = {}): MediaCaptionTranslationUpdatedEventData => ({
  mediaId: 'm-1',
  postId: 'p-1',
  language,
  translation: entry(text),
  ...patch,
});

describe('`post:translation-updated` — le TEXTE d’une publication bascule en direct sur chaque écran (#7383)', () => {
  for (const screen of SCREENS) {
    test(`${screen.name} : une traduction de RANG 2, sans traduction de rang 1, fait basculer la carte`, () => {
      const { socket, queryClient } = connected();
      seed(queryClient, screen, spanish());
      expect(servedBy(cardOn(queryClient, screen))?.text?.full).toBe('Hola a todos');

      socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));

      const text = servedBy(cardOn(queryClient, screen))?.text;
      expect(text?.full).toBe('Hello everyone');
      expect(text?.language).toBe('en');
      expect(text?.translated).toBe(true);
    });

    test(`${screen.name} : une traduction HORS du prisme est rangée, et le texte servi ne bouge pas`, () => {
      const { socket, queryClient } = connected();
      seed(queryClient, screen, spanish());

      socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('de', 'Hallo zusammen'));

      const card = cardOn(queryClient, screen);
      expect(card?.translations).toEqual({ de: entry('Hallo zusammen') });
      expect(servedBy(card)?.text?.full).toBe('Hola a todos');
      expect(servedBy(card)?.text?.translated).toBe(false);
    });
  }

  test('une seule réception atteint les six caisses à la fois', () => {
    const { socket, queryClient } = connected();
    SCREENS.forEach((screen) => seed(queryClient, screen, spanish()));

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));

    expect(SCREENS.map((screen) => servedBy(cardOn(queryClient, screen))?.text?.full)).toEqual(SCREENS.map(() => 'Hello everyone'));
  });

  /* La règle 3 du Prisme, dans les deux sens : la langue d'ORIGINE concourt à
     SON rang. Rang 2 ⇒ la traduction du rang 1 la détrône (« Bonjour », jamais
     « Hello ») ; rang 1 ⇒ aucune traduction reçue ne la détrône. */
  test('publication ANGLAISE (rang 2), traduction FRANÇAISE reçue ⇒ « Bonjour à tous », jamais l’original', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish({ content: 'Hello everyone', originalLanguage: 'en' }));

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('fr', 'Bonjour à tous'));

    expect(servedBy(cardOn(queryClient, SCREENS[0] as Screen))?.text?.full).toBe('Bonjour à tous');
  });

  test('publication FRANÇAISE (rang 1), traduction anglaise reçue ⇒ rangée, et l’original reste servi', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish({ content: 'Bonjour à tous', originalLanguage: 'fr' }));

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));

    const card = cardOn(queryClient, SCREENS[0] as Screen);
    expect(card?.translations).toEqual({ en: entry('Hello everyone') });
    expect(servedBy(card)?.text?.full).toBe('Bonjour à tous');
  });

  test('la fusion se fait PAR LANGUE : une seconde passe remplace, une autre langue s’ajoute, jamais un doublon', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish({ translations: { de: entry('Hallo zusammen'), en: entry('Hi all') } }));

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));

    expect(cardOn(queryClient, SCREENS[0] as Screen)?.translations).toEqual({ de: entry('Hallo zusammen'), en: entry('Hello everyone') });
  });

  test('le TEXTE ne touche ni la légende ni le texte alternatif du média — trois contenus, trois cartes', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish());

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));

    const card = cardOn(queryClient, SCREENS[0] as Screen);
    expect(card?.translations).toEqual({ en: entry('Hello everyone') });
    expect(card?.media?.[0]?.captionTranslations).toBeNull();
    expect(card?.media?.[0]?.alt).toBe('Un puesto de frutas');
    expect(servedBy(card)?.media[0]?.caption).toBe('El mercado');
  });

  test('une publication qu’aucun écran ne montre ne s’y invite pas, et aucune caisse n’est réécrite', () => {
    const { socket, queryClient } = connected();
    SCREENS.forEach((screen) => seed(queryClient, screen, spanish()));
    const before = SCREENS.map((screen) => queryClient.getQueryData(screen.queryKey));

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello', 'p-inconnue'));

    expect(SCREENS.map((screen) => queryClient.getQueryData(screen.queryKey))).toEqual(before);
    SCREENS.forEach((screen, index) => expect(queryClient.getQueryData(screen.queryKey)).toBe(before[index]));
  });

  test('une charge MALFORMÉE est ignorée, sans lever', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish());
    const before = queryClient.getQueryData(FEED_QUERY_KEY);

    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, null);
    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: 'p-1', language: 'en' });
    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: 'p-1', language: '', translation: entry('x') });
    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: 'p-1', language: 'en', translation: { text: 42 } });

    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(before);
  });
});

describe('`media:caption-translation-updated` — la LÉGENDE d’un média atteint chaque écran, pas le seul Flux (#7382)', () => {
  for (const screen of SCREENS) {
    test(`${screen.name} : une légende traduite au RANG 2, sans traduction de rang 1, fait basculer la carte`, () => {
      const { socket, queryClient } = connected();
      seed(queryClient, screen, spanish());
      expect(servedBy(cardOn(queryClient, screen))?.media[0]?.caption).toBe('El mercado');

      socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market'));

      const media = servedBy(cardOn(queryClient, screen))?.media[0];
      expect(media?.caption).toBe('The market');
      expect(media?.captionLanguage).toBe('en');
      expect(media?.captionTranslated).toBe(true);
    });

    test(`${screen.name} : une légende traduite HORS du prisme est rangée, et la légende servie ne bouge pas`, () => {
      const { socket, queryClient } = connected();
      seed(queryClient, screen, spanish());

      socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('de', 'Der Markt'));

      const card = cardOn(queryClient, screen);
      expect(card?.media?.[0]?.captionTranslations).toEqual({ de: entry('Der Markt') });
      expect(servedBy(card)?.media[0]?.caption).toBe('El mercado');
    });
  }

  test('la LÉGENDE ne touche ni le texte de la publication ni le texte alternatif — trois contenus, trois cartes', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish());

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market'));

    const card = cardOn(queryClient, SCREENS[0] as Screen);
    expect(card?.translations).toBeNull();
    expect(card?.media?.[0]?.alt).toBe('Un puesto de frutas');
    expect(servedBy(card)?.text?.full).toBe('Hola a todos');
  });

  /* Les quatre lois de fusion que `interactions.test.ts` gardait sur la
     fonction pure du seul Flux (#6280), rejouées ici par la socket : la loi a
     rejoint `feed-realtime.ts` et le registre. */
  test('la fusion se fait PAR LANGUE : une seconde passe remplace, une autre langue s’ajoute, jamais un doublon', () => {
    const { socket, queryClient } = connected();
    const media = [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'El mercado', captionTranslations: { de: entry('Der Markt'), en: entry('Market') } }];
    seed(queryClient, SCREENS[0] as Screen, spanish({ media }));

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market'));

    expect(cardOn(queryClient, SCREENS[0] as Screen)?.media?.[0]?.captionTranslations).toEqual({ de: entry('Der Markt'), en: entry('The market') });
  });

  test('seule la publication porteuse du média change de référence ; ses voisines restent identiques', () => {
    const { socket, queryClient } = connected();
    const neighbour = spanish({ id: 'p-2', media: [{ id: 'm-2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', caption: 'Otra' }] });
    queryClient.setQueryData(FEED_QUERY_KEY, { pages: [{ posts: [spanish(), neighbour] }], pageParams: [undefined] });

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market'));

    const posts = queryClient.getQueryData<Pages>(FEED_QUERY_KEY)?.pages[0]?.posts;
    expect(posts?.[0]?.media?.[0]?.captionTranslations).toEqual({ en: entry('The market') });
    expect(posts?.[1]).toBe(neighbour);
  });

  test('un média que la publication ne porte pas laisse chaque caisse TELLE QUELLE', () => {
    const { socket, queryClient } = connected();
    SCREENS.forEach((screen) => seed(queryClient, screen, spanish()));
    const before = SCREENS.map((screen) => queryClient.getQueryData(screen.queryKey));

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market', { mediaId: 'm-ailleurs' }));

    SCREENS.forEach((screen, index) => expect(queryClient.getQueryData(screen.queryKey)).toBe(before[index]));
  });

  /* LA RÉFÉRENCE ne suffit pas à le dire : `setQueryData` partage la
     structure d'une donnée égale et rend la même référence. Ce qu'une
     réécriture inutile CHANGE, c'est l'état — une caisse périmée redevient
     fraîche (`card-caches.ts`, `unlessSame`), et son écran ne relit plus. */
  test('une rediffusion du MÊME texte ne rend FRAÎCHE aucune caisse périmée', async () => {
    const { socket, queryClient } = connected();
    SCREENS.forEach((screen) => seed(queryClient, screen, spanish()));
    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market'));
    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));
    await Promise.all(SCREENS.map((screen) => queryClient.invalidateQueries({ queryKey: screen.queryKey, exact: true, refetchType: 'none' })));

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'The market'));
    socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, postTranslation('en', 'Hello everyone'));

    expect(SCREENS.map((screen) => queryClient.getQueryState(screen.queryKey)?.isInvalidated)).toEqual(SCREENS.map(() => true));
  });

  /* Un média de COMMENTAIRE voyage avec le `postId` de la publication qui
     porte le commentaire (`MediaCaptionTranslationService.ts`, audience) : la
     carte de cette publication ne le tient pas, et rien n'y change. */
  test('la légende d’un média de COMMENTAIRE ne réécrit aucune carte', () => {
    const { socket, queryClient } = connected();
    SCREENS.forEach((screen) => seed(queryClient, screen, spanish()));
    const before = SCREENS.map((screen) => queryClient.getQueryData(screen.queryKey));

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, captionTranslation('en', 'A reply photo', { mediaId: 'm-commentaire', commentId: 'c-1' }));

    SCREENS.forEach((screen, index) => expect(queryClient.getQueryData(screen.queryKey)).toBe(before[index]));
  });

  test('une charge sans `postId` est ignorée — la passerelle le pose toujours, et le registre en a besoin', () => {
    const { socket, queryClient } = connected();
    seed(queryClient, SCREENS[0] as Screen, spanish());
    const before = queryClient.getQueryData(FEED_QUERY_KEY);

    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, { mediaId: 'm-1', language: 'en', translation: entry('The market') });
    socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, null);

    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(before);
  });
});
