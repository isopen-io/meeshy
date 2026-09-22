import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';
import { served } from './prism';
import { deliveryOf } from '@/lib/view/message';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { conversationStore } from '@/lib/conversation-store';
import { mergeTimeline } from '@/lib/grouping';
import { createOutboxStore, entriesOf, type OutboxState } from '@/lib/send/outbox-store';
import type { StoreApi } from 'zustand/vanilla';
/* La forme `InfiniteData` du cache du fil et les fabriques qui la sèment
   vivent en UN endroit depuis #7017 — deux copies seraient deux occasions de
   la faire dériver le jour où elle change, ce que #6972 venait précisément de
   retirer du code de production. */
import { countingQueryFn, localMessage, threadOf, threadPages } from '@/test-support/thread-cache';
import { messagesQueryKey } from './messages';
import {
  applyConversationUnreadUpdated,
  applyConversationUpdated,
  applyMessageNew,
  applyMessageTranslation,
  applyReadStatusUpdated,
  isConversationUpdated,
  isMessageTranslationEvent,
  isReadStatusUpdated,
  isSocketMessage,
  neutralLastMessageFromPreview,
} from './realtime-apply';
import type { Conversation, Message } from './types';

/** Un outbox NEUF par témoin — jamais l'instance partagée `outboxStore` : un
 * témoin qui la muterait laisserait une entrée à un autre fichier de témoins
 * (motif `createTypingStore()` dans `socket.test.ts`). */
const freshOutbox = (): StoreApi<OutboxState> => createOutboxStore();

/**
 * `seedConversations`/`readConversations` (#6195) — le cache de liste change
 * de FORME (tableau → `InfiniteData`) ; ces deux fabriques de témoin
 * ISOLENT ce changement des ~25 sites de ce fichier qui semaient/lisaient
 * directement `CONVERSATIONS_QUERY_KEY` — aucune règle testée ne change,
 * seule la forme du cache qui la porte.
 */
function seedConversations(client: QueryClient, conversations: readonly Conversation[]): void {
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations,
        pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
}

function readConversations(client: QueryClient): readonly Conversation[] | undefined {
  const data = client.getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(
    CONVERSATIONS_QUERY_KEY,
  );
  return data?.pages.flatMap((p) => p.conversations);
}

const conv = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c-a',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

function socketMessage(partial: Partial<SocketIOMessage>): SocketIOMessage {
  return {
    id: 'm-remote-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'salut depuis le socket',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: '2026-09-12T09:05:00.000Z' as unknown as Date,
    ...partial,
  };
}

describe('isSocketMessage (#5793) — décodage FAIL-CLOSED', () => {
  test('une charge complète est reconnue', () => {
    expect(isSocketMessage(socketMessage({}))).toBe(true);
  });

  test('une charge à qui il manque `senderId` est REJETÉE, jamais une exception', () => {
    const { senderId: _senderId, ...rest } = socketMessage({});
    expect(isSocketMessage(rest)).toBe(false);
  });

  test('`null`/`undefined`/un tableau sont rejetés', () => {
    expect(isSocketMessage(null)).toBe(false);
    expect(isSocketMessage(undefined)).toBe(false);
    expect(isSocketMessage([])).toBe(false);
  });
});

