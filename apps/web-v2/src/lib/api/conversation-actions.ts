import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState, OverrideKey } from '@/lib/conversation-store';
import { effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import type { RowActionId } from '@/lib/view/row-actions';

import { CONVERSATIONS_QUERY_KEY, patchConversation, type ConversationsDeps } from './conversations';
import { outcomeOf } from './outcome';
import { pushConversationFlags, pushRead, pushUnread } from './preferences';
import type { Conversation } from './types';

/**
 * LES MUTATIONS DE RANGÉE (#5650, F4) — miroir `ConversationStore.apply`
 * (`packages/MeeshySDK/.../Store/ConversationStore.swift:282-341`) :
 * instantané → override optimiste → appel → `completed` (le cache prend la
 * valeur CONFIRMÉE, l'override est retiré) / `failedPermanent` (4xx,
 * rollback : l'override est retiré, le cache reste intact) /
 * `failedTransient` (réseau, 5xx : l'override RESTE — l'outbox iOS rejoue,
 * sur le web c'est une issue compagnon « file de reprise hors ligne »).
 *
 * `outcomeOf` et `patchConversation` vivent désormais dans `./outcome` et
 * `./conversations` (#5813, étape 0) — `send/perform-send.ts` (un envoi de
 * message) les réutilise sans en écrire une seconde copie.
 */
export type ConversationActionDeps = ConversationsDeps & {
  readonly store: StoreApi<ConversationStoreState>;
  readonly queryClient: QueryClient;
};

function successDataOf(result: unknown): Record<string, unknown> | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const r = result as { readonly ok?: unknown; readonly data?: unknown };
  return r.ok === true && typeof r.data === 'object' && r.data !== null ? (r.data as Record<string, unknown>) : undefined;
}

function preferenceEntryOf(conversation: Conversation): Record<string, unknown> {
  const raw = conversation.userPreferences;
  const entry = Array.isArray(raw) ? raw[0] : undefined;
  return typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
}

type ActionPlan = {
  readonly keys: readonly OverrideKey[];
  /** `null` en source `fixtures` : l'override optimiste reste, sans appel. */
  readonly request: (() => Promise<unknown>) | null;
  /** Écrit la valeur CONFIRMÉE dans le cache — appelé seulement sur succès. */
  readonly applyConfirmed: (result: unknown) => void;
};

function planOf(params: {
  readonly conversationId: string;
  readonly action: RowActionId;
  readonly conversation: Conversation;
  readonly deps: ConversationActionDeps;
  readonly store: ConversationStoreState;
}): ActionPlan {
  const { conversationId, action, conversation, deps, store } = params;
  const { source, transport, queryClient } = deps;
  const flags = effectiveFlagsOf(conversation, store.overrides);
  const gateway = source === 'gateway';

  if (action === 'pin' || action === 'mute' || action === 'archive') {
    const field = action === 'pin' ? 'isPinned' : action === 'mute' ? 'isMuted' : 'isArchived';
    const current = flags[field];
    const next = !current;
    if (action === 'pin') store.togglePin(conversationId, current);
    if (action === 'mute') store.toggleMute(conversationId, current);
    if (action === 'archive') store.toggleArchive(conversationId, current);
    return {
      keys: [field],
      request: gateway ? () => pushConversationFlags(transport, conversationId, { [field]: next }) : null,
      applyConfirmed: (result) => {
        const confirmed = successDataOf(result) ?? { [field]: next };
        patchConversation(queryClient, conversationId, (c) => ({
          ...c,
          userPreferences: [{ ...preferenceEntryOf(c), ...confirmed }],
        }));
      },
    };
  }

  // action === 'read' : bascule LU / NON-LU selon l'état EFFECTIF courant.
  const isUnread = effectiveUnreadOf(conversation, store.overrides) > 0;
  if (isUnread) {
    store.markRead(conversationId);
    return {
      keys: ['unreadCount'],
      request: gateway ? () => pushRead(transport, conversationId) : null,
      applyConfirmed: () => patchConversation(queryClient, conversationId, (c) => ({ ...c, unreadCount: 0 })),
    };
  }
  store.markUnread(conversationId);
  return {
    keys: ['unreadCount'],
    request: gateway ? () => pushUnread(transport, conversationId) : null,
    applyConfirmed: () =>
      patchConversation(queryClient, conversationId, (c) => ({
        ...c,
        unreadCount: Math.max(1, c.unreadCount ?? 0),
      })),
  };
}

/**
 * `performRowAction` — le SITE UNIQUE qui applique l'override, appelle le
 * port et arbitre l'issue. `queryClient.invalidateQueries` n'est PAS
 * appelé : la réponse du serveur suffit (dimension 2 — zéro requête de plus).
 */
export async function performRowAction(params: {
  readonly conversationId: string;
  readonly action: RowActionId;
  readonly deps: ConversationActionDeps;
}): Promise<void> {
  const { conversationId, action, deps } = params;
  const list = deps.queryClient.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
  const conversation = list?.find((c) => c.id === conversationId);
  if (conversation === undefined) return;

  const store = deps.store.getState();
  const plan = planOf({ conversationId, action, conversation, deps, store });

  if (plan.request === null) return; // source fixtures : l'override reste, jamais d'appel.

  let result: unknown;
  try {
    result = await plan.request();
  } catch {
    return; // panne réseau — TRANSIENT : l'override RESTE.
  }

  const outcome = outcomeOf(result);
  if (outcome === 'transient') return;
  if (outcome === 'permanent') {
    deps.store.getState().clearOverride(conversationId, plan.keys);
    return;
  }
  plan.applyConfirmed(result);
  deps.store.getState().clearOverride(conversationId, plan.keys);
}
