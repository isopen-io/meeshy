import type { SocketClient } from '@/lib/net/socket';

export type VisibilitySource = {
  readonly visibilityState: () => 'visible' | 'hidden';
  readonly onChange: (handler: () => void) => () => void;
};

export function bindAppStatePresence(_params: { readonly socket: SocketClient; readonly visibility: VisibilitySource }): () => void {
  return () => undefined;
}
