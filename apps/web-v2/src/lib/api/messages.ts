import type { QueryClient } from '@tanstack/react-query';

import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import { hasOlderMessagesOf, messagesOf, recordSentMessage } from './fixtures';
import type { ApiResult, HttpTransport } from './http';
import type { SharedPlace } from '@/lib/send/shared-place';

import { nextMessagesCursor, pageOfMessages, threadWindowOf } from './messages-pages';
import type { MessagesInfiniteData, MessagesPage, MessagesPageParam } from './messages-pages';
import type { Message } from './types';

/**
 * LE PORT DU FIL (#5650, F2 ; PAGINÉ #6972) —
 * `GET /api/v1/conversations/:id/messages?limit=50[&before=<id>]`
 * (`services/gateway/src/routes/conversations/messages-list.ts:91-201`,
 * `optionalAuth`).
 *
 * **`before` EST UN ID DE MESSAGE**, jamais un horodatage : la description du
 * schéma de la passerelle dit « get messages before this timestamp » (`:119`)
 * et elle est FAUSSE — le handler résout l'id en `createdAt` sur la
 * conversation puis filtre `{ lt: … }` (`:386-397`). Le curseur à lui renvoyer
 * est donc `cursorPagination.nextCursor`, l'id du DERNIER message servi (le
 * plus ANCIEN, tri DESC).
 *
 * `limit=50` est le PLAFOND de cette route (`validatePagination(…,
 * { maxLimit: 50 })`, `:232`) — demander davantage rend 50, jamais une erreur.
 *
 * ORDRE : la passerelle sert `createdAt DESC` (vue par défaut CHRONOLOGIE,
 * `messages-list-views.ts:101-107`) ; ce port RENVERSE en ASCENDANT **par
 * page** — l'ordre des fixtures (`fixtures.ts:80-96`) et de `place()`
 * (`grouping.ts`). C'est `flattenMessagePages` (`messages-pages.ts`) qui
 * recolle les pages dans le bon sens ; voir son doc-comment, le piège y est.
 */
export const messagesQueryKey = (id: string) => ['conversations', id, 'messages'] as const;

const MESSAGES_LIMIT = 50;

