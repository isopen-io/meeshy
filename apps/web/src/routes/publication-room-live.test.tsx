import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { updateCardPost } from '@/lib/api/card-caches';
import type { FeedPost } from '@/lib/api/feed-pages';
import { pageOfComments, resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { commentsQueryKey, type CommentInfiniteData, type PostComment } from '@/lib/api/publication-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { createRealtimeConnection, type RealtimeConnection } from '@/lib/api/socket';
import { createTypingStore } from '@/lib/api/typing-store';
import { conversationStore } from '@/lib/conversation-store';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { createFakeGatewaySocket, type FakeGatewaySocket } from '@/test-support/fake-gateway-socket';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { navigate, Router } from './route-table';

/**
 * **LA SALLE D'UNE PUBLICATION** (#7395) — ce qu'un lecteur qui n'est PAS ami
 * de l'auteur reçoit en direct, sur chaque écran qui montre une publication en
 * détail ou son fil de commentaires.
 *
 * La passerelle adresse la vie d'une publication à deux audiences : les salons
 * de fil des amis de l'auteur (filtrés par la visibilité) et la SALLE de la
 * publication (`post:<id>`), que n'importe quel lecteur autorisé rejoint par
 * `post:join`. Un lecteur non ami d'une publication PUBLIQUE n'est dans aucun
 * salon de fil : sans la salle, rien ne lui parvient — ni la traduction du
 * texte, ni un commentaire, ni un compte d'aimés. Mesuré avant ce lot :
 * `CLIENT_EVENTS.JOIN_POST` n'était émis nulle part dans `apps/web/src`.
 *
 * Les autres témoins temps réel (`card-translation-live`,
 * `comment-translation-live`) remettent la charge à TOUT écouteur : ils
 * prouvent qu'un événement reçu est appliqué. Celui-ci prouve qu'il ARRIVE —
 * `createFakeGatewaySocket` ne livre que ce qui vise une salle où le socket se
 * trouve (voir son doc-comment).
 *
 * Politique tenue (miroir `SocialSocketManager.swift`, compteur en plus) :
 * rejoindre à l'ouverture, quitter en sortant ; rejoindre À NOUVEAU à chaque
 * (ré)authentification ; une salle tenue par deux hôtes n'est quittée qu'au
 * départ du dernier ; les Réels n'en tiennent qu'UNE, celle du réel où le
 * lecteur s'arrête.
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

type Mounted = { readonly container: HTMLDivElement; readonly root: Root };

let screens: readonly Mounted[] = [];
let realtime: RealtimeConnection | null = null;

afterEach(() => {
  for (const screen of screens) {
    act(() => screen.root.unmount());
    screen.container.remove();
  }
  screens = [];
  realtime?.destroy();
  realtime = null;
  appQueryClient.clear();
  resetFixtureCommentsForTests();
  navigate('/feed', true);
});

/* Des BORNES d'attente, jamais des verdicts (#7310) : chaque attente rend la
   main dès que l'écran a peint ce qu'elle guette. Le plafond d'un test couvre
   plusieurs attentes ÉCHUES — avant le correctif, c'est une ASSERTION qui doit
   rougir, jamais le chronomètre (un test qui déborde laisse son corps courir
   sous le démontage du suivant). */
const TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 45_000;

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

function connect(socket: FakeGatewaySocket): void {
  realtime = createRealtimeConnection(
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
}

async function mountScreen(): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const screen = { container, root };
  screens = [...screens, screen];
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <Router wrap={(children) => children} skeleton={null} />
      </QueryClientProvider>,
    );
  });
  return screen;
}

async function openAt(url: string, socket: FakeGatewaySocket): Promise<HTMLDivElement> {
  navigate(url, true);
  connect(socket);
  const { container } = await mountScreen();
  return container;
}

async function unmount(screen: Mounted): Promise<void> {
  await act(async () => screen.root.unmount());
  screen.container.remove();
  screens = screens.filter((candidate) => candidate !== screen);
}