describe('applyMessageNew (#5793) — le puits unique de message:new', () => {
  test('insère dans le fil OUVERT sans déclencher aucune requête réseau', () => {
    const client = new QueryClient();
    const calls = { count: 0 };
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));
    // `queryFn`/`queryKey` posés APRÈS la donnée : une requête déclenchée par
    // erreur ferait échouer ce test au lieu de passer silencieusement.
    void client.getQueryCache().build(client, { queryKey: messagesQueryKey('c-a'), queryFn: countingQueryFn(calls) });

    applyMessageNew(client, freshOutbox(), socketMessage({}));

    const page = threadOf(client, 'c-a');
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.id).toBe('m-remote-1');
    expect(page?.messages[0]?.content).toBe('salut depuis le socket');
    expect(calls.count).toBe(0);
  });

  test('un message pour un fil FERMÉ (page absente) ne construit aucune page', () => {
    const client = new QueryClient();
    applyMessageNew(client, freshOutbox(), socketMessage({ conversationId: 'c-fermee' }));
    expect(client.getQueryData(messagesQueryKey('c-fermee'))).toBeUndefined();
  });

  test('un `message:new` portant le `clientMessageId` d’un envoi local PROMEUT la rangée, ne la double jamais (D-11/D-28)', () => {
    const client = new QueryClient();
    const local = localMessage({ id: 'cid-abc', clientMessageId: 'cid-abc' } as Message & { clientMessageId: string });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([local]));

    applyMessageNew(client, freshOutbox(), socketMessage({ id: 'm-server-9', clientMessageId: 'cid-abc' }));

    const page = threadOf(client, 'c-a');
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.id).toBe('m-server-9');
  });

  /**
   * LE FIL QUE `routes/thread.tsx` REND, pas la seule page du cache
   * (revue-correction #5793, défaut BLOQUANT). Un envoi EN VOL n'est PAS dans
   * la page du cache : sa rangée optimiste vit dans l'OUTBOX
   * (`send/outbox-store.ts`, D-28) et le fil affiche
   * `mergeTimeline(page.messages, entries.map(e => e.message))`
   * (`thread.tsx:250`). Dédoublonner la seule page laissait donc DEUX lignes
   * pour un même message pendant toute la fenêtre entre l'écho socket et
   * l'accusé REST — et pour TOUJOURS si l'accusé se perd, l'entrée d'outbox
   * restant alors `failed` à côté du message bel et bien distribué.
   *
   * L'écho porte le `clientMessageId` UNIQUEMENT dans la room personnelle de
   * l'expéditeur (`stripClientMessageId`,
   * `services/gateway/src/socketio/MeeshySocketIOManager.ts:3011-3039`) : sa
   * présence PROUVE que c'est notre propre envoi, jamais l'écho d'un pair.
   */
  test('un écho socket portant le cid d’une entrée d’OUTBOX promeut l’entrée — le fil RENDU n’a qu’UNE ligne', () => {
    const client = new QueryClient();
    const outbox = freshOutbox();
    const local = localMessage({ id: 'cid-abc', clientMessageId: 'cid-abc' } as Message & { clientMessageId: string });
    outbox.getState().enqueue('c-a', { message: local as never, delivery: 'pending', attempts: 1, startedAt: 0 });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));

    applyMessageNew(client, outbox, socketMessage({ id: 'm-server-9', clientMessageId: 'cid-abc' }));

    const page = threadOf(client, 'c-a');
    const rendered = mergeTimeline(page?.messages ?? [], entriesOf(outbox.getState(), 'c-a').map((e) => e.message));
    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.id).toBe('m-server-9');
    // La promotion COMPTE comme confirmation — c'est ce que `use-send` annonce.
    expect(outbox.getState().confirmed['c-a']).toBe(1);
  });

  test('un écho SANS cid (celui d’un pair) ne touche JAMAIS l’outbox du lecteur', () => {
    const client = new QueryClient();
    const outbox = freshOutbox();
    const local = localMessage({ id: 'cid-abc', clientMessageId: 'cid-abc' } as Message & { clientMessageId: string });
    outbox.getState().enqueue('c-a', { message: local as never, delivery: 'pending', attempts: 1, startedAt: 0 });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));

    applyMessageNew(client, outbox, socketMessage({ id: 'm-du-pair' }));

    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(1);
    expect(outbox.getState().confirmed['c-a']).toBeUndefined();
  });

  test('un `message:new` dont l’id existe déjà (double livraison) REMPLACE, ne double jamais', () => {
    const client = new QueryClient();
    const first = socketMessage({ content: 'premier passage' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([{ ...first, translations: [] } as unknown as Message]));

    applyMessageNew(client, freshOutbox(), socketMessage({ content: 'second passage (rejeu)' }));

    const page = threadOf(client, 'c-a');
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.content).toBe('second passage (rejeu)');
  });

  test('patch la conversation de LISTE — dernier message, horodatage, langue — pour réordonner la Lentille', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({ id: 'c-a', lastMessageTranslations: { en: 'ancienne traduction' } }),
      conv({ id: 'c-b' }),
    ]);

    applyMessageNew(client, freshOutbox(), socketMessage({ content: 'nouveau dernier message', originalLanguage: 'es' }));

    const list = readConversations(client);
    const patched = list?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessage?.content).toBe('nouveau dernier message');
    expect(patched?.lastMessageOriginalLanguage).toBe('es');
    // `lastMessageTranslations` RETIRÉE — jamais posée à `undefined` (même
    // discipline que `perform-send.ts` § `attempt()`).
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageTranslations')).toBe(false);
    // La conversation NON concernée reste `toBe`-identique.
    expect(list?.find((c) => c.id === 'c-b')).toBe(list?.[1]);
  });

  /**
   * LE PRISME DE LA LIGNE DE LISTE (revue-correction #5793) — `message:new`
   * TRANSPORTE `translations` (`MeeshySocketIOManager.ts:2886-2896`,
   * `transformTranslationsToArray`) ; les RETIRER inconditionnellement faisait
   * servir l'ORIGINAL sur la Lentille alors qu'une traduction du rang du
   * lecteur voyageait dans la même charge — la question du cycle 121 (« élit-il
   * le bon rang ? ») à laquelle un `delete` répond toujours « non ».
   *
   * TÉMOIN DE RANG SUR UN RANG AUTRE QUE LE PREMIER (CLAUDE.md § Prisme, leçon
   * 261) : message ESPAGNOL, lecteur `['fr']`, traduction française présente —
   * au rang 1 la règle juste et le court-circuit rendraient le même verdict.
   */
  test('les traductions QUE LA CHARGE TRANSPORTE alimentent `lastMessageTranslations` (Prisme, cycle 121)', () => {
    const client = new QueryClient();
    seedConversations(client, [conv({ id: 'c-a' })]);

    applyMessageNew(
      client,
      freshOutbox(),
      socketMessage({
        content: 'Hola, ¿nos vemos mañana?',
        originalLanguage: 'es',
        translations: [
          { language: 'fr', content: 'On se voit demain ?' },
          { language: 'en', content: 'See you tomorrow?' },
        ] as never,
      }),
    );

    const patched = readConversations(client)
      ?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessageOriginalLanguage).toBe('es');
    // LE MÊME APPEL QUE LA RANGÉE (`components/lens-row.tsx` § `preview`) —
    // le témoin interroge le PIXEL, jamais le champ.
    const preview = served({
      preferredLanguages: ['fr'],
      originalLanguage: patched?.lastMessageOriginalLanguage,
      translations: patched?.lastMessageTranslations,
      original: patched?.lastMessage?.content ?? '',
    });
    expect(preview.text).toBe('On se voit demain ?');
    expect(preview.language).toBe('fr');
  });

  test('une charge SANS traduction retire la clé, jamais un `undefined` (exactOptionalPropertyTypes)', () => {
    const client = new QueryClient();
    seedConversations(client, [conv({ id: 'c-a', lastMessageTranslations: { en: 'stale' } })]);

    applyMessageNew(client, freshOutbox(), socketMessage({ content: 'sans traduction' }));

    const patched = readConversations(client)
      ?.find((c) => c.id === 'c-a');
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageTranslations')).toBe(false);
  });

  test('un message pour une conversation ABSENTE de la liste ne construit aucune liste', () => {
    const client = new QueryClient();
    applyMessageNew(client, freshOutbox(), socketMessage({ conversationId: 'c-inconnue' }));
    expect(client.getQueryData(CONVERSATIONS_QUERY_KEY)).toBeUndefined();
  });
});

describe('applyConversationUnreadUpdated (#5793)', () => {
  test('remplace le compte de la ligne et efface l’override optimiste', () => {
    const client = new QueryClient();
    seedConversations(client, [conv({ id: 'c-a', unreadCount: 0 })]);
    conversationStore.getState().markUnread('c-a');
    expect(conversationStore.getState().overrides['c-a']?.unreadCount).toBe(1);

    applyConversationUnreadUpdated(client, conversationStore, { conversationId: 'c-a', unreadCount: 7 });

    const list = readConversations(client);
    expect(list?.find((c) => c.id === 'c-a')?.unreadCount).toBe(7);
    expect(conversationStore.getState().overrides['c-a']?.unreadCount).toBeUndefined();
  });
});

