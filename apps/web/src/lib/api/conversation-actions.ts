import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState, OverrideKey } from '@/lib/conversation-store';
import { effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import type { RowFlagActionId } from '@/lib/view/row-actions';

import { conversationQueryKey, findCachedConversation, patchConversation, patchConversationDetail, type ConversationsDeps } from './conversations';
import { toDate } from './decode';
import { outcomeOf } from './outcome';
import { pushConversationFlags, pushRead, pushUnread, type ConversationPreferencePatch } from './preferences';
import { caughtUpConversation } from './receipts';
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
  /** Reçoit l'issue du geste (voir {@link RowActionEvent}) ; absent, le geste reste muet. */
  readonly notify?: (event: RowActionEvent) => void;
};

/**
 * L'ISSUE D'UN GESTE DE RANGÉE, dite à qui l'annonce — `applied` à l'instant
 * où l'override optimiste est posé (`on` : l'état NOUVEAU ; pour `read`, vrai
 * quand la rangée devient lue), `refused` quand la passerelle défait le geste
 * (4xx). Une panne réseau ne dit rien : l'override reste, le geste est tenu.
 */
export type RowActionEvent =
  | { readonly kind: 'applied'; readonly action: RowFlagActionId; readonly on: boolean }
  | { readonly kind: 'refused'; readonly action: RowFlagActionId };

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
  /** L'état nouveau de la bascule, tel que {@link RowActionEvent} le porte. */
  readonly on: boolean;
};

function planOf(params: {
  readonly conversationId: string;
  readonly action: RowFlagActionId;
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
      on: next,
      request: gateway ? () => pushConversationFlags(transport, conversationId, { [field]: next }) : null,
      applyConfirmed: (result) => {
        const confirmed = successDataOf(result) ?? { [field]: next };
        const apply = (c: Conversation): Conversation => ({ ...c, userPreferences: [{ ...preferenceEntryOf(c), ...confirmed }] });
        patchConversation(queryClient, conversationId, apply);
        patchConversationDetail(queryClient, conversationId, apply);
      },
    };
  }

  // action === 'read' : bascule LU / NON-LU selon l'état EFFECTIF courant.
  const isUnread = effectiveUnreadOf(conversation, store.overrides) > 0;
  if (isUnread) {
    store.markRead(conversationId);
    return {
      keys: ['unreadCount'],
      on: true,
      request: gateway ? () => pushRead(transport, conversationId) : null,
      applyConfirmed: () => {
        const readThrough = readThroughLastMessage(conversation);
        patchConversation(queryClient, conversationId, readThrough);
        patchConversationDetail(queryClient, conversationId, readThrough);
      },
    };
  }
  store.markUnread(conversationId);
  return {
    keys: ['unreadCount'],
    on: false,
    request: gateway ? () => pushUnread(transport, conversationId) : null,
    applyConfirmed: () =>
      patchConversation(queryClient, conversationId, (c) => ({
        ...c,
        unreadCount: Math.max(1, c.unreadCount ?? 0),
      })),
  };
}

/**
 * « Lu » confirmé (#7351, revue-correction) — `POST …/receipts { type: 'read' }`
 * lit TOUT jusqu'au dernier message que la rangée montrait : le compte tombe à
 * 0 ET le curseur avance sur ce message, dans la liste comme dans le détail
 * que le fil relit (`caughtUpConversation`, la forme de `markCaughtUp`). Le
 * compte seul laissait un curseur ancien — qui prime sur le compte — rendre
 * non lus au fil rouvert les messages qu'on venait de marquer lus.
 */
function readThroughLastMessage(row: Conversation): (conversation: Conversation) => Conversation {
  const last = row.lastMessage;
  if (last === undefined) return (conversation) => ({ ...conversation, unreadCount: 0 });
  const cursor = { messageId: last.id, messageCreatedAt: toDate(last.createdAt), readAt: new Date() };
  return (conversation) => caughtUpConversation(conversation, cursor);
}

/**
 * `performRowAction` — le SITE UNIQUE qui applique l'override, appelle le
 * port et arbitre l'issue. `queryClient.invalidateQueries` n'est PAS
 * appelé : la réponse du serveur suffit (dimension 2 — zéro requête de plus).
 */
export async function performRowAction(params: {
  readonly conversationId: string;
  readonly action: RowFlagActionId;
  readonly deps: ConversationActionDeps;
}): Promise<void> {
  const { conversationId, action, deps } = params;
  /* La feuille de détails d'un fil ouvert par son adresse (#7836) : la liste
     n'est pas encore chargée, le cache du FIL connaît la conversation. */
  const conversation =
    findCachedConversation(deps.queryClient, conversationId) ?? deps.queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId));
  if (conversation === undefined) return;

  const store = deps.store.getState();
  const plan = planOf({ conversationId, action, conversation, deps, store });
  deps.notify?.({ kind: 'applied', action, on: plan.on });

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
    deps.notify?.({ kind: 'refused', action });
    return;
  }
  plan.applyConfirmed(result);
  deps.store.getState().clearOverride(conversationId, plan.keys);
}

/**
 * `performPreferenceAction` (#10593) — favori, catégorie, nom personnel, par
 * la MÊME loi que les drapeaux : correction optimiste dans le store, PUT
 * PARTIEL (`PUT /user-preferences/conversations/:id`, le seul champ touché),
 * puis la valeur SERVIE gagne (2xx, liste ET fiche du fil), le refus défait
 * (4xx), la panne garde la correction (réseau, 5xx).
 */
export async function performPreferenceAction(params: {
  readonly conversationId: string;
  readonly patch: ConversationPreferencePatch;
  readonly deps: ConversationActionDeps;
}): Promise<void> {
  const { conversationId, patch, deps } = params;
  const keys = Object.keys(patch) as (keyof ConversationPreferencePatch)[];
  deps.store.getState().setPreference(conversationId, patch);
  if (deps.source !== 'gateway') return;

  let result: unknown;
  try {
    result = await pushConversationFlags(deps.transport, conversationId, patch);
  } catch {
    return;
  }

  const outcome = outcomeOf(result);
  if (outcome === 'transient') return;
  if (outcome === 'success') {
    const confirmed = { ...patch, ...successDataOf(result) };
    const apply = (c: Conversation): Conversation => ({ ...c, userPreferences: [{ ...preferenceEntryOf(c), ...confirmed }] });
    patchConversation(deps.queryClient, conversationId, apply);
    patchConversationDetail(deps.queryClient, conversationId, apply);
  }
  deps.store.getState().clearOverride(conversationId, keys);
}