export async function loadMessages(
  params: ConversationsDeps & {
    readonly conversationId: string;
    readonly before?: MessagesPageParam;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<MessagesPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const page = pageOfMessages(messagesOf(params.conversationId), {
      ...(params.before !== undefined ? { before: params.before } : {}),
      limit: MESSAGES_LIMIT,
    });
    /**
     * LA FICTION DE `hasOlderMessagesOf` SURVIT À LA PAGINATION (#6972) — le
     * corpus de `c-rattrapage` compte TRENTE messages, sous la limite : la loi
     * de fenêtrage seule rendrait `hasOlder` faux, et le Résumé Vivant
     * perdrait « Sur les N derniers messages », le seul état que cette
     * conversation existe pour rendre atteignable (`fixtures.ts:919`).
     *
     * **`hasOlder` SANS CURSEUR** — la seule forme cohérente ici, et une forme
     * que la passerelle ne produit jamais (un `hasMore` vrai y vient toujours
     * avec le `nextCursor` du dernier message servi). Le fil DÉCLARE donc un
     * historique et n'offre AUCUNE descente : le 2e refus de
     * `nextMessagesCursor` désarme la sentinelle, la fenêtre reste PARTIELLE,
     * et aucune requête ne part.
     *
     * L'écriture précédente rendait le curseur du plus ancien message chargé.
     * La page suivante revenait alors VIDE — le corpus étant épuisé — et
     * `hasOlder` de cette page vide, qui borde désormais la fenêtre, valait
     * FAUX : passer par le mode Résumé après avoir touché le haut du fil
     * effaçait « Sur les N derniers messages » pour de bon. La fiction se
     * falsifiait elle-même, et `check-reading-mode.mjs` l'a dit.
     */
    if (params.before === undefined && !page.hasOlder && hasOlderMessagesOf(params.conversationId)) {
      return { ok: true, data: { ...page, hasOlder: true, nextCursor: null } };
    }
    return { ok: true, data: page };
  }
  const query = new URLSearchParams({
    limit: String(MESSAGES_LIMIT),
    ...(params.before !== undefined ? { before: params.before } : {}),
  });
  const result = await params.transport.request<readonly Message[]>({
    method: 'GET',
    path: `/api/v1/conversations/${params.conversationId}/messages?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      messages: [...result.data].reverse(),
      hasOlder: result.cursorPagination?.hasMore === true,
      /* LA MOITIÉ JETÉE (#6972) — `cursorPagination` était lu pour son SEUL
         `hasMore`, et `nextCursor` — la valeur à renvoyer en `before` —
         mourait ici. Le fil savait donc qu'un historique existait, sans
         jamais pouvoir le demander. */
      nextCursor: result.cursorPagination?.nextCursor ?? null,
    },
  };
}

/**
 * `messagesInfiniteOptions` — spreadable dans `useInfiniteQuery` OU
 * `QueryClient.fetchInfiniteQuery`, SANS `select` (motif
 * `conversationsInfiniteOptions`, `api/conversations.ts`) : un appelant qui
 * n'a besoin que des PAGES brutes n'en paie pas le coût.
 *
 * `initialPageParam: undefined` ⇒ la première page ne porte AUCUN `before` —
 * la MÊME absence que `nextCursor` d'un fil épuisé.
 */
export function messagesInfiniteOptions(deps: ConversationsDeps, conversationId: string) {
  return {
    queryKey: messagesQueryKey(conversationId),
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: MessagesPageParam; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadMessages({
          ...deps,
          conversationId,
          ...(pageParam !== undefined ? { before: pageParam } : {}),
          ...(signal !== undefined ? { signal } : {}),
        }),
      ),
    initialPageParam: undefined as MessagesPageParam,
    getNextPageParam: nextMessagesCursor,
  };
}

/** FABRIQUE (F3) — la même forme que `conversationsQuery`. `select` reste une
 * fonction de MODULE (`threadWindowOf`), jamais une lambda écrite en ligne :
 * le doc-comment de `flattenMessagePages` porte la mesure.
 *
 * **`staleTime: 0` (#7353)** — un fil n'est PAS une famille quasi-immuable
 * (`query-freshness.test.ts`, #6974) : c'est la donnée la plus VIVANTE de
 * l'application. Le défaut de `createAppQueryClient` (30 s) laissait un
 * rechargement qui suit une absence COURTE dans la fenêtre de fraîcheur :
 * le cache restauré était servi et rien ne revalidait, alors que le serveur
 * avait avancé (recette staging 2026-09-21). Cache-first reste entier (D-2,
 * aucun spinner sur un cache non vide) : la valeur ne gouverne QUE la
 * revalidation de fond — la MÊME doctrine que `useStoryFeed` / `usePost`.
 * Posée ICI, dans la fabrique que `useMessages` consomme telle quelle, pour
 * que le témoin `thread-reload-freshness.test.ts` mesure ce que l'écran sert. */
export function messagesQuery(deps: ConversationsDeps, conversationId: string) {
  return { ...messagesInfiniteOptions(deps, conversationId), select: threadWindowOf, staleTime: 0 };
}

export type { HttpTransport };

/* ───────────────────────── LE CACHE DU FIL ─────────────────────────────── */

/**
 * **LES ACCÈS AU CACHE DU FIL** (#6972, étape 1 ; CINQUIÈME accès #7223) —
 * deux pour ÉCRIRE, trois pour LIRE, et rien d'autre ne connaît la forme de
 * la page.
 *
 * Avant #6972, SIX sites l'écrivaient en direct : `realtime-apply.ts`
 * (`applyMessageNew`, `applyMessageTranslation`), `reactions.ts`
 * (`applyDelta`), `send/perform-send.ts` (l'accusé), `routes/thread.tsx`
 * (la consommation d'une vue unique). Chacun recopiait `{ ...page, messages:
 * … }` et le prédicat de dédoublonnage — donc chacun devenait un défaut le
 * jour où la forme changerait. C'est exactement ce que D-44 a soldé pour la
 * Lentille avant de la paginer (`findCachedConversation` / `patchConversation`,
 * `api/conversations.ts`) : **un site lit, un site patche**.
 *
 * `page === undefined` ⇒ **NO-OP**, sur les deux écritures : un fil qui n'est
 * pas OUVERT n'a rien à peindre localement, et fabriquer une page ici
 * inventerait un historique dont on ne connaît ni le curseur ni les bornes
 * (la prochaine ouverture le chargera par `GET …/messages`).
 *
 * `latestCachedThreadMessage` (#7223) rejoint les lectures pour la MÊME
 * raison que les quatre premiers accès : `applyReadStatusUpdated`
 * (`realtime-apply.ts`) a besoin du message le plus RÉCENT d'un fil — et ne
 * doit pas réapprendre que `pages[0]` est la page la plus récente,
 * ASCENDANTE en interne.
 *
 * **CE REPLI N'EST PLUS LA RÈGLE NOMINALE (#7348).** `ReadStatusSummary`
 * porte désormais `messageId?` : quand la charge NOMME son message, le puits
 * cible `findCachedThreadMessage` ci-dessus, pas cette lecture-ci. Elle ne
 * sert plus qu'à la passerelle qui ne pose pas encore ce champ (G-5/#7347 —
 * `MessageReadStatusService.getLatestMessageSummary` décrit alors le dernier
 * message non supprimé de la conversation, et il faut bien en désigner un).
 */

/**
 * Le réducteur d'un fil — `readonly Message[]` → `readonly Message[]`. La
 * MÊME signature que `applyReactionDelta`/`applyConsumption` portaient déjà :
 * ce module ne fait que leur donner UN hôte.
 *
 * **IL EST APPLIQUÉ PAGE PAR PAGE**, donc ce doit être une TRANSFORMATION de
 * rangées (un `map`) — jamais une insertion : appender ici ajouterait la
 * rangée à CHAQUE page chargée. L'insertion a son propre site,
 * `upsertThreadMessage` ci-dessous, qui sait sur quelle page poser un message
 * neuf. Pour un `map`, l'application par page est exactement équivalente à
 * l'application sur le fil aplati.
 */
export type ThreadMessagesUpdater = (messages: readonly Message[]) => readonly Message[];

export function patchThreadMessages(
  queryClient: QueryClient,
  conversationId: string,
  updater: ThreadMessagesUpdater,
): void {
  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId), (data) => {
    if (data === undefined || !Array.isArray(data.pages)) return data;
    return { ...data, pages: data.pages.map((page) => ({ ...page, messages: updater(page.messages) })) };
  });
}

/**
 * `upsertThreadMessage` — REMPLACE par `id` **OU** `clientMessageId` si la
 * rangée existe, sinon APPEND en queue (l'ordre ASCENDANT que ce port
 * établit).
 *
 * La loi était écrite DEUX fois — `applyMessageNew` (`realtime-apply.ts`) et
 * `upsertConfirmed` (`send/perform-send.ts`) — et leurs doc-comments
 * affirmaient déjà être « la MÊME règle » (D-11/D-28). Elles divergeaient
 * pourtant sur un point : `upsertConfirmed` comparait `m.clientMessageId ===
 * confirmed.clientMessageId` SANS garde, ce qui fait matcher `undefined ===
 * undefined` — inoffensif parce qu'un `LocalMessage` en porte toujours un,
 * mais faux comme loi. La garde est ici : le `clientMessageId` de la charge
 * ENTRANTE doit être défini pour servir de clé.
 */
export function upsertThreadMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: Message & { readonly clientMessageId?: string },
): void {
  const cid = message.clientMessageId;
  const matches = (m: Message): boolean =>
    m.id === message.id || (cid !== undefined && (m as { readonly clientMessageId?: string }).clientMessageId === cid);

  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId), (data) => {
    if (data === undefined || !Array.isArray(data.pages)) return data;

    const host = data.pages.findIndex((page) => page.messages.some(matches));
    if (host !== -1) {
      return {
        ...data,
        pages: data.pages.map((page, i) =>
          i === host
            ? {
                ...page,
                messages: page.messages.map((m) =>
                  matches(m)
                    ? {
                        ...m,
                        ...message,
                        deliveredCount: Math.max(m.deliveredCount ?? 0, message.deliveredCount ?? 0),
                        readCount: Math.max(m.readCount ?? 0, message.readCount ?? 0),
                      }
                    : m,
                ),
              }
            : page,
        ),
      };
    }

    /* APPEND SUR `pages[0]` — LA PAGE LA PLUS RÉCENTE. On pagine vers le
       PASSÉ : la page 1 (celle sans `before`) porte les messages les plus
       récents, et un message NEUF est plus récent que tout le chargé. Le
       mettre sur la dernière page l'enverrait au FOND de l'historique.
       `pages` VIDE (un `fetchInfiniteQuery` qui vient d'être remis à zéro) ⇒
       rien à peindre, même doctrine que « le fil n'est pas ouvert ». */
    const newest = data.pages[0];
    if (newest === undefined) return data;
    return {
      ...data,
      pages: [{ ...newest, messages: [...newest.messages, message] }, ...data.pages.slice(1)],
    };
  });
}

/**
 * `cachedThreadConversationIds` — les conversations dont le fil EST en cache.
 * Le prédicat vient de `applyMessageTranslation` (`realtime-apply.ts`), dont
 * la charge (`TranslationEvent`) ne porte PAS `conversationId` : il faut
 * balayer. Trois segments EXACTEMENT, `['conversations', <id>, 'messages']` —
 * ni la liste (`['conversations']`), ni la case d'une conversation
 * (`['conversations', <id>]`), ni la lecture souveraine de l'administration
 * (`ADMIN_SOUVERAIN_PREFIXE`, une clé délibérément AUTRE,
 * `routes/admin-conversation-reading.tsx`).
 */
export function cachedThreadConversationIds(queryClient: QueryClient): readonly string[] {
  return queryClient
    .getQueryCache()
    .findAll({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey.length === 3 &&
        query.queryKey[0] === 'conversations' &&
        query.queryKey[2] === 'messages',
    })
    .map((query) => query.queryKey[1] as string);
}

/** `findCachedThreadMessage` — motif `findCachedConversation` : `undefined`
 * si le message n'y est pas, si le fil n'est pas ouvert, OU si le cache porte
 * encore une forme antérieure (jamais une exception — `CACHE_SCHEMA` purge,
 * mais un appelant qui lirait entre-temps ne doit rien casser). */
export function findCachedThreadMessage(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
): Message | undefined {
  const data = queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId));
  if (data === undefined || !Array.isArray(data.pages)) return undefined;
  for (const page of data.pages) {
    const found = page.messages.find((m) => m.id === messageId);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Une rangée que le SERVEUR n'a jamais vue — la bulle optimiste, tant que
 * l'accusé n'a pas remplacé son identifiant local par l'identifiant serveur
 * (`localMessageOf` pose `id === clientMessageId`, `send/local-message.ts`).
 * Un message du serveur ne porte pas de `clientMessageId`, et `undefined` ne
 * peut égaler aucun `id` : la comparaison est donc juste dans les deux sens.
 */
const isUnconfirmedLocalMessage = (message: Message): boolean =>
  (message as { readonly clientMessageId?: string }).clientMessageId === message.id;

/**
 * `latestCachedThreadMessage` (#7223) — le message le plus récent d'un fil en
 * cache que le SERVEUR connaît, ou `undefined` si le fil n'est pas ouvert, n'a
 * aucun message, ou n'en porte que des optimistes.
 *
 * `pages[0]` est la page la plus RÉCENTE (doc-comment `MessagesPage`,
 * `messages-pages.ts`) et chaque page est ASCENDANTE en interne
 * (§ `upsertThreadMessage` ci-dessus, « APPEND SUR `pages[0]` ») — le dernier
 * élément de `pages[0].messages` est donc le plus récent de tout le fil, sans
 * balayer les autres pages. Un `pages[0]` VIDE (page en cours de remplacement)
 * retombe correctement sur `undefined`.
 *
 * **LES BULLES OPTIMISTES SONT SAUTÉES (revue-correction W2).** L'unique
 * appelant applique un résumé qui décrit le dernier message NON SUPPRIMÉ EN
 * BASE (`MessageReadStatusService.getLatestMessageSummary`) : une rangée que
 * le serveur n'a pas encore reçue ne peut pas être celle-là, et l'estamper
 * posait des compteurs d'un AUTRE message sur un envoi en vol — que
 * `confirmedMessageOf` conserve quand l'accusé ne porte pas `readCount`.
 * On descend donc jusqu'à la rangée CONFIRMÉE la plus récente, qui est bien
 * celle que le résumé décrit.
 */
export function latestCachedThreadMessage(queryClient: QueryClient, conversationId: string): Message | undefined {
  const data = queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId));
  if (data === undefined || !Array.isArray(data.pages)) return undefined;
  const newest = data.pages[0];
  if (newest === undefined) return undefined;
  return [...newest.messages].reverse().find((m) => !isUnconfirmedLocalMessage(m));
}

/**
 * L'ENVOI D'UN MESSAGE (#5813, étape 2 ; étendu #5668 aux pièces jointes) —
 * `POST /api/v1/conversations/:id/messages`
 * (`services/gateway/src/routes/conversations/messages-send.ts:117-120`,
 * `SendMessageBodySchema:41-105`). SUCCÈS = **200**, pas 201
 * (`response.ts:38`, `messages-send.ts:391` — § 0 de la spécification #5813,
 * le critère de recette qui dit « 201 » est FAUX).
 *
 * `content` est OPTIONNEL (`.refine()` du serveur : `content.trim()` non vide
 * OU `attachmentIds.length > 0`, `messages-send.ts:96-105`) — un vocal PUR
 * part SANS la clé, jamais `content: ''`. `messageType` est OPTIONNEL et
 * n'est posé QUE hors du défaut serveur `'text'` (`messages-send.ts:59`,
 * `:142`) — la même discipline « aucune clé à sa valeur par défaut » que le
 * reste de ce port. `attachmentIds` : les ids rendus par
 * `POST /api/v1/attachments/upload` (`api/attachments.ts`), bornés à
 * `MAX_ATTACHMENTS_PER_MESSAGE` (`@meeshy/shared/types/attachment.ts:454`) —
 * la borne n'est PAS revérifiée ici, c'est `send/attachments.ts` /
 * `use-recorder.ts` qui composent la sélection, jamais un lot déjà hors
 * limite. Aucune clé posée à `undefined` (`exactOptionalPropertyTypes`).
 */
export type SendMessageBody = {
  readonly content?: string;
  readonly originalLanguage: string;
  readonly clientMessageId: string;
  readonly messageType?: 'image' | 'file' | 'audio' | 'video';
  readonly attachmentIds?: readonly string[];
  readonly replyToId?: string;
  /**
   * LA PROTECTION (#6175) — `SendMessageBodySchema:76-81`
   * (`services/gateway/src/routes/conversations/messages-send.ts`). Chaque
   * clé est OMISE à sa valeur par défaut (`protectionBodyOf`,
   * `send/perform-send.ts`) — jamais `false`/`0` posé explicitement.
   */
  readonly isBlurred?: boolean;
  /** Chaîne ISO — le serveur la revit en `Date` (`messages-send.ts:317`). */
  readonly expiresAt?: string;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  /**
   * LE LIEU PARTAGÉ (#7280) — champ DÉDIÉ, jamais fusionné dans un
   * `metadata` brut : cette enveloppe porte des champs à autorité serveur
   * qu'un passthrough permettrait de forger (`MessageRequest.location`,
   * `packages/shared/types/messaging.ts:171-175`). La validation STRICTE
   * (bornes des coordonnées, longueur des textes) vit côté passerelle
   * (`services/gateway/src/services/location/sharedPlace.ts`), jamais ici —
   * ce port n'en produit que la forme acceptée (`send/shared-place.ts`).
   */
  readonly location?: SharedPlace;
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