describe('isConversationUpdated (#5793, revue-correction défaut 1) — décodage FAIL-CLOSED', () => {
  test('une charge minimale valide est reconnue', () => {
    expect(
      isConversationUpdated({ conversationId: 'c-a', updatedBy: { id: 'u-1' }, updatedAt: '2026-09-12T10:00:00.000Z' }),
    ).toBe(true);
  });

  test('`updatedBy.id` manquant est REJETÉ', () => {
    expect(isConversationUpdated({ conversationId: 'c-a', updatedBy: {}, updatedAt: '2026-09-12T10:00:00.000Z' })).toBe(
      false,
    );
  });

  test('`null`/`undefined`/un tableau sont rejetés', () => {
    expect(isConversationUpdated(null)).toBe(false);
    expect(isConversationUpdated(undefined)).toBe(false);
    expect(isConversationUpdated([])).toBe(false);
  });
});

describe('applyConversationUpdated (#5793, revue-correction défaut 1) — la QUATRIÈME famille du Prisme', () => {
  test('clé `lastMessageId` ABSENTE : rien à toucher (renommage, réglage)', () => {
    const client = new QueryClient();
    seedConversations(client, [conv({ id: 'c-a', unreadCount: 3 })]);

    applyConversationUpdated(client, { conversationId: 'c-a', updatedBy: { id: 'u-1' }, updatedAt: '2026-09-12T10:00:00.000Z' });

    const list = readConversations(client);
    expect(list?.find((c) => c.id === 'c-a')?.unreadCount).toBe(3);
  });

  test('`lastMessageId: null` — plus AUCUN message visible : la ligne perd son groupe d’aperçu', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({
        id: 'c-a',
        lastMessage: localMessage({}),
        lastMessageOriginalLanguage: 'fr',
        lastMessageTranslations: { en: 'stale' },
      }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:00:00.000Z',
      lastMessageId: null,
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessage).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageTranslations')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageOriginalLanguage')).toBe(false);
  });

  /**
   * LE CAS NOMINAL (défaut 1 ET 2 réunis) — `message:new` a déjà posé la
   * ligne (`applyMessageNew`) avec `translations` VIDE (le pipeline traduit
   * APRÈS) ; `conversation:updated` arrive ENSUITE avec le groupe résolu
   * SERVEUR et doit PRIMER.
   */
  test('la carte SERVEUR prime sur ce que `message:new` avait déduit — même `lastMessageId`', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({
        id: 'c-a',
        lastMessage: localMessage({ id: 'm-1', content: 'Hola, ¿todo bien?' }),
        lastMessageOriginalLanguage: 'es',
      }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:05:00.000Z',
      lastMessageId: 'm-1',
      lastMessageAt: '2026-09-12T10:05:00.000Z',
      lastMessagePreview: 'Hola, ¿todo bien?',
      lastMessageOriginalLanguage: 'es',
      lastMessageTranslations: { fr: 'Salut, tout va bien ?' },
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessageTranslations).toEqual({ fr: 'Salut, tout va bien ?' });
    expect(patched?.lastMessage?.content).toBe('Hola, ¿todo bien?');
  });

  test('`lastMessageTranslations: null` (édition) PÉRIME la carte — jamais `translations.first` en repli', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1' }), lastMessageTranslations: { en: 'stale' } }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:06:00.000Z',
      lastMessageId: 'm-1',
      lastMessageTranslations: null,
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageTranslations')).toBe(false);
  });

  /**
   * `lastMessageId` NE CORRESPOND PAS au `lastMessage` connu — ADOPTION
   * (#6171, G3, revue de #5793 : ce témoin CHANGE DE SENS — il affirmait
   * « le contenu n'est pas fabriqué » ; il affirme désormais l'ADOPTION,
   * miroir `LastMessageFacet.adoptLastMessage`).
   */
  test('`lastMessageId` NE CORRESPOND PAS au `lastMessage` connu : la ligne ADOPTE le nouveau (#6171, G3)', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1', content: 'ancien contenu' }) }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-2',
      lastMessagePreview: 'un aperçu que la charge ne peut pas étayer',
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessage?.id).toBe('m-2');
    expect(patched?.lastMessage?.content).toBe('un aperçu que la charge ne peut pas étayer');
  });

  /**
   * T5 — le SCÉNARIO complet de la spécification #6171 § 4.2 : un message
   * SUPPRIMÉ POUR TOUS cesse d'être décrit (auteur, `isViewOnce`), la ligne
   * décrit désormais `m-1` (Kwame, espagnol) au RANG résolu du LECTEUR.
   */
  test('T5 — adoption COMPLÈTE : id, contenu, langue, auteur, `isViewOnce` qui ne survit PAS, `lastMessageAt`', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({
        id: 'c-a',
        lastMessage: {
          ...localMessage({ id: 'm-2', content: 'Oui, jeudi 14h.', originalLanguage: 'fr' }),
          sender: { displayName: 'Vous' } as never,
          isViewOnce: true,
        },
        lastMessageAt: new Date('2026-09-12T10:02:00.000Z'),
      }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-kwame' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-1',
      lastMessagePreview: 'Hola, ¿la revisión sigue el jueves?',
      lastMessageOriginalLanguage: 'es',
      lastMessageAt: '2026-09-12T10:00:00.000Z',
      lastMessageTranslations: { fr: 'Bonjour, la revue reste bien jeudi ?', en: 'Hello, is the review still on for Thursday?' },
      lastMessageSenderName: 'Kwame Mensah',
      senderId: 'p-kwame',
      previewRecalculated: true,
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessage?.id).toBe('m-1');
    expect(patched?.lastMessage?.content).toBe('Hola, ¿la revisión sigue el jueves?');
    expect(patched?.lastMessage?.originalLanguage).toBe('es');
    expect((patched?.lastMessage?.sender as unknown as { displayName?: string } | undefined)?.displayName).toBe('Kwame Mensah');
    // `isViewOnce` du message SUPPRIMÉ ne survit PAS sur la ligne neutre.
    expect(patched?.lastMessage?.isViewOnce).toBe(false);
    // D-26 : le cache garde la chaîne ISO TELLE QUELLE (`decodeConversation` la revit en `Date`).
    expect(patched?.lastMessageAt as unknown as string).toBe('2026-09-12T10:00:00.000Z');
    expect(patched?.lastMessageTranslations).toEqual({
      fr: 'Bonjour, la revue reste bien jeudi ?',
      en: 'Hello, is the review still on for Thursday?',
    });

    // LE RANG DU LECTEUR (leçon 261) — prisme ['fr','en'] ⇒ 'fr' (rang 1).
    const servedFr = served({
      preferredLanguages: ['fr', 'en'],
      originalLanguage: patched?.lastMessageOriginalLanguage,
      translations: patched?.lastMessageTranslations,
      original: patched?.lastMessage?.content ?? '',
    });
    expect(servedFr.text).toBe('Bonjour, la revue reste bien jeudi ?');
    expect(servedFr.language).toBe('fr');

    // CONTRE-TÉMOIN DE RANG — prisme ['en','fr'] ⇒ 'en' (rang 1 de CE lecteur).
    const servedEn = served({
      preferredLanguages: ['en', 'fr'],
      originalLanguage: patched?.lastMessageOriginalLanguage,
      translations: patched?.lastMessageTranslations,
      original: patched?.lastMessage?.content ?? '',
    });
    expect(servedEn.text).toBe('Hello, is the review still on for Thursday?');
    expect(servedEn.language).toBe('en');
  });

  /**
   * Témoin VOISIN — MÊME `lastMessageId` : AUCUNE adoption, le comportement
   * EXISTANT (`:364-388`) reste vert (pas de régression du chemin nominal).
   */
  test('MÊME `lastMessageId` : pas d’adoption, seule la carte SERVEUR change', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1', content: 'contenu original' }) }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-1',
      lastMessageTranslations: { fr: 'traduit' },
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessage?.id).toBe('m-1');
    expect(patched?.lastMessage?.content).toBe('contenu original');
    expect(patched?.lastMessageTranslations).toEqual({ fr: 'traduit' });
  });
});