const entry = (text: string) => ({ text, translationModel: 'nllb-200', confidenceScore: 0.9, createdAt: '2026-09-22T09:00:00.000Z' });

const read = (element: Element | null | undefined): string | undefined => element?.textContent?.replace(/\s+/gu, ' ').trim();

/** Réécrit la publication montrée — espagnol, sans traduction — pour ne dépendre
 * ni de la langue ni des traductions des fixtures (motif `card-translation-live`). */
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

const card = (container: HTMLElement, id: string) => container.querySelector(`[data-feed-card-id="${id}"]`);
const cardText = (container: HTMLElement, id: string) => container.querySelector(`[data-feed-card-id="${id}"] [data-feed-text]`);

const commentRow = (container: HTMLElement, commentId: string) => container.querySelector(`[data-comment-row="${commentId}"] p`);

/** Un commentaire NEUF, de la forme que les fixtures servent — copié d'une rangée réelle. */
function freshComment(id: string, content: string): PostComment {
  const served = pageOfComments('post-image-en-translated', undefined).comments[0];
  if (served === undefined) throw new Error('aucun commentaire de fixtures à copier');
  return { ...served, id, content, originalLanguage: 'fr', translations: null, createdAt: '2026-09-22T09:00:00.000Z' };
}

const threadLoaded = (postId: string) => appQueryClient.getQueryData<CommentInfiniteData>(commentsQueryKey(postId)) !== undefined;

function commentAdded(postId: string, comment: PostComment) {
  return { postId, comment, commentCount: 99 };
}

const joins = (socket: FakeGatewaySocket, postId: string) =>
  socket.roomEmits().filter(([event, id]) => event === CLIENT_EVENTS.JOIN_POST && id === postId).length;

const leaves = (socket: FakeGatewaySocket, postId: string) =>
  socket.roomEmits().filter(([event, id]) => event === CLIENT_EVENTS.LEAVE_POST && id === postId).length;

const FICHE_POST = 'post-image-fr';

async function openFiche(socket: FakeGatewaySocket): Promise<HTMLDivElement> {
  const container = await openAt(`/post/${FICHE_POST}`, socket);
  await settleUntil(() => card(container, FICHE_POST) !== null && threadLoaded(FICHE_POST));
  return container;
}

/** APRÈS le montage de tous les écrans : un écran monté ensuite relirait la
 * publication des fixtures et effacerait la réécriture. */
async function rewriteFicheInSpanish(containers: readonly HTMLElement[]): Promise<void> {
  await act(async () => updateCardPost(appQueryClient, FICHE_POST, (post) => inSpanish(post, 'POST')));
  await settleUntil(() => containers.every((container) => read(cardText(container, FICHE_POST)) === 'Hola a todos'));
}

async function openFicheInSpanish(socket: FakeGatewaySocket): Promise<HTMLDivElement> {
  const container = await openFiche(socket);
  await rewriteFicheInSpanish([container]);
  return container;
}

