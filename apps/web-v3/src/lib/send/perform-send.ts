import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { newClientMessageId } from '@/lib/api/client-message-id';
import { patchConversation, type ConversationsDeps } from '@/lib/api/conversations';
import { messagesQueryKey, sendMessage, type MessagesPage, type SendMessageBody } from '@/lib/api/messages';
import type { Message, Participant } from '@/lib/api/types';

import { confirmedMessageOf, localMessageOf, type LocalMessage } from './local-message';
import { entriesOf, type OutboxState } from './outbox-store';

/**
 * LE SITE UNIQUE DE LA RÈGLE (#5813, étape 5) — comment une écriture PART,
 * se CONFIRME et se RELANCE. `queryClient`/`outbox`/`online` sont REÇUS,
 * jamais lus depuis un singleton : ce module ne sait rien de `apiConfig`
 * ni de `useOnline()`, `use-send.ts` (le hook, sans règle) les lui fournit.
 */
export type SendDeps = ConversationsDeps & {
  readonly queryClient: QueryClient;
  readonly outbox: StoreApi<OutboxState>;
  readonly online: boolean;
  /** Horloge injectable — jamais `Date.now()` lu directement (témoins). */
  readonly now?: () => number;
};

export type Draft = {
  readonly content: string;
  readonly originalLanguage: string;
  readonly replyToId?: string;
  /** Le message cité, ENTIER — voir `localMessageOf` (`local-message.ts`,
   * défaut majeur 6, revue-correction #5813) : porté à côté de `replyToId`
   * pour que la bulle optimiste affiche sa citation avant tout accusé. */
  readonly replyTo?: Message;
};

/**
 * LE DÉDOUBLONNAGE DU DOUBLE-TAP — miroir
 * `ConversationViewModel.swift:81` (`duplicateSendDebounce`, 0,6 s) : deux
 * envois du MÊME `(conversationId, content, replyToId)` sous 600 ms sont UN
 * seul envoi, jamais deux messages identiques partis en double. Une carte de
 * MODULE (comme `consumedViewOnceIds`, `api/fixtures.ts`) — la clé compose
 * la conversation pour qu'un même texte tapé dans DEUX fils distincts ne se
 * dédoublonne jamais entre eux.
 *
 * ELLE NE RETIENT RIEN AU-DELÀ DE SA FENÊTRE (revue-correction) : sa clé
 * porte le TEXTE ENTIER du message et sa valeur ne vaut que 600 ms — la
 * laisser croître garderait en mémoire, pour toute la session, chaque
 * message jamais écrit (dimension 3, « aucun cache non borné »). La purge se
 * fait à l'entrée de `performSend`, sur une carte qui reste par construction
 * minuscule : jamais un minuteur, jamais un second cycle de vie à tenir.
 */
const DEBOUNCE_MS = 600;
const lastAccepted = new Map<string, number>();

/**
 * Le séparateur est U+0000, ÉCRIT EN ÉCHAPPEMENT et jamais en octet brut : un
 * seul NUL dans le fichier suffit à faire classer la source BINAIRE par git
 * (`git diff` rend « Bin 0 -> 9232 bytes », plus aucune revue possible) —
 * mesuré sur ce fichier même. La valeur produite est identique.
 */
function debounceKeyOf(conversationId: string, content: string, replyToId: string | undefined): string {
  return `${conversationId}\u0000${content}\u0000${replyToId ?? ''}`;
}

function pruneDebounce(nowMs: number): void {
  for (const [key, at] of lastAccepted) {
    if (nowMs - at >= DEBOUNCE_MS) lastAccepted.delete(key);
  }
}

/** TÉMOIN SEUL — combien de clés la carte du débounce RETIENT (même
 * discipline que `resetSentMessagesForTests`, `api/fixtures.ts`). */
export function debounceEntryCountForTests(): number {
  return lastAccepted.size;
}

function bodyOf(message: LocalMessage): SendMessageBody {
  return {
    content: message.content,
    originalLanguage: message.originalLanguage,
    clientMessageId: message.clientMessageId,
    ...(message.replyToId === undefined ? {} : { replyToId: message.replyToId }),
  };
}

/**
 * REMPLACE par `id` OU `clientMessageId` s'il existe déjà dans la page (un
 * écho socket arrivé avant l'accusé REST, cas #5494), sinon APPEND en queue
 * — l'ordre ASCENDANT que `messages.ts` établit (§3.1/4.5 point 2 de la
 * spécification #5813).
 */
function upsertConfirmed(messages: readonly Message[], confirmed: LocalMessage): readonly Message[] {
  const index = messages.findIndex(
    (m) =>
      m.id === confirmed.id ||
      (m as { readonly clientMessageId?: string }).clientMessageId === confirmed.clientMessageId,
  );
  if (index === -1) return [...messages, confirmed];
  return messages.map((m, i) => (i === index ? confirmed : m));
}

/**
 * L'ENVOL, ET SA GARDE — `dispatch` ne rend JAMAIS un rejet, quoi qu'il
 * arrive à `attempt` (revue-correction).
 */