describe('neutralLastMessageFromPreview (#6171, G3) — chaque champ vient de la charge ou d’un défaut DÉCLARÉ', () => {
  test('aucune pièce jointe ⇒ `messageType` "text", `isViewOnce`/`isBlurred` "?? false"', () => {
    const message = neutralLastMessageFromPreview({
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:00:00.000Z',
      lastMessageId: 'm-1',
    });
    expect(message.messageType).toBe('text');
    expect(message.isViewOnce).toBe(false);
    expect(message.isBlurred).toBe(false);
    expect(message.content).toBe('');
    expect(message.originalLanguage).toBe('');
    expect(message.sender).toBeUndefined();
    expect(message.attachments).toBeUndefined();
    // Repli sur `updatedAt` — le SEUL horodatage que le contrat garantit toujours.
    expect(message.createdAt as unknown as string).toBe('2026-09-12T10:00:00.000Z');
  });

  test('une pièce jointe IMAGE ⇒ `messageType` "image", portée SANS fabrication', () => {
    const message = neutralLastMessageFromPreview({
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:00:00.000Z',
      lastMessageId: 'm-1',
      lastMessageAttachments: [
        { id: 'a-1', mimeType: 'image/jpeg', thumbnailUrl: 'https://x/y.jpg', originalName: 'y.jpg', fileSize: 100, duration: null, width: 10, height: 10 },
      ],
    });
    expect(message.messageType).toBe('image');
    expect(message.attachments).toHaveLength(1);
  });
});

/**
 * LA GARDE MONOTONE DU RANG (revue-correction #6171) — le contrat l'EXIGE des
 * clients (`previewRecalculated`, `packages/shared/.../conversation.ts`) et iOS
 * la tient par son `>` strict (`ConversationListViewModel.swift:1100`, exception
 * `:1214-1216`). Le web écrivait `lastMessageAt` sans condition : deux
 * `message:new` arrivés dans le désordre faisaient REDESCENDRE une conversation
 * vivante dans la liste, qui trie sur ce champ.
 *
 * Le témoin de RECUL est celui qui compte : à horodatage qui AVANCE, la garde
 * juste et l'absence de garde rendent le même verdict (même forme que le témoin
 * de rang du Prisme, leçon 261).
 */
