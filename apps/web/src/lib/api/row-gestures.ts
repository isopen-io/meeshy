import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState, OverrideKey, PreferenceKey } from '@/lib/conversation-store';
import { createOfflineQueue, type OfflineQueue } from '@/lib/offline-queue';
import type { SafeStorage } from '@/lib/storage';

import { conversationQueryKey, findCachedConversation, patchConversation, patchConversationDetail, type ConversationsDeps } from './conversations';
import { toDate } from './decode';
import { outcomeOf } from './outcome';
import { pushConversationFlags, pushRead, pushUnread } from './preference-ports';
import { caughtUpConversation } from './receipts';
import type { Conversation } from './types';

/**
 * **LA FILE DE REPRISE DES GESTES DE RANGÉE** (#18917, option A — révision de
 * D-26). Épingler, sourdine, archiver, lu / non-lu, favori, catégorie, nom
 * personnel : sans réseau ou sur un 5xx, l'override restait, mais rien ne
 * repartait — les autres appareils ne voyaient jamais le geste, et le
 * rechargement l'effaçait sans le dire. Miroir de l'outbox iOS
 * (`SettingsActionQueue`).
 *
 * - Le geste entre dans une file PERSISTÉE par compte (`createOfflineQueue`,
 *   `meeshy.row-gestures.u_<id>`), dédoublonnée par conversation ET par clé :
 *   épingler puis désépingler hors ligne n'envoie que le dernier état, à la
 *   place du premier dans la file.
 * - Elle se rejoue en FIFO au retour du réseau, à chaque (ré)authentification
 *   du temps réel (`app-row-gestures.ts`) et derrière tout geste qui aboutit
 *   — une panne 5xx ne fait basculer aucun `online`, motif de la file des
 *   accusés de lecture (`receipts.ts`). L'override tient jusqu'à l'accusé.
 *   Accusé : le cache prend la valeur confirmée. Refus (4xx) : l'override est
 *   retiré. Toujours en panne : le geste reste, à sa place.
 * - Le dernier arrivé au serveur l'emporte, comme sur iOS — sauf qu'une valeur
 *   servie EN TEMPS RÉEL pour une clé en file (un autre appareil, après le
 *   geste) est plus récente : elle retire l'override ET le geste
 *   (`supersedeRowGestures`, appelé par le puits des préférences). Une
 *   relecture de la liste ne dit rien de la date : l'override la masque
 *   jusqu'à l'accusé.
 * - Un geste neuf sur la même clé remplace celui en file, et seul le DERNIER
 *   geste commencé sur une clé peut y entrer (`beginRowGesture`) : ni le
 *   rejeu d'un geste plus ancien, ni sa panne arrivée en retard ne défont
 *   jamais le plus récent.
 * - La file est celle d'UN compte (`meeshy.row-gestures.u_<id>`) : jamais
 *   lue sous un autre, et vidée à la déconnexion (`purgeAccountLocalData`).
 */
export type RowGesture =
  | { readonly kind: 'flag'; readonly conversationId: string; readonly field: 'isPinned' | 'isMuted' | 'isArchived'; readonly value: boolean }
  | { readonly kind: 'read'; readonly conversationId: string; readonly read: boolean }
  | { readonly kind: 'preference'; readonly conversationId: string; readonly field: PreferenceKey; readonly value: string | null };

export type RowGestureQueue = OfflineQueue<RowGesture>;

export type RowGestureDeps = ConversationsDeps & {
  readonly store: StoreApi<ConversationStoreState>;
  readonly queryClient: QueryClient;
  readonly gestures: RowGestureQueue;
};

const FLAG_FIELDS = ['isPinned', 'isMuted', 'isArchived'] as const;
const PREFERENCE_FIELDS = ['reaction', 'categoryId', 'customName'] as const satisfies readonly PreferenceKey[];

export const overrideKeyOf = (gesture: RowGesture): OverrideKey => (gesture.kind === 'read' ? 'unreadCount' : gesture.field);

export const rowGestureKey = (gesture: RowGesture): string => `${gesture.conversationId}:${overrideKeyOf(gesture)}`;

export const rowGestureKeyOf = (conversationId: string, key: OverrideKey): string => `${conversationId}:${key}`;

