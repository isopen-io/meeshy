import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { commentsQueryKey, type CommentInfiniteData, type PostComment } from '@/lib/api/publication-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { createRealtimeConnection, type RealtimeConnection } from '@/lib/api/socket';
import { createTypingStore } from '@/lib/api/typing-store';
import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { navigate, Router } from './route-table';

/**
 * **QUI AFFICHE CE QU'ON ÉCRIT ?** (#7394 ; CLAUDE.md § Prisme, cycle 122) —
 * `lib/api/socket-comment-translation.test.ts` prouve qu'une traduction de
 * commentaire reçue entre dans le fil et que la rangée SERVIE bascule au bon
 * rang. Ce fichier prouve le dernier cran : sur chaque hôte qui PEINT des
 * commentaires, monté en entier par l'adresse que l'application sert, la
 * traduction reçue par la socket change le TEXTE PEINT et son `lang` — ni un
 * état local figé au montage, ni une caisse lue à côté ne la retient.
 *
 * Les hôtes sont DEUX, et ils partagent la même caisse (`commentsQueryKey`) et
 * la même surface (`CommentThread`) : la fiche d'une publication
 * (`routes/post.tsx`) et la feuille de commentaires du lecteur de stories
 * (`story-comments-sheet.tsx`, ouverte par le bouton « Commentaires » du rail).
 * Aucune carte du Flux, des Réels, d'un profil ou d'un hashtag ne peint de
 * commentaire (`FeedPost` ne déclare pas `comments`).
 *
 * **CE QUE CE NIVEAU NE PEUT PAS DIRE : LE RANG.** Sous `bun test`, le prisme
 * des fixtures est une constante de module dont le seul rang sûr est `fr` —
 * même limite que `card-translation-live.test.tsx`. La descente sur un rang
 * inférieur est prouvée au niveau du modèle, où le prisme est un paramètre.
 * Une traduction HORS du prisme (`de`) est rejouée d'abord : elle ne doit rien
 * peindre.
 *
 * Le commentaire montré est RÉÉCRIT après le montage — espagnol, sans
 * traduction — pour que le témoin ne dépende ni de la langue ni des
 * traductions des fixtures.
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
  resetFixtureCommentsForTests();
  /* L'adresse du routeur est un état de MODULE : un fichier suivant qui
     monterait le routeur partirait de la dernière adresse visitée ici. */
  navigate('/feed', true);
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

/* Des BORNES d'attente, jamais des verdicts (#7310) : chaque attente rend la
   main dès que l'écran a peint ce qu'elle guette. */
const TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 20_000;

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

const entry = (text: string) => ({ text, translationModel: 'nllb-200', confidenceScore: 0.9, createdAt: '2026-09-21T18:00:00.000Z' });

/** Le paragraphe PEINT d'une rangée — celui qui porte le texte servi et son `lang`. */
const rowText = (container: HTMLElement, commentId: string): HTMLParagraphElement | null =>
  container.querySelector<HTMLParagraphElement>(`[data-comment-row="${commentId}"] p`);

const read = (element: Element | null | undefined): string | undefined => element?.textContent?.replace(/\s+/gu, ' ').trim();

type Host = {
  readonly name: string;
  readonly url: string;
  readonly postId: string;
  readonly commentId: string;
  /** Le geste qui fait paraître le fil — rien sur la fiche, le bouton du rail dans le lecteur. */
  readonly open: (container: HTMLElement) => void;
};

const HOSTS: readonly Host[] = [
  {
    name: 'la fiche d’une publication',
    url: '/post/post-image-en-translated',
    postId: 'post-image-en-translated',
    commentId: 'cm-en-1',
    open: () => undefined,
  },
  {
    name: 'la feuille de commentaires du lecteur de stories',
    url: '/story/st-amie-2',
    postId: 'st-amie-2',
    commentId: 'cm-st-2',
    open: (container) => container.querySelector<HTMLButtonElement>('[data-story-action="comments"]')?.click(),
  },
];

const inSpanish = (comment: PostComment): PostComment => ({ ...comment, content: 'Hola a todos', originalLanguage: 'es', translations: null });

async function showInSpanish(host: Host, socket: ReturnType<typeof fakeSocket>): Promise<HTMLDivElement> {
  const container = await mountAt(host.url, socket);
  await settleUntil(() => rowText(container, host.commentId) !== null || container.querySelector('[data-story-action="comments"]') !== null);
  await act(async () => host.open(container));
  await settleUntil(() => rowText(container, host.commentId) !== null);
  if (rowText(container, host.commentId) === null) throw new Error(`${host.name} : aucune rangée ${host.commentId} peinte`);
  await act(async () => {
    appQueryClient.setQueryData<CommentInfiniteData>(commentsQueryKey(host.postId), (data) =>
      data === undefined
        ? data
        : { ...data, pages: data.pages.map((page) => ({ ...page, comments: page.comments.map((c) => (c.id === host.commentId ? inSpanish(c) : c)) })) },
    );
  });
  await settleUntil(() => read(rowText(container, host.commentId)) === 'Hola a todos');
  return container;
}

describe('`comment:translation-updated` — le commentaire PEINT bascule sur chaque hôte monté (#7394)', () => {
  for (const host of HOSTS) {
    test(`${host.name} : hors du prisme rien ne bouge, dans le prisme le texte peint et son \`lang\` basculent`, async () => {
      const socket = fakeSocket();
      const container = await showInSpanish(host, socket);
      expect(read(rowText(container, host.commentId))).toBe('Hola a todos');
      expect(rowText(container, host.commentId)?.hasAttribute('lang')).toBe(false);

      await act(async () => {
        socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, {
          postId: host.postId,
          commentId: host.commentId,
          language: 'de',
          translation: entry('Hallo zusammen'),
        });
      });
      await settle();
      expect(read(rowText(container, host.commentId))).toBe('Hola a todos');

      await act(async () => {
        socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, {
          postId: host.postId,
          commentId: host.commentId,
          language: 'fr',
          translation: entry('Bonjour à tous'),
        });
      });
      await settleUntil(() => read(rowText(container, host.commentId)) === 'Bonjour à tous');
      expect(read(rowText(container, host.commentId))).toBe('Bonjour à tous');
      expect(rowText(container, host.commentId)?.getAttribute('lang')).toBe('fr');
    }, TEST_TIMEOUT_MS);
  }
});