describe('applyConversationUpdated — la garde monotone du RANG (revue-correction #6171)', () => {
  const at = (iso: string) => iso;

  test('un horodatage qui RECULE sans `previewRecalculated` (diffusion désordonnée) NE change PAS le rang', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({
        id: 'c-a',
        lastMessage: localMessage({ id: 'm-2', content: 'le plus récent' }),
        lastMessageAt: new Date('2026-09-12T10:05:00.000Z'),
      }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: at('2026-09-12T10:06:00.000Z'),
      lastMessageId: 'm-1',
      lastMessageAt: at('2026-09-12T10:00:00.000Z'),
      lastMessagePreview: 'un message plus ancien',
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(new Date(patched?.lastMessageAt as unknown as string).toISOString()).toBe('2026-09-12T10:05:00.000Z');
    // L'ADOPTION, elle, s'applique — miroir iOS, qui adopte dans la branche
    // « pas de bump » et ne garde QUE le rang.
    expect(patched?.lastMessage?.id).toBe('m-1');
  });

  test('adopter un AUTRE message JETTE la carte de l’ancien — jamais une traduction périmée sur un original neuf', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({
        id: 'c-a',
        lastMessage: localMessage({ id: 'm-2', content: 'Oui, jeudi 14h.', originalLanguage: 'fr' }),
        lastMessageTranslations: { en: 'Yes, Thursday 2pm.' },
        lastMessageOriginalLanguage: 'fr',
      }),
    ]);

    // Une charge qui NOMME un autre message SANS son groupe Prisme (émetteur non
    // conformant, ou champ ajouté en amont et non relayé) : la ligne ne doit
    // servir AUCUNE traduction plutôt que celle du message qu'elle a quitté.
    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-1',
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageTranslations')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patched ?? {}, 'lastMessageOriginalLanguage')).toBe(false);
    expect(
      served({
        preferredLanguages: ['en', 'fr'],
        originalLanguage: patched?.lastMessageOriginalLanguage,
        translations: patched?.lastMessageTranslations,
        original: patched?.lastMessage?.content ?? '',
      }).text,
    ).not.toBe('Yes, Thursday 2pm.');
  });

  test('`previewRecalculated: true` FAIT reculer le rang (suppression pour tous, masquage personnel)', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-2' }), lastMessageAt: new Date('2026-09-12T10:05:00.000Z') }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: at('2026-09-12T10:06:00.000Z'),
      lastMessageId: 'm-1',
      lastMessageAt: at('2026-09-12T10:00:00.000Z'),
      lastMessagePreview: 'le message précédent reprend la ligne',
      previewRecalculated: true,
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessageAt as unknown as string).toBe('2026-09-12T10:00:00.000Z');
  });

  test('un horodatage qui AVANCE change le rang, et une ligne SANS rang connu l’accepte', () => {
    const client = new QueryClient();
    seedConversations(client, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1' }), lastMessageAt: new Date('2026-09-12T10:00:00.000Z') }),
      conv({ id: 'c-b', lastMessage: localMessage({ id: 'm-9' }) }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: at('2026-09-12T10:06:00.000Z'),
      lastMessageId: 'm-1',
      lastMessageAt: at('2026-09-12T10:06:00.000Z'),
    });
    applyConversationUpdated(client, {
      conversationId: 'c-b',
      updatedBy: { id: 'u-1' },
      updatedAt: at('2026-09-12T10:06:00.000Z'),
      lastMessageId: 'm-9',
      lastMessageAt: at('2026-09-12T09:00:00.000Z'),
    });

    const rows = readConversations(client);
    expect(rows?.find((c) => c.id === 'c-a')?.lastMessageAt as unknown as string).toBe('2026-09-12T10:06:00.000Z');
    expect(rows?.find((c) => c.id === 'c-b')?.lastMessageAt as unknown as string).toBe('2026-09-12T09:00:00.000Z');
  });
});

describe('isMessageTranslationEvent (#5793, revue-correction défaut 2) — décodage FAIL-CLOSED', () => {
  const entry = {
    id: 't-1',
    messageId: 'm-1',
    sourceLanguage: 'es',
    targetLanguage: 'fr',
    translatedContent: 'Salut',
    translationModel: 'basic',
    cacheKey: 'k',
    cached: false,
  };

  test('une charge complète est reconnue', () => {
    expect(isMessageTranslationEvent({ messageId: 'm-1', translations: [entry] })).toBe(true);
  });

  test('une entrée à qui il manque `translatedContent` REJETTE TOUT le tableau', () => {
    const { translatedContent: _translatedContent, ...rest } = entry;
    expect(isMessageTranslationEvent({ messageId: 'm-1', translations: [rest] })).toBe(false);
  });

  test('`null`/`undefined` sont rejetés', () => {
    expect(isMessageTranslationEvent(null)).toBe(false);
    expect(isMessageTranslationEvent(undefined)).toBe(false);
  });
});

describe('applyMessageTranslation (#5793, revue-correction défaut 2) — le pipeline traduit APRÈS la création', () => {
  const translationEntry = (partial: { readonly targetLanguage: string; readonly translatedContent: string }) => ({
    id: `t-${partial.targetLanguage}`,
    messageId: 'm-1',
    sourceLanguage: 'es',
    translationModel: 'basic' as const,
    cacheKey: 'k',
    cached: false,
    ...partial,
  });

  test('fusionne dans le fil OUVERT — le message reçu quitte la langue de l’expéditeur', () => {
    const client = new QueryClient();
    const original = localMessage({ id: 'm-1', originalLanguage: 'es', content: 'Hola', translations: [] });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([original]));

    applyMessageTranslation(client, {
      messageId: 'm-1',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })],
    });

    const page = threadOf(client, 'c-a');
    const patched = page?.messages.find((m) => m.id === 'm-1');
    expect(patched?.translations.find((t) => t.targetLanguage === 'fr')?.translatedContent).toBe('Salut');
  });

  test('une SECONDE traduction pour la MÊME langue REMPLACE, ne double jamais', () => {
    const client = new QueryClient();
    const original = localMessage({
      id: 'm-1',
      translations: [
        { id: 't-fr-1', messageId: 'm-1', targetLanguage: 'fr', translatedContent: 'brouillon', translationModel: 'basic', createdAt: new Date() },
      ] as unknown as Message['translations'],
    });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([original]));

    applyMessageTranslation(client, {
      messageId: 'm-1',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'version finale' })],
    });

    const page = threadOf(client, 'c-a');
    const patched = page?.messages.find((m) => m.id === 'm-1');
    expect(patched?.translations.filter((t) => t.targetLanguage === 'fr')).toHaveLength(1);
    expect(patched?.translations.find((t) => t.targetLanguage === 'fr')?.translatedContent).toBe('version finale');
  });

  test('alimente `lastMessageTranslations` quand ce message est le DERNIER de sa ligne', () => {
    const client = new QueryClient();
    const original = localMessage({ id: 'm-1', translations: [] });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([original]));
    seedConversations(client, [conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1' }) })]);

    applyMessageTranslation(client, {
      messageId: 'm-1',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })],
    });

    const patched = readConversations(client)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessageTranslations).toEqual({ fr: 'Salut' });
  });

  test('un message dont AUCUN fil n’est ouvert ne construit aucune page (motif `applyMessageNew`)', () => {
    const client = new QueryClient();
    applyMessageTranslation(client, {
      messageId: 'm-inconnu',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })],
    });
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  /**
   * T1 (#6171) — le RANG du lecteur (leçon 261) : témoin sur un rang AUTRE
   * que le premier, prisme `['fr','en']` recevant `en` PUIS `fr`, et sa
   * CONTRE-ÉPREUVE `['en','fr']` recevant `fr` PUIS `en`.
   */
  test('T1 — le RANG du lecteur : `en` sert au rang 2, `fr` reprend la main au rang 1', () => {
    const client = new QueryClient();
    const original = localMessage({ id: 'm-1', originalLanguage: 'es', content: 'Hola', translations: [] });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([original]));

    const readerServed = () =>
      served({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'es',
        translations: (threadOf(client, 'c-a')?.messages[0] as Message).translations,
        original: 'Hola',
      });

    expect(readerServed()).toEqual({ text: 'Hola', language: 'es', translated: false });

    applyMessageTranslation(client, { messageId: 'm-1', translations: [translationEntry({ targetLanguage: 'en', translatedContent: 'Hi' })] });
    expect(readerServed()).toEqual({ text: 'Hi', language: 'en', translated: true });

    applyMessageTranslation(client, { messageId: 'm-1', translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })] });
    expect(readerServed()).toEqual({ text: 'Salut', language: 'fr', translated: true });
  });

  test('T1, contre-épreuve — prisme [\'en\',\'fr\'] : `fr` sert au rang 2, `en` reprend la main au rang 1', () => {
    const client = new QueryClient();
    const original = localMessage({ id: 'm-1', originalLanguage: 'es', content: 'Hola', translations: [] });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([original]));

    const readerServed = () =>
      served({
        preferredLanguages: ['en', 'fr'],
        originalLanguage: 'es',
        translations: (threadOf(client, 'c-a')?.messages[0] as Message).translations,
        original: 'Hola',
      });

    applyMessageTranslation(client, { messageId: 'm-1', translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })] });
    expect(readerServed()).toEqual({ text: 'Salut', language: 'fr', translated: true });

    applyMessageTranslation(client, { messageId: 'm-1', translations: [translationEntry({ targetLanguage: 'en', translatedContent: 'Hi' })] });
    expect(readerServed()).toEqual({ text: 'Hi', language: 'en', translated: true });
  });
});