describe('un lecteur NON AMI de l’auteur reçoit en direct ce qui part vers la salle de la publication (#7395)', () => {
  test('la fiche : la traduction du texte ET un nouveau commentaire', async () => {
    const socket = createFakeGatewaySocket();
    const container = await openFicheInSpanish(socket);
    const room = `post:${FICHE_POST}`;

    await act(async () => {
      socket.broadcast(room, SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: FICHE_POST, language: 'fr', translation: entry('Bonjour à tous') });
    });
    await settleUntil(() => read(cardText(container, FICHE_POST)) === 'Bonjour à tous');
    expect(read(cardText(container, FICHE_POST))).toBe('Bonjour à tous');

    const arrived = freshComment('cm-live-fiche', 'Arrivé par la salle');
    await act(async () => socket.broadcast(room, SERVER_EVENTS.COMMENT_ADDED, commentAdded(FICHE_POST, arrived)));
    await settleUntil(() => read(commentRow(container, 'cm-live-fiche')) === 'Arrivé par la salle');
    expect(read(commentRow(container, 'cm-live-fiche'))).toBe('Arrivé par la salle');
  }, TEST_TIMEOUT_MS);

  test('la feuille de commentaires du lecteur de stories : un nouveau commentaire ET la traduction d’un commentaire — puis la fermer quitte la salle', async () => {
    const storyId = 'st-amie-2';
    const commentId = 'cm-st-2';
    const socket = createFakeGatewaySocket();
    const container = await openAt(`/story/${storyId}`, socket);
    await settleUntil(() => container.querySelector('[data-story-action="comments"]') !== null);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-story-action="comments"]')?.click());
    await settleUntil(() => commentRow(container, commentId) !== null);
    const room = `post:${storyId}`;

    const arrived = freshComment('cm-live-story', 'Vu depuis la story');
    await act(async () => socket.broadcast(room, SERVER_EVENTS.COMMENT_ADDED, commentAdded(storyId, arrived)));
    await settleUntil(() => read(commentRow(container, 'cm-live-story')) === 'Vu depuis la story');
    expect(read(commentRow(container, 'cm-live-story'))).toBe('Vu depuis la story');

    await act(async () => {
      appQueryClient.setQueryData<CommentInfiniteData>(commentsQueryKey(storyId), (data) =>
        data === undefined
          ? data
          : {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                comments: page.comments.map((c) => (c.id === commentId ? { ...c, content: 'Hola a todos', originalLanguage: 'es', translations: null } : c)),
              })),
            },
      );
    });
    await settleUntil(() => read(commentRow(container, commentId)) === 'Hola a todos');
    await act(async () => {
      socket.broadcast(room, SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { postId: storyId, commentId, language: 'fr', translation: entry('Bonjour à tous') });
    });
    await settleUntil(() => read(commentRow(container, commentId)) === 'Bonjour à tous');
    expect(read(commentRow(container, commentId))).toBe('Bonjour à tous');

    await act(async () => container.querySelector<HTMLButtonElement>('[data-story-comments-close]')?.click());
    await settleUntil(() => !socket.rooms().has(room));
    expect(socket.rooms().has(room)).toBe(false);
    expect(leaves(socket, storyId)).toBe(1);
  }, TEST_TIMEOUT_MS);

  test('les Réels : la traduction du texte ET le compte d’aimés du réel visible', async () => {
    const reelId = 'reel-studio';
    const socket = createFakeGatewaySocket();
    const container = await openAt(`/reel/${reelId}`, socket);
    const caption = () => container.querySelector('[data-reel-index="0"] [data-reel-caption]');
    const likes = () => container.querySelector('[data-reel-index="0"] [data-reel-gesture="like"] > span:last-child');
    await settleUntil(() => caption() !== null);
    await act(async () => updateCardPost(appQueryClient, reelId, (post) => inSpanish(post, 'REEL')));
    await settleUntil(() => read(caption()) === 'Hola a todos');
    const room = `post:${reelId}`;
    await settleUntil(() => socket.rooms().has(room));

    await act(async () => {
      socket.broadcast(room, SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: reelId, language: 'fr', translation: entry('Bonjour à tous') });
    });
    await settleUntil(() => read(caption()) === 'Bonjour à tous');
    expect(read(caption())).toBe('Bonjour à tous');

    await act(async () => socket.broadcast(room, SERVER_EVENTS.POST_LIKED, { postId: reelId, userId: 'u-inconnu', likeCount: 4242 }));
    await settleUntil(() => read(likes()) === '4242');
    expect(read(likes())).toBe('4242');
  }, TEST_TIMEOUT_MS);
});

