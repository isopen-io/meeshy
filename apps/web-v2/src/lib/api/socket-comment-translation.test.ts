import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { CommentTranslationUpdatedEventData } from '@meeshy/shared/types/post';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import { resolveFeedText } from '@/lib/feed/text';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { commentsQueryKey, type CommentInfiniteData, type PostComment } from './publication-comments';
import { createRealtimeConnection, type RealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * **UN COMMENTAIRE TRADUIT EN DIRECT BASCULE DANS LA LANGUE DU LECTEUR** (#7394).
 *
 * `comment:translation-updated` — `CommentTranslationUpdatedEventData`
 * (`packages/shared/types/post.ts`) : `postId`, `commentId`, `language`,
 * `translation { text, translationModel, confidenceScore?, createdAt }` — la
 * passerelle le diffuse dès que NLLB livre la traduction d'un commentaire
 * (`PostTranslationService.handleCommentTranslationCompleted` →
 * `SocialEventsHandler.broadcastCommentTranslationUpdated`). iOS l'écoute sur
 * le Flux, la fiche, la feuille de commentaires et le lecteur de stories ;
 * web-v2 ne l'écoutait NULLE PART : un commentaire écrit dans une autre langue
 * restait dans celle de son auteur tant que le fil n'était pas relu.
 *
 * Chaque témoin lit ce que la rangée SERT — `resolveFeedText`, la descente que
 * `comment-row.tsx` appelle à chaque peinture —, jamais seulement ce que la
 * caisse contient : une traduction rangée qu'aucun résolveur n'élit n'a servi
 * personne (CLAUDE.md § Prisme, cycle 122).
 *
 * **LE PRISME A DEUX RANGS, ET LA LANGUE REÇUE EST CELLE DU SECOND** : au
 * rang 1, la règle juste et le court-circuit interdit rendent le même verdict
 * (leçon 261). Le témoin HORS PRISME exige que la traduction soit RANGÉE — la
 * passerelle la persiste dans `PostComment.translations`, et la prochaine
 * lecture du fil la servirait — sans que le texte servi bouge : sans cette
 * exigence, il serait vert sur la base qui n'écoute rien.
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

function connected(): {
  readonly socket: ReturnType<typeof fakeSocket>;
  readonly queryClient: QueryClient;
  readonly connection: RealtimeConnection;
} {
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
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, connection };
}

/**
 * L'application arrive par `import()` (D-98, même motif que `comment:added`) :
 * elle se résout en micro-tâches, jamais dans le tour du `fire`. On BORNE en
 * TEMPS et on relit la condition à chaque tour (#6187) — un budget de tours
 * fixe rougit sous charge.
 */
const FLUSH_TIMEOUT_MS = 2000;
const flush = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (condition() || Date.now() >= deadline) return;
  }
};

/** L'ABSENCE se prouve par une attente fixe : l'`import()` d'un module déjà
 * résolu tient en quelques tours, et ce qui n'a pas bougé après ne bougera pas. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

const PRISM = ['fr', 'en'] as const;

const entry = (text: string) => ({ text, translationModel: 'nllb-200', confidenceScore: 0.9, createdAt: '2026-09-21T18:00:00.000Z' });

const author = { id: 'u-noa', displayName: 'Noa Berger', username: 'noa' };

/** Un commentaire ESPAGNOL — hors du prisme `[fr, en]` —, sans traduction. */
const spanish = (id: string, patch: Partial<PostComment> = {}): PostComment => ({
  id,
  content: 'Hola a todos',
  createdAt: '2026-09-21T10:00:00.000Z',
  author,
  originalLanguage: 'es',
  translations: null,
  ...patch,
});

/**
 * LE FIL TEL QUE LA CAISSE LE TIENT — deux pages, parce qu'une traduction
 * peut viser une rangée posée par une page PLUS ANCIENNE que la première.
 * La page 2 porte une RÉPONSE (`parentId`) : web-v2 n'a pas de caisse de
 * réponses imbriquées (#7118), et une réponse n'entre dans le fil que par
 * `comment:added`, qui la range dans la liste à plat.
 */
const thread = (first: readonly PostComment[], second: readonly PostComment[] = []): CommentInfiniteData => ({
  pages: [
    { comments: first, pagination: { limit: 20, hasMore: second.length > 0, nextCursor: second.length > 0 ? 'c2' : null } },
    ...(second.length > 0 ? [{ comments: second, pagination: { limit: 20, hasMore: false, nextCursor: null } }] : []),
  ],
  pageParams: second.length > 0 ? [undefined, 'c2'] : [undefined],
});

