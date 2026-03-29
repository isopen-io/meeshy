import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
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

export function broadcastPreferenceUpdate(category: PreferenceCategory) {
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
