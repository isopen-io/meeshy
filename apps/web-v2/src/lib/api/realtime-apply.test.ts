import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';
import { served } from './prism';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { conversationStore } from '@/lib/conversation-store';
import { mergeTimeline } from '@/lib/grouping';
import { createOutboxStore, entriesOf, type OutboxState } from '@/lib/send/outbox-store';
import type { StoreApi } from 'zustand/vanilla';
import { messagesQueryKey, type MessagesPage } from './messages';
import {
  applyConversationUnreadUpdated,
  applyConversationUpdated,
  applyMessageNew,
  applyMessageTranslation,
  isConversationUpdated,
  isMessageTranslationEvent,
  isSocketMessage,
  neutralLastMessageFromPreview,
} from './realtime-apply';
import type { Conversation, Message } from './types';

/** Un outbox NEUF par témoin — jamais l'instance partagée `outboxStore` : un
 * témoin qui la muterait laisserait une entrée à un autre fichier de témoins
 * (motif `createTypingStore()` dans `socket.test.ts`). */
const freshOutbox = (): StoreApi<OutboxState> => createOutboxStore();

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

const localMessage = (partial: Partial<Message> & { readonly clientMessageId?: string }): Message =>
  ({
    id: 'local-1',
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'en cours',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-12T09:00:00.000Z'),
    timestamp: new Date('2026-09-12T09:00:00.000Z'),
    ...partial,
  }) as Message;

/** UNE fonction rendrait `queryFn` observable — un test qui interroge le
 * compteur d'appels PROUVE qu'aucune requête réseau n'a été déclenchée par
 * `setQueryData` (§ critère de l'issue #5793 : « sans requête réseau »). */