const delivery = (commentId: string, language: string, text: string, postId = 'p-1'): CommentTranslationUpdatedEventData => ({
  postId,
  commentId,
  language,
  translation: entry(text),
});

const rowOf = (queryClient: QueryClient, commentId: string, postId = 'p-1'): PostComment | undefined =>
  queryClient
    .getQueryData<CommentInfiniteData>(commentsQueryKey(postId))
    ?.pages.flatMap((page) => page.comments)
    .find((comment) => comment.id === commentId);

const servedOf = (comment: PostComment | undefined) =>
  comment === undefined
    ? undefined
    : resolveFeedText({
        preferredLanguages: PRISM,
        originalLanguage: comment.originalLanguage,
        translations: comment.translations,
        content: comment.content,
      });

describe('`comment:translation-updated` — un commentaire bascule dans la langue du lecteur (#7394)', () => {
  test('une traduction de RANG 2, sans traduction de rang 1, fait basculer le commentaire', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')]));
    expect(servedOf(rowOf(queryClient, 'c-1'))?.text).toBe('Hola a todos');

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await flush(() => servedOf(rowOf(queryClient, 'c-1'))?.text === 'Hello everyone');

    const served = servedOf(rowOf(queryClient, 'c-1'));
    expect(served?.text).toBe('Hello everyone');
    expect(served?.language).toBe('en');
    expect(served?.translated).toBe(true);
  });

  test('une traduction HORS du prisme est rangée, et le texte servi ne bouge pas', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')]));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'de', 'Hallo zusammen'));
    await flush(() => rowOf(queryClient, 'c-1')?.translations !== null);

    const row = rowOf(queryClient, 'c-1');
    expect(row?.translations).toEqual({ de: entry('Hallo zusammen') });
    expect(servedOf(row)?.text).toBe('Hola a todos');
    expect(servedOf(row)?.translated).toBe(false);
  });

  test('une RÉPONSE posée par une page plus ancienne bascule au RANG 2, et seule elle', async () => {
    const { socket, queryClient } = connected();
    const parent = spanish('c-1', { replyCount: 1 });
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([parent], [spanish('c-reponse', { parentId: 'c-1', content: 'Muy bien' })]));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-reponse', 'en', 'Very good'));
    await flush(() => servedOf(rowOf(queryClient, 'c-reponse'))?.text === 'Very good');

    expect(servedOf(rowOf(queryClient, 'c-reponse'))?.text).toBe('Very good');
    expect(servedOf(rowOf(queryClient, 'c-reponse'))?.language).toBe('en');
    expect(rowOf(queryClient, 'c-1')).toBe(parent);
  });

  test('une RÉPONSE traduite HORS du prisme est rangée, et le texte servi ne bouge pas', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')], [spanish('c-reponse', { parentId: 'c-1', content: 'Muy bien' })]));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-reponse', 'de', 'Sehr gut'));
    await flush(() => rowOf(queryClient, 'c-reponse')?.translations !== null);

    const reply = rowOf(queryClient, 'c-reponse');
    expect(reply?.translations).toEqual({ de: entry('Sehr gut') });
    expect(servedOf(reply)?.text).toBe('Muy bien');
    expect(servedOf(reply)?.translated).toBe(false);
  });

  /* La règle 3 du Prisme, dans les deux sens : la langue d'ORIGINE concourt à
     SON rang. Rang 2 ⇒ la traduction du rang 1 la détrône (« Bonjour », jamais
     « Hello ») ; rang 1 ⇒ aucune traduction reçue ne la détrône. */
  test('commentaire ANGLAIS (rang 2), traduction FRANÇAISE reçue ⇒ « Bonjour à tous », jamais l’original', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1', { content: 'Hello everyone', originalLanguage: 'en' })]));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'fr', 'Bonjour à tous'));
    await flush(() => servedOf(rowOf(queryClient, 'c-1'))?.text === 'Bonjour à tous');

    expect(servedOf(rowOf(queryClient, 'c-1'))?.text).toBe('Bonjour à tous');
    expect(servedOf(rowOf(queryClient, 'c-1'))?.language).toBe('fr');
  });

  test('commentaire FRANÇAIS (rang 1), traduction anglaise reçue ⇒ rangée, et l’original reste servi', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1', { content: 'Bonjour à tous', originalLanguage: 'fr' })]));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await flush(() => rowOf(queryClient, 'c-1')?.translations !== null);

    expect(rowOf(queryClient, 'c-1')?.translations).toEqual({ en: entry('Hello everyone') });
    expect(servedOf(rowOf(queryClient, 'c-1'))?.text).toBe('Bonjour à tous');
  });

  test('la fusion se fait PAR LANGUE : une seconde passe remplace, une autre langue s’ajoute, jamais un doublon', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(
      commentsQueryKey('p-1'),
      thread([spanish('c-1', { translations: { de: entry('Hallo zusammen'), en: entry('Hi all') } })]),
    );

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await flush(() => servedOf(rowOf(queryClient, 'c-1'))?.text === 'Hello everyone');

    expect(rowOf(queryClient, 'c-1')?.translations).toEqual({ de: entry('Hallo zusammen'), en: entry('Hello everyone') });
  });

  test('les autres champs de la rangée survivent — le cœur du lecteur, le compte, le contenu d’origine', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1', { isLikedByMe: true, likeCount: 4, replyCount: 2 })]));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await flush(() => servedOf(rowOf(queryClient, 'c-1'))?.text === 'Hello everyone');

    const row = rowOf(queryClient, 'c-1');
    expect(servedOf(row)?.text).toBe('Hello everyone');
    expect(row?.isLikedByMe).toBe(true);
    expect(row?.likeCount).toBe(4);
    expect(row?.replyCount).toBe(2);
    expect(row?.content).toBe('Hola a todos');
    expect(row?.originalLanguage).toBe('es');
  });

  test('seule la page qui porte le commentaire change de référence ; les rangées voisines restent identiques', async () => {
    const { socket, queryClient } = connected();
    const neighbour = spanish('c-voisin');
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1'), neighbour], [spanish('c-ancien')]));
    const before = queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p-1'));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await flush(() => servedOf(rowOf(queryClient, 'c-1'))?.text === 'Hello everyone');

    const after = queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p-1'));
    expect(after?.pages[0]).not.toBe(before?.pages[0]);
    expect(after?.pages[0]?.comments[1]).toBe(neighbour);
    expect(after?.pages[1]).toBe(before?.pages[1]);
  });
});

