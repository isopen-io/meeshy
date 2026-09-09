import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import { decodeMessages } from './decode';
import { hasOlderMessagesOf, messagesOf, recordSentMessage } from './fixtures';
import type { ApiResult, HttpTransport } from './http';
import type { Message } from './types';

/**
 * LE PORT DU FIL (#5650, F2) — `GET /api/v1/conversations/:id/messages`
 * (`services/gateway/src/routes/conversations/messages-list.ts:91-201`,
 * `optionalAuth`), `?limit=50` (le Salon Rivière porte 40 messages,
 * `targets/seed.md`) — la clé de requête ne porte PAS `limit` (une seule
 * page, Q4).
 *
 * ORDRE : la passerelle sert `createdAt DESC` (vue par défaut CHRONOLOGIE,
 * `messages-list-views.ts:101-107`) ; ce port RENVERSE en ASCENDANT — l'ordre
 * des fixtures (`fixtures.ts:80-96`) et de `place()` (`grouping.ts`).
 *
 * `hasOlder` = `cursorPagination.hasMore` (« une page plus ancienne existe » ;
 * `messages-list.ts:699-710`).
 */
export type MessagesPage = {
  readonly messages: readonly Message[];
  readonly hasOlder: boolean;
};

export const messagesQueryKey = (id: string) => ['conversations', id, 'messages'] as const;

const MESSAGES_LIMIT = 50;