function countingQueryFn(calls: { count: number }) {
  return async () => {
    calls.count += 1;
    throw new Error('queryFn ne doit JAMAIS être appelée par applyMessageNew');
  };
}

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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [], hasOlder: false });
    // `queryFn`/`queryKey` posés APRÈS la donnée : une requête déclenchée par
    // erreur ferait échouer ce test au lieu de passer silencieusement.
    void client.getQueryCache().build(client, { queryKey: messagesQueryKey('c-a'), queryFn: countingQueryFn(calls) });

    applyMessageNew(client, freshOutbox(), socketMessage({}));

    const page = client.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [local], hasOlder: false });

    applyMessageNew(client, freshOutbox(), socketMessage({ id: 'm-server-9', clientMessageId: 'cid-abc' }));

    const page = client.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [], hasOlder: false });

    applyMessageNew(client, outbox, socketMessage({ id: 'm-server-9', clientMessageId: 'cid-abc' }));

    const page = client.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [], hasOlder: false });

    applyMessageNew(client, outbox, socketMessage({ id: 'm-du-pair' }));

    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(1);
    expect(outbox.getState().confirmed['c-a']).toBeUndefined();
  });

  test('un `message:new` dont l’id existe déjà (double livraison) REMPLACE, ne double jamais', () => {
    const client = new QueryClient();
    const first = socketMessage({ content: 'premier passage' });
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), {
      messages: [{ ...first, translations: [] } as unknown as Message],
      hasOlder: false,
    });

    applyMessageNew(client, freshOutbox(), socketMessage({ content: 'second passage (rejeu)' }));

    const page = client.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.content).toBe('second passage (rejeu)');
  });

  test('patch la conversation de LISTE — dernier message, horodatage, langue — pour réordonner la Lentille', () => {
    const client = new QueryClient();
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
      conv({ id: 'c-a', lastMessageTranslations: { en: 'ancienne traduction' } }),
      conv({ id: 'c-b' }),
    ]);

    applyMessageNew(client, freshOutbox(), socketMessage({ content: 'nouveau dernier message', originalLanguage: 'es' }));

    const list = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [conv({ id: 'c-a' })]);

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

    const patched = client
      .getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [conv({ id: 'c-a', lastMessageTranslations: { en: 'stale' } })]);

    applyMessageNew(client, freshOutbox(), socketMessage({ content: 'sans traduction' }));

    const patched = client
      .getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [conv({ id: 'c-a', unreadCount: 0 })]);
    conversationStore.getState().markUnread('c-a');
    expect(conversationStore.getState().overrides['c-a']?.unreadCount).toBe(1);

    applyConversationUnreadUpdated(client, conversationStore, { conversationId: 'c-a', unreadCount: 7 });

    const list = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [conv({ id: 'c-a', unreadCount: 3 })]);

    applyConversationUpdated(client, { conversationId: 'c-a', updatedBy: { id: 'u-1' }, updatedAt: '2026-09-12T10:00:00.000Z' });

    const list = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
    expect(list?.find((c) => c.id === 'c-a')?.unreadCount).toBe(3);
  });

  test('`lastMessageId: null` — plus AUCUN message visible : la ligne perd son groupe d’aperçu', () => {
    const client = new QueryClient();
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessageTranslations).toEqual({ fr: 'Salut, tout va bien ?' });
    expect(patched?.lastMessage?.content).toBe('Hola, ¿todo bien?');
  });

  test('`lastMessageTranslations: null` (édition) PÉRIME la carte — jamais `translations.first` en repli', () => {
    const client = new QueryClient();
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1' }), lastMessageTranslations: { en: 'stale' } }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:06:00.000Z',
      lastMessageId: 'm-1',
      lastMessageTranslations: null,
    });

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1', content: 'ancien contenu' }) }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-2',
      lastMessagePreview: 'un aperçu que la charge ne peut pas étayer',
    });

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
      conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1', content: 'contenu original' }) }),
    ]);

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:07:00.000Z',
      lastMessageId: 'm-1',
      lastMessageTranslations: { fr: 'traduit' },
    });

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
    expect(new Date(patched?.lastMessageAt as unknown as string).toISOString()).toBe('2026-09-12T10:05:00.000Z');
    // L'ADOPTION, elle, s'applique — miroir iOS, qui adopte dans la branche
    // « pas de bump » et ne garde QUE le rang.
    expect(patched?.lastMessage?.id).toBe('m-1');
  });

  test('adopter un AUTRE message JETTE la carte de l’ancien — jamais une traduction périmée sur un original neuf', () => {
    const client = new QueryClient();
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
    expect(patched?.lastMessageAt as unknown as string).toBe('2026-09-12T10:00:00.000Z');
  });

  test('un horodatage qui AVANCE change le rang, et une ligne SANS rang connu l’accepte', () => {
    const client = new QueryClient();
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [
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

    const rows = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [original], hasOlder: false });

    applyMessageTranslation(client, {
      messageId: 'm-1',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })],
    });

    const page = client.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [original], hasOlder: false });

    applyMessageTranslation(client, {
      messageId: 'm-1',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'version finale' })],
    });

    const page = client.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
    const patched = page?.messages.find((m) => m.id === 'm-1');
    expect(patched?.translations.filter((t) => t.targetLanguage === 'fr')).toHaveLength(1);
    expect(patched?.translations.find((t) => t.targetLanguage === 'fr')?.translatedContent).toBe('version finale');
  });

  test('alimente `lastMessageTranslations` quand ce message est le DERNIER de sa ligne', () => {
    const client = new QueryClient();
    const original = localMessage({ id: 'm-1', translations: [] });
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [original], hasOlder: false });
    client.setQueryData(CONVERSATIONS_QUERY_KEY, [conv({ id: 'c-a', lastMessage: localMessage({ id: 'm-1' }) })]);

    applyMessageTranslation(client, {
      messageId: 'm-1',
      translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })],
    });

    const patched = client.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.find((c) => c.id === 'c-a');
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [original], hasOlder: false });

    const readerServed = () =>
      served({
        preferredLanguages: ['fr', 'en'],
        originalLanguage: 'es',
        translations: (client.getQueryData<MessagesPage>(messagesQueryKey('c-a'))?.messages[0] as Message).translations,
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
    client.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [original], hasOlder: false });

    const readerServed = () =>
      served({
        preferredLanguages: ['en', 'fr'],
        originalLanguage: 'es',
        translations: (client.getQueryData<MessagesPage>(messagesQueryKey('c-a'))?.messages[0] as Message).translations,
        original: 'Hola',
      });

    applyMessageTranslation(client, { messageId: 'm-1', translations: [translationEntry({ targetLanguage: 'fr', translatedContent: 'Salut' })] });
    expect(readerServed()).toEqual({ text: 'Salut', language: 'fr', translated: true });

    applyMessageTranslation(client, { messageId: 'm-1', translations: [translationEntry({ targetLanguage: 'en', translatedContent: 'Hi' })] });
    expect(readerServed()).toEqual({ text: 'Hi', language: 'en', translated: true });
  });
});