async function dispatch(params: {
  readonly conversationId: string;
  readonly message: LocalMessage;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, message, deps } = params;
  try {
    await attempt(params);
  } catch {
    /* AUCUNE EXCEPTION NE LAISSE UN MESSAGE SUR L'HORLOGE. `performSend` est
       appelé en `void` par le hook : un rejet y resterait non traité et
       l'entrée d'outbox garderait `pending` POUR TOUJOURS — une horloge qui
       tourne sans reprise possible. `ApiResult` ne rejette jamais (doctrine
       `http.ts`), mais ce module REÇOIT son transport : la garde tient sur ce
       qu'on lui donne. Direction de l'erreur choisie par le COÛT DE
       RÉPARATION — un « Réessayer » de trop se rejoue (l'appel est idempotent
       par `clientMessageId`), une horloge figée ne se répare pas. */
    deps.outbox.getState().markFailed(conversationId, message.clientMessageId);
  }
}

/**
 * LA TENTATIVE — appelle le port, puis arbitre l'issue. **Un seul geste pour
 * les deux issues d'échec** (permanent/transient) : la différence vit dans
 * `lastError.status` de l'entrée d'outbox, pour l'affichage et pour la
 * future file de reprise (issue compagnon Q2). `ApiResult` ne rejette jamais
 * (doctrine `http.ts`), `unwrap` n'est PAS appelé — ce n'est pas un
 * `queryFn` ; ce qui pourrait tout de même lever est rattrapé par `dispatch`.
 */
async function attempt(params: {
  readonly conversationId: string;
  readonly message: LocalMessage;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, message, deps } = params;
  const result = await sendMessage({
    source: deps.source,
    transport: deps.transport,
    conversationId,
    body: bodyOf(message),
  });

  if (!result.ok) {
    deps.outbox.getState().markFailed(conversationId, message.clientMessageId, result);
    return;
  }

  const confirmed = confirmedMessageOf(message, result.data);

  // ANNULE le refetch en vol AVANT d'écrire — sinon la résolution d'une
  // page déjà en cours écraserait le confirmé qu'on vient de poser
  // (témoin 4.5, point 11).
  await deps.queryClient.cancelQueries({ queryKey: messagesQueryKey(conversationId) });
  deps.queryClient.setQueryData<MessagesPage>(messagesQueryKey(conversationId), (page) =>
    page === undefined ? page : { ...page, messages: upsertConfirmed(page.messages, confirmed) },
  );
  patchConversation(deps.queryClient, conversationId, (c) => {
    // La clé RETIRÉE, jamais posée à `undefined` (`exactOptionalPropertyTypes`) —
    // un message texte confirmé n'a pas encore de traductions connues.
    const { lastMessageTranslations: _lastMessageTranslations, ...rest } = c;
    return {
      ...rest,
      lastMessage: confirmed,
      // `createdAt` de l'accusé reste une CHAÎNE dans le cache (D-26) — même
      // écart de forme que `confirmedMessageOf`, même cast justifié.
      lastMessageAt: confirmed.createdAt as unknown as Date,
      lastMessageOriginalLanguage: confirmed.originalLanguage,
    };
  });
  deps.outbox.getState().remove(conversationId, message.clientMessageId);
}

export async function performSend(params: {
  readonly conversationId: string;
  readonly draft: Draft;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, draft, viewerId, sender, deps } = params;
  const now = deps.now ?? Date.now;
  const nowMs = now();

  const key = debounceKeyOf(conversationId, draft.content, draft.replyToId);
  const previous = lastAccepted.get(key);
  pruneDebounce(nowMs);
  if (previous !== undefined && nowMs - previous < DEBOUNCE_MS) return;
  lastAccepted.set(key, nowMs);

  const clientMessageId = newClientMessageId();
  const message = localMessageOf({
    clientMessageId,
    conversationId,
    viewerId,
    ...(sender === undefined ? {} : { sender }),
    content: draft.content,
    originalLanguage: draft.originalLanguage,
    ...(draft.replyToId === undefined ? {} : { replyToId: draft.replyToId }),
    ...(draft.replyTo === undefined ? {} : { replyTo: draft.replyTo }),
    now: new Date(nowMs),
  });

  deps.outbox.getState().enqueue(conversationId, {
    message,
    delivery: deps.online ? 'pending' : 'failed',
    attempts: deps.online ? 1 : 0,
    startedAt: nowMs,
  });

  if (!deps.online) return; // hors ligne (D-16) : aucun appel.

  await dispatch({ conversationId, message, deps });
}

export async function retrySend(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, clientMessageId, deps } = params;
  const entry = entriesOf(deps.outbox.getState(), conversationId).find(
    (e) => e.message.clientMessageId === clientMessageId,
  );
  if (entry === undefined || entry.delivery !== 'failed') return;
  if (!deps.online) return; // D-16 : reste en échec, aucun appel.

  const now = deps.now ?? Date.now;
  deps.outbox.getState().markPending(conversationId, clientMessageId, now());
  // Le MÊME `clientMessageId` et la MÊME `originalLanguage` — `entry.message`
  // est repris tel quel, jamais reconstruit (« aucune régénération au
  // renvoi », § 10 de la spécification #5813).
  await dispatch({ conversationId, message: entry.message, deps });
}