/**
 * `isReadStatusUpdated` (#7223) — garde de FORME pour `read-status:updated`,
 * motif `isConversationUnreadUpdated` : ne valide QUE les champs que
 * `applyReadStatusUpdated` lit (`conversationId`, `summary.{totalMembers,
 * deliveredCount, readCount}`), jamais `participantId`/`userId`/`type` que ce
 * puits ignore (§ 2 de `W2.md` — les deux audiences de `broadcastReadStatus`
 * partagent ces quatre champs).
 *
 * Le second témoin fixe le vrai nom des trois compteurs
 * (`ReadStatusSummary`, `packages/shared/types/socketio-events/message.ts:31-37`)
 * contre le libellé — inexact — du critère de fin du lot
 * (`receivedCount`/`deliveredToAllAt`/`readByAllAt`) : une charge qui ne
 * porte QUE ces trois noms-là est REJETÉE.
 */
describe('isReadStatusUpdated (#7223) — décodage FAIL-CLOSED', () => {
  test('la forme RÉELLE de ReadStatusSummary est reconnue', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        participantId: 'p-1',
        userId: 'u-1',
        type: 'read',
        updatedAt: '2026-09-21T10:00:00.000Z',
        summary: { totalMembers: 3, deliveredCount: 2, readCount: 1 },
      }),
    ).toBe(true);
  });

  test('une charge qui ne porte que le libellé du critère de fin (FAUX) est rejetée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { receivedCount: 2, deliveredToAllAt: null, readByAllAt: null },
      }),
    ).toBe(false);
  });

  test('conversationId absent ⇒ rejetée', () => {
    expect(isReadStatusUpdated({ summary: { totalMembers: 1, deliveredCount: 0, readCount: 0 } })).toBe(false);
  });

  /* #7348 — `messageId` optionnel (contrat G-5 codé par anticipation, § doc-
     comment `applyReadStatusUpdated`) : présent et bien formé ⇒ acceptée,
     présent et mal formé ⇒ rejetée FAIL-CLOSED (motif du reste de la garde,
     jamais un champ non validé qui traverserait silencieusement). */
  test('`summary.messageId` bien formé (contrat #7348/G-5) est acceptée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: 'm-1' },
      }),
    ).toBe(true);
  });

  test('`summary.messageId` mal formé (nombre) ⇒ rejetée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: 42 },
      }),
    ).toBe(false);
  });

  /* `messageId: ''` — la forme que le TYPE seul ne distingue pas (#7348,
     revue-correction). Elle est mal formée au même titre qu'un nombre : aucun
     `Message.id` n'est vide. Laissée passer, elle ne tombait pas dans le REPLI
     « la charge ne nomme aucun message » — elle prenait la branche NOMMÉE,
     n'appariait rien, et se taisait : le puits devenait un no-op SILENCIEUX
     sur un événement cassé, exactement ce que le doc-comment de cette garde
     dit ne jamais faire. Une garde qui ANNONCE fail-closed doit l'être. */
  test('`summary.messageId` VIDE ⇒ rejetée, jamais un no-op silencieux', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: '' },
      }),
    ).toBe(false);
  });

  /* #7347 (G-5) — `summary.readByAllAt` : maintenant CONSOMMÉ par
     `applyReadStatusUpdated`, donc VALIDÉ ici, même motif que `messageId`
     ci-dessus. `null` (pas encore tout le monde) et l'ISO 8601 réelle
     (`updatedAt` ci-dessus le montre : une `Date` voyage en CHAÎNE sur le
     fil) sont acceptées ; une forme qui n'est ni l'un ni l'autre ⇒ rejetée. */
  test('`summary.readByAllAt` ABSENT (repli legacy) est acceptée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { totalMembers: 1, deliveredCount: 1, readCount: 1 },
      }),
    ).toBe(true);
  });

  test('`summary.readByAllAt: null` est acceptée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, readByAllAt: null },
      }),
    ).toBe(true);
  });

  test('`summary.readByAllAt` en ISO 8601 (forme réelle sur le fil) est acceptée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: {
          totalMembers: 1,
          deliveredCount: 1,
          readCount: 1,
          readByAllAt: '2026-09-22T08:00:00.000Z',
        },
      }),
    ).toBe(true);
  });

  test('`summary.readByAllAt` mal formé (nombre) ⇒ rejetée', () => {
    expect(
      isReadStatusUpdated({
        conversationId: 'c-a',
        summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, readByAllAt: 42 },
      }),
    ).toBe(false);
  });
});