export async function loadMessages(
  params: ConversationsDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<MessagesPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    return {
      ok: true,
      data: { messages: messagesOf(params.conversationId), hasOlder: hasOlderMessagesOf(params.conversationId) },
    };
  }
  const result = await params.transport.request<readonly Message[]>({
    method: 'GET',
    path: `/api/v1/conversations/${params.conversationId}/messages?limit=${MESSAGES_LIMIT}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      messages: [...result.data].reverse(),
      hasOlder: result.cursorPagination?.hasMore === true,
    },
  };
}

/**
 * `decodeMessagesPage` — FONCTION DE MODULE, jamais une lambda écrite en
 * ligne dans la fabrique (#5650, F1/F3, revue-correction). `useBaseQuery`
 * rappelle `observer.getOptimisticResult(options)` à CHAQUE rendu, et
 * `QueryObserver#createResult` ne réutilise le résultat mémorisé que si
 * `options.select === this.#selectFn` : une lambda neuve à chaque rendu
 * re-décode toute la page, et le partage structurel ne rattrape rien —
 * `replaceEqualDeep` compare les `Date` par IDENTITÉ, et décoder une chaîne
 * ISO en fabrique une nouvelle à chaque passage. `threadData.messages`
 * changeait alors d'identité à chaque rendu, ce qui défaisait `useMemo`,
 * `place()` et toute la mémoïsation du fil virtualisé — à 60 images par
 * seconde de défilement. Témoin : `messages.test.ts` § « identité du
 * résultat entre deux rendus (source gateway) ».
 */
function decodeMessagesPage(page: MessagesPage): MessagesPage {
  return { ...page, messages: decodeMessages(page.messages) };
}

/** FABRIQUE (F3) — la même forme que `conversationQuery`. */
export function messagesQuery(deps: ConversationsDeps, conversationId: string) {
  return {
    queryKey: messagesQueryKey(conversationId),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadMessages({ ...deps, conversationId, ...(signal !== undefined ? { signal } : {}) })),
    select: decodeMessagesPage,
  };
}

export type { HttpTransport };

/**
 * L'ENVOI D'UN MESSAGE (#5813, étape 2) — `POST /api/v1/conversations/:id/messages`
 * (`services/gateway/src/routes/conversations/messages-send.ts:117-120`,
 * `SendMessageBodySchema:41-105`). SUCCÈS = **200**, pas 201
 * (`response.ts:38`, `messages-send.ts:391` — § 0 de la spécification #5813,
 * le critère de recette qui dit « 201 » est FAUX).
 *
 * `body` porte le sous-ensemble TEXTE que ce lot exige — `content`,
 * `originalLanguage`, `clientMessageId` (l'identifiant d'idempotence,
 * `client-message-id.ts`), `replyToId` en option. Aucune clé posée à
 * `undefined` (`exactOptionalPropertyTypes`) : c'est à l'APPELANT
 * (`send/perform-send.ts`) de ne construire la clé que quand elle existe.
 */
export type SendMessageBody = {
  readonly content: string;
  readonly originalLanguage: string;
  readonly clientMessageId: string;
  readonly replyToId?: string;
};

/**
 * L'ACCUSÉ D'ENVOI — miroir strict de `SendMessageResponseData` iOS
 * (`MessageModels.swift:680-691`), lui-même le sous-ensemble que ce client
 * lit de `data` (§ 3.1 de la spécification #5813). Tout autre champ de
 * `data` (forme Prisma brute, `translations` objet, `sender`) est IGNORÉ
 * délibérément — la prochaine page `GET …/messages` sert la projection
 * complète (`decodeMessagesPage`).
 *
 * `createdAt` reste une CHAÎNE : c'est `decodeMessagesPage` (`:69-71`), pas
 * ce port, qui la revit en `Date` — D-26, « cache = forme du fil ».
 */
export type SentMessageAck = {
  readonly id: string;
  readonly clientMessageId?: string;
  readonly conversationId: string;
  readonly senderId?: string;
  readonly content?: string;
  readonly messageType?: string;
  readonly createdAt: string;
  readonly deliveredCount?: number;
  readonly readCount?: number;
};

/**
 * LA PROJECTION FAIL-CLOSED de `data` (§ 5 étape 2 de la spécification) —
 * une fonction de MODULE qui ne recopie QUE les clés de `SentMessageAck`.
 * `id`/`conversationId`/`createdAt` manquants ⇒ `null` : un accusé sans
 * identifiant n'en est pas un, jamais un confirmé à moitié construit.
 */
function projectAck(data: unknown): SentMessageAck | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const { id, conversationId, createdAt } = raw;
  if (typeof id !== 'string' || typeof conversationId !== 'string' || typeof createdAt !== 'string') return null;
  return {
    id,
    conversationId,
    createdAt,
    ...(typeof raw.clientMessageId === 'string' ? { clientMessageId: raw.clientMessageId } : {}),
    ...(typeof raw.senderId === 'string' ? { senderId: raw.senderId } : {}),
    ...(typeof raw.content === 'string' ? { content: raw.content } : {}),
    ...(typeof raw.messageType === 'string' ? { messageType: raw.messageType } : {}),
    ...(typeof raw.deliveredCount === 'number' ? { deliveredCount: raw.deliveredCount } : {}),
    ...(typeof raw.readCount === 'number' ? { readCount: raw.readCount } : {}),
  };
}

/** `Message` (fixtures) → `SentMessageAck` — la forme réduite que le port
 * rend en source `fixtures`, `createdAt` encodé en CHAÎNE (même contrat que
 * le port `gateway`, § 3.5 de la spécification). */
function ackOf(created: Message, clientMessageId: string): SentMessageAck {
  return {
    id: created.id,
    clientMessageId,
    conversationId: created.conversationId,
    senderId: created.senderId,
    content: created.content,
    messageType: created.messageType,
    createdAt: created.createdAt.toISOString(),
    deliveredCount: created.deliveredCount,
    readCount: created.readCount,
  };
}

export async function sendMessage(
  params: ConversationsDeps & {
    readonly conversationId: string;
    readonly body: SendMessageBody;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<SentMessageAck>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const created = recordSentMessage(params.conversationId, params.body);
    return { ok: true, data: ackOf(created, params.body.clientMessageId) };
  }
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/conversations/${params.conversationId}/messages`,
    body: params.body,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const ack = projectAck(result.data);
  return ack === null ? { ok: false, status: 0, error: 'Accusé illisible' } : { ok: true, data: ack };
}
