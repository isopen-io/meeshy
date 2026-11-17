import { conversationStore } from '@/lib/conversation-store';
import { safeLocalStorage } from '@/lib/storage';

import { apiDeps } from './deps';
import { appQueryClient } from './query-client';
import { replayRowGestures, restoreRowGestureOverrides, rowGestureQueueFor, type RowGestureQueue } from './row-gestures';
import { sessionIdentityKey, sessionStore } from './session';

/**
 * **LA FILE DE REPRISE DU COMPTE TENU** (#18917) — celle de `row-gestures.ts`,
 * liée aux instances de l'application. Une par COMPTE (`meeshy.row-gestures.u_<id>`) :
 * elle n'est jamais lue sous un autre compte, survit à un changement de compte
 * comme la file des envois, et part avec le compte à la déconnexion
 * (`purgeAccountLocalData`). Un invité n'en a pas : sa panne garde l'override,
 * sans rejeu, comme avant.
 *
 * Reprise au premier accès pour un compte — l'ouverture de sa connexion temps
 * réel, réseau ou pas (`realtime.ts`) : les overrides des gestes en attente se
 * revoient, un rechargement hors ligne ne les efface plus. Rejeu au retour du
 * réseau (`online`), à chaque (ré)authentification du temps réel et derrière
 * tout geste qui aboutit (`conversation-actions.ts`).
 *
 * Un geste en vol pendant une bascule de compte ou une déconnexion ne se met
 * jamais en file sous le compte suivant : le transport ne règle pas une réponse
 * obtenue sous une identité quittée (#8674, `http.ts`), et la file tenue est
 * relue depuis le stockage du compte qui arrive.
 */
let held: { readonly userId: string; readonly queue: RowGestureQueue } | null = null;

const accountOf = (): string | null => {
  const session = sessionStore.getState().session;
  return session.status === 'authenticated' ? session.user.id : null;
};

export function appRowGestures(): RowGestureQueue | null {
  const userId = accountOf();
  if (userId === null) return null;
  if (held?.userId !== userId) {
    held = { userId, queue: rowGestureQueueFor(safeLocalStorage(), userId) };
    restoreRowGestureOverrides(conversationStore, held.queue);
  }
  return held.queue;
}

export function replayAppRowGestures(): void {
  const queue = appRowGestures();
  if (queue === null || queue.size() === 0) return;
  void replayRowGestures({ ...apiDeps, store: conversationStore, queryClient: appQueryClient, gestures: queue });
}

/* L'identité change : la file se relit depuis le stockage du compte qui arrive
   — celle d'un compte déconnecté (purgée) ne survit pas en mémoire. */
let identity = sessionIdentityKey(sessionStore.getState().session);
sessionStore.subscribe((state) => {
  const next = sessionIdentityKey(state.session);
  if (next === identity) return;
  identity = next;
  held = null;
});

if (typeof window !== 'undefined') window.addEventListener('online', replayAppRowGestures);
