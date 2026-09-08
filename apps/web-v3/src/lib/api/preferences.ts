import type { Transport } from '../net/transport';
import type { Conversation } from './types';

/**
 * LES PRÉFÉRENCES DE CONVERSATION PAR LECTEUR — épinglage, sourdine, archive.
 *
 * `flagsOf`/`customNameOf` NARROWENT `Conversation.userPreferences`, déclaré
 * `unknown` côté `@meeshy/shared` (`packages/shared/types/conversation.ts:377`)
 * parce que le wire le porte en TABLEAU d'au plus une entrée — `take: 1`,
 * `services/gateway/src/routes/conversations/core-list.ts:365` — projetée par
 * `conversationUserPreferencesSelect`
 * (`services/gateway/src/routes/conversations/core-selects.ts:62-80`) et
 * déclarée au wire par
 * `packages/shared/types/api-schemas/conversation.ts:588-600` :
 * `{ isPinned, isMuted, isArchived, tags, categoryId, customName, reaction }`.
 *
 * FAIL-CLOSED : toute forme qui ne correspond pas exactement à l'attendu
 * (absente, non-tableau, tableau vide, entrée non-objet, champ manquant) rend
 * `false` — jamais une exception, jamais un `true` optimiste. Une préférence
 * mal lue doit se tromper du côté qui ne PRIVILÉGIE personne par erreur : une
 * conversation qu'on croit à tort épinglée dérange moins qu'une conversation
 * muette qu'on croit à tort audible.
 *
 * Les ports (`pushConversationFlags`, `pushRead`, `pushUnread`) composent les
 * requêtes EXACTES des routes réelles (#5559 §3.2-3.4) — jamais l'alias
 * déprécié `POST /conversations/:id/mark-read`
 * (`services/gateway/src/routes/conversations/messages-read-status.ts:97-145`,
 * dépréciée depuis 2026-08-30) : le successeur est
 * `POST /conversations/:id/receipts` avec `{ type: 'read' }`
 * (`receipts.ts:689-701`).
 */
export type ConversationFlags = {
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly isArchived: boolean;
};

const NO_FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };

/** L'entrée UNIQUE du tableau `userPreferences`, ou `undefined` si la forme
 * n'y correspond pas — le narrowing s'arrête ici, jamais plus loin. */
const preferenceEntryOf = (conversation: Conversation): Record<string, unknown> | undefined => {
  const raw = conversation.userPreferences;
  if (!Array.isArray(raw)) return undefined;
  const [entry] = raw;
  if (typeof entry !== 'object' || entry === null) return undefined;
  return entry as Record<string, unknown>;
};

const boolOf = (entry: Record<string, unknown> | undefined, field: string): boolean =>
  entry !== undefined && entry[field] === true;

export function flagsOf(conversation: Conversation): ConversationFlags {
  const entry = preferenceEntryOf(conversation);
  if (entry === undefined) return NO_FLAGS;
  return {
    isPinned: boolOf(entry, 'isPinned'),
    isMuted: boolOf(entry, 'isMuted'),
    isArchived: boolOf(entry, 'isArchived'),
  };
}

export function customNameOf(conversation: Conversation): string | undefined {
  const entry = preferenceEntryOf(conversation);
  const value = entry?.['customName'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * `PUT /api/v1/user-preferences/conversations/:conversationId` (§3.2,
 * `services/gateway/src/routes/conversation-preferences.ts:349-435`). Corps
 * PARTIEL — un seul champ par appel : composer les trois à chaque fois
 * écraserait, côté serveur, un changement concurrent sur un champ que
 * l'appelant n'avait pas l'intention de toucher (`updateData` du serveur ne
 * touche que ce qu'il reçoit, `:393-405`).
 */
export function pushConversationFlags(
  transport: Transport,
  conversationId: string,
  patch: Partial<ConversationFlags>,
): Promise<unknown> {
  return transport({
    method: 'PUT',
    path: `/api/v1/user-preferences/conversations/${conversationId}`,
    body: patch,
  });
}

/**
 * `POST /api/v1/conversations/:conversationId/receipts`, corps
 * `{ type: 'read' }` (§3.3, `receipts.ts:689-701`) — le SUCCESSEUR de l'alias
 * déprécié, jamais l'alias lui-même.
 */
export function pushRead(transport: Transport, conversationId: string): Promise<unknown> {
  return transport({
    method: 'POST',
    path: `/api/v1/conversations/${conversationId}/receipts`,
    body: { type: 'read' },
  });
}

/**
 * `POST /api/v1/conversations/:conversationId/mark-unread`, sans corps (§3.4,
 * `messages-read-status.ts:159-196`).
 */
export function pushUnread(transport: Transport, conversationId: string): Promise<unknown> {
  return transport({
    method: 'POST',
    path: `/api/v1/conversations/${conversationId}/mark-unread`,
  });
}