describe('`comment:translation-updated` — ce qui ne doit RIEN changer ne change rien', () => {
  test('un commentaire que le fil ne tient pas, ou le fil d’une autre publication, laisse la caisse TELLE QUELLE', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')]));
    const before = queryClient.getQueryData(commentsQueryKey('p-1'));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-inconnu', 'en', 'Hello'));
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello', 'p-autre'));
    await settled();

    expect(queryClient.getQueryData(commentsQueryKey('p-1'))).toBe(before);
  });

  test('un fil jamais ouvert n’est pas fabriqué', async () => {
    const { socket, queryClient } = connected();

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello'));
    await settled();

    expect(queryClient.getQueryData(commentsQueryKey('p-1'))).toBeUndefined();
    expect(queryClient.getQueryCache().find({ queryKey: commentsQueryKey('p-1') })).toBeUndefined();
  });

  test('une charge MALFORMÉE est ignorée, sans lever', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')]));
    const before = queryClient.getQueryData(commentsQueryKey('p-1'));

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, null);
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { postId: 'p-1', commentId: 'c-1', language: 'en' });
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { postId: 'p-1', language: 'en', translation: entry('x') });
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { postId: 'p-1', commentId: '', language: 'en', translation: entry('x') });
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { postId: 'p-1', commentId: 'c-1', language: '', translation: entry('x') });
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { postId: 'p-1', commentId: 'c-1', language: 'en', translation: { text: 42 } });
    await settled();

    expect(queryClient.getQueryData(commentsQueryKey('p-1'))).toBe(before);
  });

  /* LA RÉFÉRENCE ne suffit pas à le dire : `setQueryData` partage la structure
     d'une donnée égale et rend la même référence. Ce qu'une réécriture inutile
     CHANGE, c'est l'état — une caisse périmée redevient fraîche, et son écran
     ne relit plus (#7385, #7399). */
  test('une rediffusion du MÊME texte ne rend pas FRAÎCHE une caisse périmée', async () => {
    const { socket, queryClient } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')]));
    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await flush(() => servedOf(rowOf(queryClient, 'c-1'))?.text === 'Hello everyone');
    await queryClient.invalidateQueries({ queryKey: commentsQueryKey('p-1'), exact: true, refetchType: 'none' });

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await settled();

    expect(queryClient.getQueryState(commentsQueryKey('p-1'))?.isInvalidated).toBe(true);
  });

  test('`destroy` retire l’écoute : une traduction reçue après ne change rien', async () => {
    const { socket, queryClient, connection } = connected();
    queryClient.setQueryData(commentsQueryKey('p-1'), thread([spanish('c-1')]));
    const before = queryClient.getQueryData(commentsQueryKey('p-1'));
    connection.destroy();

    socket.fire(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, delivery('c-1', 'en', 'Hello everyone'));
    await settled();

    expect(queryClient.getQueryData(commentsQueryKey('p-1'))).toBe(before);
  });
});