export const rowGesturesStorageKey = (userId: string): string => `meeshy.row-gestures.u_${userId}`;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);

/** Le stockage est une FRONTIÈRE DE CONFIANCE : une entrée qui n'a pas exactement la forme d'un geste est écartée. */
export function parseRowGesture(raw: unknown): RowGesture | null {
  if (!isRecord(raw) || typeof raw.conversationId !== 'string' || raw.conversationId === '') return null;
  const { conversationId } = raw;
  if (raw.kind === 'flag' && oneOf(FLAG_FIELDS, raw.field) && typeof raw.value === 'boolean') return { kind: 'flag', conversationId, field: raw.field, value: raw.value };
  if (raw.kind === 'read' && typeof raw.read === 'boolean') return { kind: 'read', conversationId, read: raw.read };
  if (raw.kind === 'preference' && oneOf(PREFERENCE_FIELDS, raw.field) && (raw.value === null || typeof raw.value === 'string')) {
    return { kind: 'preference', conversationId, field: raw.field, value: raw.value };
  }
  return null;
}

export function rowGestureQueueFor(storage: SafeStorage, userId: string): RowGestureQueue {
  return createOfflineQueue<RowGesture>({ storage, key: rowGesturesStorageKey(userId), parse: parseRowGesture });
}

/** Le DERNIER geste commencé sur chaque clé, par file. */
const latestGestures = new WeakMap<RowGestureQueue, Map<string, RowGesture>>();

const latestOf = (queue: RowGestureQueue): Map<string, RowGesture> => {
  const latest = latestGestures.get(queue) ?? new Map<string, RowGesture>();
  latestGestures.set(queue, latest);
  return latest;
};

/**
 * Un geste NEUF sur sa clé : il retire de la file celui qu'il remplace et rend
 * de quoi l'y mettre s'il tombe en panne — à condition qu'aucun geste plus
 * récent n'ait été commencé sur la même clé entre-temps : deux pannes arrivées
 * dans le désordre ne réinstallent jamais l'intention la plus ancienne.
 */
export function beginRowGesture(queue: RowGestureQueue | null | undefined, gesture: RowGesture): () => void {
  if (queue == null) return () => undefined;
  const key = rowGestureKey(gesture);
  const latest = latestOf(queue);
  latest.set(key, gesture);
  queue.remove(key);
  return () => {
    if (latest.get(key) === gesture) queue.enqueue(key, gesture);
  };
}

function applyOverride(state: ConversationStoreState, gesture: RowGesture): void {
  if (gesture.kind === 'read') {
    if (gesture.read) state.markRead(gesture.conversationId);
    else state.markUnread(gesture.conversationId);
    return;
  }
  if (gesture.kind === 'preference') {
    state.setPreference(gesture.conversationId, { [gesture.field]: gesture.value });
    return;
  }
  if (gesture.field === 'isPinned') state.togglePin(gesture.conversationId, !gesture.value);
  if (gesture.field === 'isMuted') state.toggleMute(gesture.conversationId, !gesture.value);
  if (gesture.field === 'isArchived') state.toggleArchive(gesture.conversationId, !gesture.value);
}

/** Au démarrage, ce que la file tient se revoit : l'override de chaque geste en attente. */
export function restoreRowGestureOverrides(store: StoreApi<ConversationStoreState>, queue: RowGestureQueue): void {
  queue.pending().forEach((gesture) => applyOverride(store.getState(), gesture));
}

/** Une valeur servie en temps réel pour ces clés est plus récente que les gestes en file : ils partent, leurs overrides aussi. */
export function supersedeRowGestures(params: {
  readonly queue: RowGestureQueue;
  readonly store: StoreApi<ConversationStoreState>;
  readonly conversationId: string;
  readonly keys: readonly OverrideKey[];
}): void {
  const { queue, store, conversationId, keys } = params;
  const queued = new Set(queue.pending().filter((gesture) => gesture.conversationId === conversationId).map(overrideKeyOf));
  const superseded = keys.filter((key) => queued.has(key));
  if (superseded.length === 0) return;
  superseded.forEach((key) => queue.remove(rowGestureKeyOf(conversationId, key)));
  store.getState().clearOverride(conversationId, superseded);
}