/**
 * `applyReadStatusUpdated` (#7223, #7348) — LA FONCTION PURE qui applique
 * `read-status:updated` au cache TanStack du fil.
 *
 * **#7348 (G-5 en amont, contrat codé par anticipation — la branche
 * `lot/g5-7347` n'existe pas encore à l'écriture de ce lot) :** `summary`
 * porte désormais `messageId?: string` (`ReadStatusSummary`,
 * `packages/shared/types/socketio-events/message.ts`), optionnel pour ne
 * rien casser côté passerelle tant que G-5 n'a pas basculé
 * `broadcastReadStatus.ts`/`getLatestMessageSummary` sur un résumé PAR
 * message. Présent ⇒ la fonction cible CE message par id
 * (`findCachedThreadMessage`), qu'il soit ou non le dernier du fil — c'est
 * la correction du défaut relevé le 2026-09-21 (une rafale M1 M2 M3 de
 * trois auteurs différents ne faisait bouger que le dernier confirmé).
 * ABSENT (gateway pré-G5) ⇒ repli sur `latestCachedThreadMessage`, le
 * comportement `#7223` d'origine — la charge ne nommait alors aucun
 * message, il fallait bien en désigner un.
 */
describe('applyReadStatusUpdated (#7223, #7348) — le puits de read-status:updated', () => {
  test('#7348 — REPLI sans `messageId` (gateway pré-G5) : patch le DERNIER message du fil', () => {
    const client = new QueryClient();
    const older = localMessage({ id: 'm-1', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    const newest = localMessage({ id: 'm-2', createdAt: new Date('2026-09-21T09:05:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([older, newest]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 2, deliveredCount: 2, readCount: 2 },
    });

    const messages = threadOf(client, 'c-a')?.messages;
    const patched = messages?.find((m) => m.id === 'm-2');
    expect(patched?.deliveredCount).toBe(2);
    expect(patched?.readCount).toBe(2);
    expect(patched?.recipientCount).toBe(2);
    /* LE MESSAGE PLUS ANCIEN N'EST PAS TOUCHÉ — sans `messageId`, `summary`
       ne décrit QUE le dernier message de la conversation. */
    const untouched = messages?.find((m) => m.id === 'm-1');
    expect(untouched?.deliveredCount).toBe(0);
    expect(untouched?.readCount).toBe(0);
  });

  test('#7348 — AVEC `messageId` : patch CE message-là, même s\'il n\'est pas le plus récent', () => {
    const client = new QueryClient();
    const older = localMessage({ id: 'm-1', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    const newest = localMessage({ id: 'm-2', createdAt: new Date('2026-09-21T09:05:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([older, newest]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 2, deliveredCount: 1, readCount: 1, messageId: 'm-1' },
    });

    const messages = threadOf(client, 'c-a')?.messages;
    /* LE MESSAGE NOMMÉ EST PATCHÉ — bien qu'il ne soit PAS le plus récent du
       fil, ce que le repli § précédent aurait ciblé à tort. */
    const patched = messages?.find((m) => m.id === 'm-1');
    expect(patched?.deliveredCount).toBe(1);
    expect(patched?.readCount).toBe(1);
    expect(patched?.recipientCount).toBe(2);
    /* LE PLUS RÉCENT N'EST PAS TOUCHÉ. */
    const untouched = messages?.find((m) => m.id === 'm-2');
    expect(untouched?.deliveredCount).toBe(0);
    expect(untouched?.readCount).toBe(0);
  });

  test('#7348 — RAFALE DE TROIS, RÉSUMÉ DE TROIS ⇒ TROIS LIGNES CHANGENT (critère de fin)', () => {
    const client = new QueryClient();
    const m1 = localMessage({ id: 'm-1', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    const m2 = localMessage({ id: 'm-2', createdAt: new Date('2026-09-21T09:01:00.000Z') });
    const m3 = localMessage({ id: 'm-3', createdAt: new Date('2026-09-21T09:02:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1, m2, m3]));

    const readEvent = (messageId: string, readCount: number) => ({
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read' as const,
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 3, deliveredCount: 3, readCount, messageId },
    });

    /* La rafale : trois événements `read-status:updated` DISTINCTS, un par
       message, comme G-5 les émettra (un résumé PAR message plutôt qu'un
       agrégat unique — critère de fin de #7347 : « trois résumés, pas un »). */
    applyReadStatusUpdated(client, readEvent('m-1', 1));
    applyReadStatusUpdated(client, readEvent('m-2', 2));
    applyReadStatusUpdated(client, readEvent('m-3', 3));

    const messages = threadOf(client, 'c-a')?.messages;
    expect(messages?.find((m) => m.id === 'm-1')?.readCount).toBe(1);
    expect(messages?.find((m) => m.id === 'm-2')?.readCount).toBe(2);
    expect(messages?.find((m) => m.id === 'm-3')?.readCount).toBe(3);
  });

  test('#7347 (G-5) — `readByAllAt` PRÉSENT sur le résumé est posé sur le message ciblé', () => {
    const client = new QueryClient();
    const m1 = localMessage({ id: 'm-1' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));
    const readByAllAt = new Date('2026-09-22T08:00:00.000Z');

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-22T08:00:01.000Z'),
      summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: 'm-1', readByAllAt },
    });

    const patched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-1');
    expect(patched?.readByAllAt).toEqual(readByAllAt);
  });

  test('#7347 (G-5) — `readByAllAt: null` (pas encore tout le monde) EFFACE une valeur déjà connue', () => {
    const client = new QueryClient();
    const m1 = localMessage({
      id: 'm-1',
      readByAllAt: new Date('2026-09-20T00:00:00.000Z'),
    });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-22T08:00:01.000Z'),
      summary: { totalMembers: 2, deliveredCount: 2, readCount: 1, messageId: 'm-1', readByAllAt: null },
    });

    const patched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-1');
    expect(patched?.readByAllAt).toBeUndefined();
  });

  test('#7347 (G-5) — `readByAllAt` ABSENT du résumé (repli legacy) ne touche PAS la valeur déjà connue', () => {
    const client = new QueryClient();
    const existing = new Date('2026-09-20T00:00:00.000Z');
    const m1 = localMessage({ id: 'm-1', readByAllAt: existing });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-22T08:00:01.000Z'),
      summary: { totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: 'm-1' },
    });

    const patched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-1');
    expect(patched?.readByAllAt).toEqual(existing);
  });

  test('#7348 — `messageId` absent DU CACHE (fil incomplet) ⇒ NO-OP, aucune autre ligne n\'est touchée', () => {
    const client = new QueryClient();
    const only = localMessage({ id: 'm-2' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([only]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 2, deliveredCount: 1, readCount: 1, messageId: 'm-1-pas-en-cache' },
    });

    const untouched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-2');
    expect(untouched?.deliveredCount).toBe(0);
    expect(untouched?.readCount).toBe(0);
  });

  test('TOUS-OU-RIEN EN GROUPE CONSERVÉ — une lecture partielle rend `delivered`, jamais `read`', () => {
    const client = new QueryClient();
    const newest = localMessage({ id: 'm-2' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([newest]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 3, deliveredCount: 3, readCount: 1 },
    });

    const patched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-2');
    expect(patched).toBeDefined();
    expect(deliveryOf(patched as Message)).toBe('delivered');
  });

  test('le fil n’est pas OUVERT (aucune page en cache) ⇒ NO-OP', () => {
    const client = new QueryClient();
    applyReadStatusUpdated(client, {
      conversationId: 'c-inconnue',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 1, deliveredCount: 1, readCount: 1 },
    });
    expect(threadOf(client, 'c-inconnue')).toBeUndefined();
  });

  test('le fil est ouvert mais VIDE ⇒ NO-OP (aucun message à cibler)', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-vide'), threadPages([]));
    applyReadStatusUpdated(client, {
      conversationId: 'c-vide',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 1, deliveredCount: 1, readCount: 1 },
    });
    expect(threadOf(client, 'c-vide')?.messages).toEqual([]);
  });
});

