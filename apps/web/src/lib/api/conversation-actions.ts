import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState, OverrideKey, PreferenceKey } from '@/lib/conversation-store';
import { effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import type { RowFlagActionId } from '@/lib/view/row-actions';

import { conversationQueryKey, findCachedConversation, type ConversationsDeps } from './conversations';
import { outcomeOf } from './outcome';
import type { ConversationPreferencePatch } from './preferences';
import { pushConversationFlags, pushRead, pushUnread } from './preference-ports';
import { beginRowGesture, confirmPreferences, confirmRead, confirmUnread, replayRowGestures, type RowGesture, type RowGestureQueue } from './row-gestures';
import type { Conversation } from './types';

/**
 * LES MUTATIONS DE RANGÉE (#5650, F4) — miroir `ConversationStore.apply`
 * (`packages/MeeshySDK/.../Store/ConversationStore.swift:282-341`) :
 * instantané → override optimiste → appel → `completed` (le cache prend la
 * valeur CONFIRMÉE, l'override est retiré) / `failedPermanent` (4xx,
 * rollback : l'override est retiré, le cache reste intact) /
 * `failedTransient` (réseau, 5xx : l'override RESTE, et le geste entre dans la
 * file de reprise du compte, rejouée au retour du réseau — `row-gestures.ts`,
 * #18917, miroir de l'outbox iOS).
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
  /** La file de reprise du compte (#18917) ; absente (invité, témoin), une panne garde l'override sans rejeu. */
  readonly gestures?: RowGestureQueue | null;
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

type ActionPlan = {
  readonly keys: readonly OverrideKey[];
  /** `null` en source `fixtures` : l'override optimiste reste, sans appel. */
  readonly request: (() => Promise<unknown>) | null;
  /** Écrit la valeur CONFIRMÉE dans le cache — appelé seulement sur succès. */
  readonly applyConfirmed: (result: unknown) => void;
  /** L'état nouveau de la bascule, tel que {@link RowActionEvent} le porte. */
  readonly on: boolean;
  /** Ce que la file de reprise rejouera si le réseau manque (#18917). */
  readonly gesture: RowGesture;
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
      gesture: { kind: 'flag', conversationId, field, value: next },
      request: gateway ? () => pushConversationFlags(transport, conversationId, { [field]: next }) : null,
      applyConfirmed: (result) => confirmPreferences(queryClient, conversationId, successDataOf(result) ?? { [field]: next }),
    };
  }

  // action === 'read' : bascule LU / NON-LU selon l'état EFFECTIF courant.
  const isUnread = effectiveUnreadOf(conversation, store.overrides) > 0;
  if (isUnread) {
    store.markRead(conversationId);
    return {
      keys: ['unreadCount'],
      on: true,
      gesture: { kind: 'read', conversationId, read: true },
      request: gateway ? () => pushRead(transport, conversationId) : null,
      /* « Lu » confirmé (#7351) : le compte tombe à 0 ET le curseur avance sur le dernier message que la rangée montrait. */
      applyConfirmed: () => confirmRead(queryClient, conversationId, conversation),
    };
  }
  store.markUnread(conversationId);
  return {
    keys: ['unreadCount'],
    on: false,
    gesture: { kind: 'read', conversationId, read: false },
    request: gateway ? () => pushUnread(transport, conversationId) : null,
    applyConfirmed: () => confirmUnread(queryClient, conversationId),
  };
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

  /* Un geste neuf remplace celui de la même clé en file : son rejeu ne le défera pas. */
  const park = beginRowGesture(deps.gestures, plan.gesture);
  let result: unknown;
  try {
    result = await plan.request();
  } catch {
    park(); // panne réseau — l'override RESTE, le geste attend le réseau.
    return;
  }

  const outcome = outcomeOf(result);
  if (outcome === 'transient') {
    park();
    return;
  }
  if (outcome === 'permanent') {
    deps.store.getState().clearOverride(conversationId, plan.keys);
    deps.notify?.({ kind: 'refused', action });
    return;
  }
  plan.applyConfirmed(result);
  deps.store.getState().clearOverride(conversationId, plan.keys);
  await replayParked(deps);
}

/** La passerelle vient de répondre : les gestes restés en file partent à sa suite (#18917). */
function replayParked(deps: ConversationActionDeps): Promise<void> {
  const gestures = deps.gestures;
  return gestures == null ? Promise.resolve() : replayRowGestures({ ...deps, gestures });
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
  const keys = Object.keys(patch) as PreferenceKey[];
  deps.store.getState().setPreference(conversationId, patch);
  if (deps.source !== 'gateway') return;

  const gestures: readonly RowGesture[] = keys.map((field) => ({ kind: 'preference', conversationId, field, value: patch[field] ?? null }));
  const parks = gestures.map((gesture) => beginRowGesture(deps.gestures, gesture));
  const park = (): void => parks.forEach((parkOne) => parkOne());
  let result: unknown;
  try {
    result = await pushConversationFlags(deps.transport, conversationId, patch);
  } catch {
    park();
    return;
  }

  const outcome = outcomeOf(result);
  if (outcome === 'transient') {
    park();
    return;
  }
  if (outcome === 'success') confirmPreferences(deps.queryClient, conversationId, { ...patch, ...successDataOf(result) });
  deps.store.getState().clearOverride(conversationId, keys);
  if (outcome === 'success') await replayParked(deps);
}
