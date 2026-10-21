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
 * et tout de suite si le socket est déjà là au branchement. La page qui
 * redevient visible avec un socket coupé relance aussi la connexion (#8839),
 * et celle qui sort d'un long sommeil la rouvre (#10573).
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

/**
 * L'ONGLET ENDORMI (#10573) — un navigateur gèle les minuteurs d'un onglet
 * caché : au réveil, `socket.connected` dit encore vrai pendant que la
 * connexion est morte, jusqu'à ce que le battement le découvre (~45 s), et ce
 * qui est parti pendant le sommeil ne parvient jamais. Passé ce seuil, la
 * connexion est rouverte — son `authenticated` rejoue le rattrapage de
 * `socket.ts` — et `onWake` relit ce qui ne peut pas attendre la poignée de
 * main. Une absence plus brève (changer d'onglet un instant) ne coûte rien.
 */
export const WAKE_AFTER_HIDDEN_MS = 10_000;

export function bindAppStatePresence(params: {
  readonly socket: SocketClient;
  readonly visibility: VisibilitySource;
  readonly now?: () => number;
  readonly onWake?: () => void;
}): () => void {
  const { socket, visibility } = params;
  const now = params.now ?? Date.now;
  let authenticated = socket.connected;
  let sent: boolean | null = null;
  let hiddenAt: number | null = visibility.visibilityState() === 'hidden' ? now() : null;

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
  /* LE RETOUR AU PREMIER PLAN REBRANCHE (#8839) — miroir `scenePhase == .active`
     iOS (`MeeshyApp.swift`) : la coque Android perd son socket en arrière-plan,
     et le backoff pouvait tenir le direct coupé 16 s après le retour. */
  const onVisibility = (): void => {
    if (visibility.visibilityState() === 'hidden') {
      hiddenAt ??= now();
    } else {
      const slept = hiddenAt !== null && now() - hiddenAt >= WAKE_AFTER_HIDDEN_MS;
      hiddenAt = null;
      if (slept && socket.connected) {
        socket.disconnect();
        socket.connect();
      } else if (!socket.connected) {
        socket.connect();
      }
      if (slept) params.onWake?.();
    }
    send(false);
  };
  const unwatch = visibility.onChange(onVisibility);
  send(true);

  return () => {
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    socket.off('disconnect', onDisconnect);
    unwatch();
  };
}
