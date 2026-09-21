import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { updateCardPost } from '@/lib/api/card-caches';
import type { FeedPost } from '@/lib/api/feed-pages';
import { appQueryClient } from '@/lib/api/query-client';
import { createRealtimeConnection, type RealtimeConnection } from '@/lib/api/socket';
import { createTypingStore } from '@/lib/api/typing-store';
import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { navigate, Router } from './route-table';

/**
 * **QUI AFFICHE CE QU'ON ÉCRIT ?** (#7383, #7382 ; CLAUDE.md § Prisme, cycle
 * 122) — `socket-translation-realtime.test.ts` prouve qu'une traduction reçue
 * entre dans les six caisses et que le MODÈLE de carte bascule au bon rang.
 * Ce fichier prouve le dernier cran : sur chaque écran MONTÉ en entier, par
 * son adresse, la traduction reçue par la socket change le TEXTE PEINT — ni
 * un état local figé au montage, ni une caisse lue à côté ne la retient.
 *
 * **CE QUE CE NIVEAU NE PEUT PAS DIRE : LE RANG.** Sous `bun test`, le prisme
 * des fixtures est une constante de module (`READER_LANGUAGES`, `lib/reader.ts`)
 * dont le seul rang sûr est `fr`. La traduction reçue vise donc le rang 1 ;
 * la descente sur un rang inférieur est prouvée au niveau du modèle, où le
 * prisme est un paramètre. Une traduction HORS du prisme (`de`) est rejouée
 * d'abord : elle ne doit rien peindre.
 *
 * La publication montrée est RÉÉCRITE après le montage — espagnole, sans
 * traduction, un média légendé en espagnol, sans scène — pour que le témoin
 * ne dépende ni de la langue ni de la forme des fixtures.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/feed' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root; readonly realtime: RealtimeConnection } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted?.realtime.destroy();
  mounted = null;
  appQueryClient.clear();
});

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  return {
    connected: false,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as SocketHandler));
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

const TIMEOUT_MS = 3000;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

async function settleUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    if (condition() || Date.now() >= deadline) return;
  }
}

async function mountAt(url: string, socket: ReturnType<typeof fakeSocket>): Promise<HTMLDivElement> {
  navigate(url, true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const realtime = createRealtimeConnection(
    { token: 't', sessionToken: 's' },
    {
      base: 'https://gate.staging.meeshy.me',
      socketFactory: () => socket,
      queryClient: appQueryClient,
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => 'u-viewer',
      onClearSession: () => undefined,
    },
  );
  mounted = { container, root, realtime };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <Router wrap={(children) => children} skeleton={null} />
      </QueryClientProvider>,
    );
  });
  return container;
}

const read = (element: Element | null | undefined): string | undefined => element?.textContent?.replace(/\s+/gu, ' ').trim();

const entry = (text: string) => ({ text, translationModel: 'nllb-200', confidenceScore: 0.9, createdAt: '2026-09-21T18:00:00.000Z' });

const inSpanish = (post: FeedPost, type: string): FeedPost => ({
  ...post,
  type,
  content: 'Hola a todos',
  originalLanguage: 'es',
  translations: null,
  storyEffects: null,
  media: [
    {
      id: 'm-vivant',
      mimeType: 'image/jpeg',
      fileUrl: 'https://gate.staging.meeshy.me/api/v1/attachments/file/marche.jpg',
      width: 1080,
      height: 1080,
      caption: 'El mercado',
      captionLanguage: 'es',
      captionTranslations: null,
      alt: 'Un puesto de frutas',
    },
  ],
});

/**
 * Chaque écran qui monte la carte, par l'ADRESSE que l'application sert — la
 * table des hôtes vit dans `post-card-hosts.test.ts`, qui rougit si un
 * septième écran monte la carte sans s'y déclarer.
 */
type Screen = {
  readonly name: string;
  readonly url: string;
  /** L'id de la publication peinte en tête, lu dans le DOM (ou connu : la graine). */
  readonly first: (container: HTMLElement) => string | undefined;
  readonly type: string;
  readonly text: (container: HTMLElement, id: string) => Element | null;
  /** `null` : l'écran ne peint pas la légende d'un média (le réel peint le texte de la publication). */
  readonly caption: ((container: HTMLElement, id: string) => Element | null) | null;
};