/**
 * #7223, revue-correction W2 — LES DEUX CHARGES QUE `applyReadStatusUpdated`
 * NE DOIT PAS PEINDRE, et le palier qui doit atteindre le PIXEL.
 */
describe('applyReadStatusUpdated (#7223, revue W2) — ce qui atteint le pixel, et ce qui ne doit rien toucher', () => {
  /**
   * LE CRITÈRE DU LOT, jusqu'au pixel : un message DÉJÀ distribué à tous —
   * l'état de tout message servi par `GET /conversations/:id/messages` après
   * sa distribution — doit passer à « lu » quand le destinataire lit. La
   * règle vit dans `deliveryOf` (`lib/view/message.ts`), ce témoin prouve
   * que le puits l'y conduit.
   */
  test('un message DÉJÀ « distribué à tous » passe à LU quand le résumé dit lu', () => {
    const client = new QueryClient();
    const newest = localMessage({
      id: 'm-2',
      deliveredCount: 1,
      readCount: 0,
      recipientCount: 1,
      deliveredToAllAt: new Date('2026-09-21T09:00:00.000Z'),
    });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([newest]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 1, deliveredCount: 1, readCount: 1 },
    });

    const patched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-2');
    expect(deliveryOf(patched as Message)).toBe('read');
  });

  /**
   * LA BULLE OPTIMISTE N'EST PAS LE MESSAGE QUE LE SERVEUR DÉCRIT. `summary`
   * porte le dernier message NON SUPPRIMÉ EN BASE
   * (`MessageReadStatusService.getLatestMessageSummary`) — une rangée que le
   * serveur n'a pas encore reçue (`id === clientMessageId`,
   * `send/local-message.ts:73-74`) ne peut pas être celle-là. L'estamper
   * posait `readCount >= recipientCount` sur un envoi qui n'est pas parti,
   * et `confirmedMessageOf` (`send/local-message.ts:120-128`) garde
   * `local.readCount` quand l'accusé ne porte pas ce champ : la coche ✓✓
   * « lu » pouvait survivre à la confirmation d'un message que PERSONNE
   * n'avait lu.
   */
  test('la bulle OPTIMISTE non confirmée n’est jamais estampillée — le message SERVEUR juste avant l’est', () => {
    const client = new QueryClient();
    const server = localMessage({ id: 'm-serveur', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    const pending = localMessage({
      id: 'tmp-1',
      clientMessageId: 'tmp-1',
      createdAt: new Date('2026-09-21T09:05:00.000Z'),
    });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([server, pending]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 2, deliveredCount: 2, readCount: 2 },
    });

    const messages = threadOf(client, 'c-a')?.messages;
    expect(messages?.find((m) => m.id === 'tmp-1')?.readCount).toBe(0);
    expect(messages?.find((m) => m.id === 'm-serveur')?.readCount).toBe(2);
  });

  /**
   * `getLatestMessageSummary` rend `{0, 0, 0}` sur SON chemin d'erreur
   * (`MessageReadStatusService.ts:2623-2625`, `catch` ⇒ zéros) comme sur une
   * conversation sans message. Appliquer ces zéros ÉCRASE des compteurs
   * servis par `GET …/messages` et fait RÉGRESSER la coche — un résumé qui
   * n'affirme aucun destinataire n'affirme rien du tout.
   */
  test('un résumé sans destinataire (totalMembers 0) ne fait RIEN régresser', () => {
    const client = new QueryClient();
    const newest = localMessage({ id: 'm-2', deliveredCount: 2, readCount: 0, recipientCount: 3 });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([newest]));

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 0, deliveredCount: 0, readCount: 0 },
    });

    const patched = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-2');
    expect(patched?.deliveredCount).toBe(2);
    expect(patched?.recipientCount).toBe(3);
    expect(deliveryOf(patched as Message)).toBe('delivered');
  });
});
