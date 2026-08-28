import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { refreshMirroredPreferenceCategory } from '@/lib/preferences/mirrored-preference-categories';
import type { PreferenceCategory } from '@/types/preferences';

type SyncMessage =
  | { type: 'preferences-updated'; category: PreferenceCategory }
  | { type: 'user-updated' };

const CHANNEL_NAME = 'meeshy-settings-sync';

let channel: BroadcastChannel | null = null;
let queryClientRef: QueryClient | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;

  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      handleSyncMessage(event.data);
    };
  }

  return channel;
}

function handleSyncMessage(message: SyncMessage) {
  if (!queryClientRef) return;

  switch (message.type) {
    case 'preferences-updated':
      queryClientRef.invalidateQueries({
        queryKey: queryKeys.preferences.category(message.category),
      });
      refreshMirroredPreferenceCategory(message.category);
      break;
    case 'user-updated':
      queryClientRef.invalidateQueries({
        queryKey: queryKeys.users.current(),
      });
      break;
  }
}

export function initSettingsSync(queryClient: QueryClient) {
  queryClientRef = queryClient;
  getChannel();
}

/**
 * Annonce une écriture de l'onglet COURANT.
 *
 * `BroadcastChannel` ne délivre jamais à l'émetteur, et le cache React Query de
 * la catégorie vient d'être posé par la mutation : ce qui reste à faire ici est
 * la relecture du double Zustand que les bulles rendent — sinon l'onglet qui a
 * fait le geste est le SEUL à ne pas le voir sur ses surfaces de messagerie.
 *
 * Elle est due canal ou pas : un navigateur sans `BroadcastChannel` doit voir
 * son propre changement comme les autres.
 */
export function broadcastPreferenceUpdate(category: PreferenceCategory) {
  refreshMirroredPreferenceCategory(category);

  getChannel()?.postMessage({
    type: 'preferences-updated',
    category,
  } satisfies SyncMessage);
}

export function broadcastUserUpdate() {
  getChannel()?.postMessage({
    type: 'user-updated',
  } satisfies SyncMessage);
}

export function destroySettingsSync() {
  channel?.close();
  channel = null;
  queryClientRef = null;
}