const firstCard = (container: HTMLElement) => container.querySelector('[data-feed-card-id]')?.getAttribute('data-feed-card-id') ?? undefined;
const cardText = (container: HTMLElement, id: string) => container.querySelector(`[data-feed-card-id="${id}"] [data-feed-text]`);
const cardCaption = (container: HTMLElement, id: string) => container.querySelector(`[data-feed-card-id="${id}"] [data-feed-carousel-caption]`);

const SCREENS: readonly Screen[] = [
  { name: 'le Flux', url: '/feed', first: firstCard, type: 'POST', text: cardText, caption: cardCaption },
  { name: 'les enregistrées', url: '/me/bookmarks', first: firstCard, type: 'POST', text: cardText, caption: cardCaption },
  { name: 'la page d’un hashtag', url: '/hashtag/livraison', first: firstCard, type: 'POST', text: cardText, caption: cardCaption },
  { name: 'le profil de l’auteur', url: '/u/kwame-mensah', first: firstCard, type: 'POST', text: cardText, caption: cardCaption },
  { name: 'la fiche', url: '/post/post-image-fr', first: firstCard, type: 'POST', text: cardText, caption: cardCaption },
  {
    name: 'les Réels',
    url: '/reel/reel-studio',
    first: (container) => (container.querySelector('[data-reel-index="0"] [data-reel-caption]') === null ? undefined : 'reel-studio'),
    type: 'REEL',
    text: (container) => container.querySelector('[data-reel-index="0"] [data-reel-caption]'),
    caption: null,
  },
];

async function showInSpanish(screen: Screen, socket: ReturnType<typeof fakeSocket>): Promise<{ readonly container: HTMLDivElement; readonly id: string }> {
  const container = await mountAt(screen.url, socket);
  await settleUntil(() => screen.first(container) !== undefined);
  const id = screen.first(container);
  if (id === undefined) throw new Error(`${screen.name} : aucune carte peinte`);
  await act(async () => {
    updateCardPost(appQueryClient, id, (post) => inSpanish(post, screen.type));
  });
  await settleUntil(() => read(screen.text(container, id)) === 'Hola a todos');
  return { container, id };
}

describe('`post:translation-updated` — le texte PEINT bascule sur chaque écran monté (#7383)', () => {
  for (const screen of SCREENS) {
    test(`${screen.name} : hors du prisme rien ne bouge, dans le prisme le texte peint bascule`, async () => {
      const socket = fakeSocket();
      const { container, id } = await showInSpanish(screen, socket);
      expect(read(screen.text(container, id))).toBe('Hola a todos');

      await act(async () => {
        socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: id, language: 'de', translation: entry('Hallo zusammen') });
      });
      await settle();
      expect(read(screen.text(container, id))).toBe('Hola a todos');

      await act(async () => {
        socket.fire(SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: id, language: 'fr', translation: entry('Bonjour à tous') });
      });
      await settleUntil(() => read(screen.text(container, id)) === 'Bonjour à tous');
      expect(read(screen.text(container, id))).toBe('Bonjour à tous');
      expect(screen.text(container, id)?.getAttribute('lang')).toBe('fr');
    });
  }
});

describe('`media:caption-translation-updated` — la légende PEINTE bascule sur chaque écran monté (#7382)', () => {
  for (const screen of SCREENS.filter((candidate) => candidate.caption !== null)) {
    const caption = screen.caption as (container: HTMLElement, id: string) => Element | null;
    test(`${screen.name} : hors du prisme rien ne bouge, dans le prisme la légende peinte bascule`, async () => {
      const socket = fakeSocket();
      const { container, id } = await showInSpanish(screen, socket);
      expect(read(caption(container, id))).toBe('El mercado');

      await act(async () => {
        socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, { mediaId: 'm-vivant', postId: id, language: 'de', translation: entry('Der Markt') });
      });
      await settle();
      expect(read(caption(container, id))).toBe('El mercado');

      await act(async () => {
        socket.fire(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, { mediaId: 'm-vivant', postId: id, language: 'fr', translation: entry('Le marché') });
      });
      await settleUntil(() => read(caption(container, id)) === 'Le marché');
      expect(read(caption(container, id))).toBe('Le marché');
      expect(caption(container, id)?.getAttribute('lang')).toBe('fr');
      expect(read(screen.text(container, id))).toBe('Hola a todos');
    });
  }
});