function successDataOf(result: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(result) || result.ok !== true || !isRecord(result.data)) return undefined;
  return result.data;
}

function preferenceEntryOf(conversation: Conversation): Readonly<Record<string, unknown>> {
  const raw = conversation.userPreferences;
  const entry = Array.isArray(raw) ? raw[0] : undefined;
  return isRecord(entry) ? entry : {};
}

/** La valeur CONFIRMÉE d'une préférence, sur la ligne de liste ET la fiche du fil. */
export function confirmPreferences(queryClient: QueryClient, conversationId: string, confirmed: Readonly<Record<string, unknown>>): void {
  const apply = (c: Conversation): Conversation => ({ ...c, userPreferences: [{ ...preferenceEntryOf(c), ...confirmed }] });
  patchConversation(queryClient, conversationId, apply);
  patchConversationDetail(queryClient, conversationId, apply);
}

/**
 * « Lu » confirmé (#7351) — `POST …/receipts { type: 'read' }` lit TOUT jusqu'au
 * dernier message que la rangée montrait : le compte tombe à 0 ET le curseur
 * avance sur ce message (`caughtUpConversation`).
 */
export function readThroughLastMessage(row: Conversation): (conversation: Conversation) => Conversation {
  const last = row.lastMessage;
  if (last === undefined) return (conversation) => ({ ...conversation, unreadCount: 0 });
  const cursor = { messageId: last.id, messageCreatedAt: toDate(last.createdAt), readAt: new Date() };
  return (conversation) => caughtUpConversation(conversation, cursor);
}

export function confirmRead(queryClient: QueryClient, conversationId: string, row: Conversation): void {
  const readThrough = readThroughLastMessage(row);
  patchConversation(queryClient, conversationId, readThrough);
  patchConversationDetail(queryClient, conversationId, readThrough);
}

export function confirmUnread(queryClient: QueryClient, conversationId: string): void {
  patchConversation(queryClient, conversationId, (c) => ({ ...c, unreadCount: Math.max(1, c.unreadCount ?? 0) }));
}

const requestOf = (gesture: RowGesture, transport: ConversationsDeps['transport']): Promise<unknown> => {
  if (gesture.kind === 'read') return gesture.read ? pushRead(transport, gesture.conversationId) : pushUnread(transport, gesture.conversationId);
  return pushConversationFlags(transport, gesture.conversationId, { [gesture.field]: gesture.value });
};

function confirm(gesture: RowGesture, result: unknown, queryClient: QueryClient): void {
  if (gesture.kind !== 'read') {
    confirmPreferences(queryClient, gesture.conversationId, { [gesture.field]: gesture.value, ...successDataOf(result) });
    return;
  }
  if (!gesture.read) {
    confirmUnread(queryClient, gesture.conversationId);
    return;
  }
  const row = findCachedConversation(queryClient, gesture.conversationId) ?? queryClient.getQueryData<Conversation>(conversationQueryKey(gesture.conversationId));
  if (row !== undefined) confirmRead(queryClient, gesture.conversationId, row);
}

/**
 * Rejoue la file en FIFO : un accusé confirme et retire l'override, un refus le
 * retire, une panne arrête le rejeu. Un geste neuf commencé sur la même clé
 * pendant l'envoi prend la main : l'issue du rejeu ne touche plus à rien.
 */
export async function replayRowGestures(deps: RowGestureDeps): Promise<void> {
  if (deps.source !== 'gateway') return;
  const latest = latestOf(deps.gestures);
  await deps.gestures.flush(async (gesture) => {
    const key = rowGestureKey(gesture);
    latest.set(key, gesture);
    let result: unknown;
    try {
      result = await requestOf(gesture, deps.transport);
    } catch {
      return false;
    }
    const outcome = outcomeOf(result);
    if (outcome === 'transient') return false;
    if (latest.get(key) !== gesture) return true;
    if (outcome === 'success') confirm(gesture, result, deps.queryClient);
    deps.store.getState().clearOverride(gesture.conversationId, [overrideKeyOf(gesture)]);
    return true;
  });
}
