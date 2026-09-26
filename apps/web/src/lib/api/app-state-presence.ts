import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

/**
 * **L'ONGLET DIT S'IL EST AU PREMIER PLAN** (lot 3 des appels, complément du
 * lot 0, B8) — `presence:app-state { foreground }`, le signal qu'iOS émet à
 * chaque `scenePhase` (`CallEventsHandler.ts` : la passerelle le range dans
 * `socket.data.appForeground` et choisit entre la sonnerie socket et la
 * poussée). Sans lui, un onglet caché passait pour joignable et l'appel ne
 * partait jamais en poussée.
 *
 * Le signal part À L'AUTHENTIFICATION (la passerelle ignore tout ce qui
 * précède : `getUserId(socket.id)` est vide), à chaque changement de
 * visibilité RÉEL — jamais deux fois le même état sur une même connexion —,
 * et tout de suite si le socket est déjà là au branchement.
 */

export type VisibilitySource = {
  readonly visibilityState: () => 'visible' | 'hidden';
  readonly onChange: (handler: () => void) => () => void;
};

export function documentVisibility(doc: Document): VisibilitySource {
  return {
    visibilityState: () => (doc.visibilityState === 'hidden' ? 'hidden' : 'visible'),
    onChange: (handler) => {
      doc.addEventListener('visibilitychange', handler);
      return () => doc.removeEventListener('visibilitychange', handler);
    },
  };
}

export function bindAppStatePresence(params: { readonly socket: SocketClient; readonly visibility: VisibilitySource }): () => void {
  const { socket, visibility } = params;
  let authenticated = socket.connected;
  let sent: boolean | null = null;

  const send = (force: boolean): void => {
    if (!authenticated) return;
    const foreground = visibility.visibilityState() === 'visible';
    if (!force && sent === foreground) return;
    sent = foreground;
    socket.emit(CLIENT_EVENTS.PRESENCE_APP_STATE, { foreground });
  };
  const onAuthenticated = (): void => {
    authenticated = true;
    send(true);
  };
  const onDisconnect = (): void => {
    authenticated = false;
    sent = null;
  };

  socket.on(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on('disconnect', onDisconnect);
  const unwatch = visibility.onChange(() => send(false));
  send(true);

  return () => {
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    socket.off('disconnect', onDisconnect);
    unwatch();
  };
}