describe('la reconnexion rend la salle — sans rouvrir l’écran (#7395)', () => {
  test('après une coupure, la passerelle a vidé les salles du socket ; la fiche y est de nouveau à la réauthentification', async () => {
    const socket = createFakeGatewaySocket();
    const container = await openFicheInSpanish(socket);
    const room = `post:${FICHE_POST}`;
    await settleUntil(() => socket.rooms().has(room));

    await act(async () => socket.drop());
    expect(socket.rooms().has(room)).toBe(false);
    await act(async () => socket.connect());
    expect(socket.rooms().has(room)).toBe(true);

    await act(async () => {
      socket.broadcast(room, SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: FICHE_POST, language: 'fr', translation: entry('Bonjour à tous') });
    });
    await settleUntil(() => read(cardText(container, FICHE_POST)) === 'Bonjour à tous');
    expect(read(cardText(container, FICHE_POST))).toBe('Bonjour à tous');
  }, TEST_TIMEOUT_MS);
});

describe('deux hôtes sur la même publication tiennent UNE salle (#7395)', () => {
  test('démonter l’un ne sort pas l’autre de la salle ; démonter le dernier la quitte', async () => {
    const socket = createFakeGatewaySocket();
    const firstContainer = await openFiche(socket);
    const second = await mountScreen();
    await settleUntil(() => card(second.container, FICHE_POST) !== null);
    await rewriteFicheInSpanish([firstContainer, second.container]);
    const room = `post:${FICHE_POST}`;
    expect(joins(socket, FICHE_POST)).toBe(1);
    const [first] = screens;
    if (first === undefined) throw new Error('premier écran absent');

    await unmount(first);
    await settle();
    expect(leaves(socket, FICHE_POST)).toBe(0);
    expect(socket.rooms().has(room)).toBe(true);

    await act(async () => {
      socket.broadcast(room, SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId: FICHE_POST, language: 'fr', translation: entry('Bonjour à tous') });
    });
    await settleUntil(() => read(cardText(second.container, FICHE_POST)) === 'Bonjour à tous');
    expect(read(cardText(second.container, FICHE_POST))).toBe('Bonjour à tous');

    await unmount(second);
    await settle();
    expect(leaves(socket, FICHE_POST)).toBe(1);
    expect(socket.rooms().has(room)).toBe(false);
  }, TEST_TIMEOUT_MS);
});

describe('les Réels qui défilent ne tiennent qu’UNE salle (#7395)', () => {
  test('la salle suit le réel où le lecteur S’ARRÊTE — celles qu’il traverse d’un trait ne sont jamais rejointes', async () => {
    const socket = createFakeGatewaySocket();
    const container = await openAt('/reel/reel-studio', socket);
    await settleUntil(() => container.querySelectorAll('[data-reel-index]').length >= 4);
    await settleUntil(() => socket.rooms().has('post:reel-studio'));
    const pager = container.querySelector<HTMLDivElement>('[data-reels-pager]');
    if (pager === null) throw new Error('pager absent');
    const idAt = (index: number) => container.querySelector(`[data-reel-index="${index}"]`)?.getAttribute('data-reel') ?? undefined;
    const PAGE = 800;
    Object.defineProperty(pager, 'clientHeight', { configurable: true, value: PAGE });

    const scrollTo = async (index: number) => {
      await act(async () => {
        pager.scrollTop = index * PAGE;
        pager.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    };
    await scrollTo(1);
    await scrollTo(2);
    await scrollTo(3);
    const target = idAt(3);
    if (target === undefined) throw new Error('réel 3 sans identifiant');
    await settleUntil(() => socket.rooms().has(`post:${target}`));

    expect([...socket.rooms()]).toEqual([`post:${target}`]);
    expect(leaves(socket, 'reel-studio')).toBe(1);
    const crossed = [idAt(1), idAt(2)].filter((id): id is string => id !== undefined);
    expect(crossed.length).toBe(2);
    for (const id of crossed) expect(joins(socket, id)).toBe(0);
  }, TEST_TIMEOUT_MS);
});
