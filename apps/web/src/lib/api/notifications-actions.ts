import type { QueryClient } from '@tanstack/react-query';

import type { NotificationRecord } from '@/lib/notifications/record';

import {
  adjustNotificationCounts,
  findNotification,
  markNotificationsRead,
  removeNotifications,
  restoreNotificationUnread,
  restoreNotifications,
  snapshotNotifications,
  unreadNotificationIds,
} from './notifications-cache';
import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  NOTIFICATIONS_QUERY_KEY,
  postAllNotificationsRead,
  postNotificationRead,
  postNotificationsReadByTypes,
  removeNotification,
  type NotificationCounts,
  type NotificationsDeps,
} from './notifications';
import { beginPendingRead, settlePendingRead } from './notifications-pending-reads';

/**
 * **LES GESTES DE LA CLOCHE, OPTIMISTES** (#6288) — CLAUDE.md § Optimistic
 * Updates : instantané → application locale → réseau → retour arrière sur
 * échec. La pastille du bouton flottant lit le MÊME compte que ces gestes
 * écrivent : elle baisse au tap, pas au retour de la passerelle.
 *
 * Les gestes de MASSE (tout lire, lire un type, supprimer) restaurent l'INSTANTANÉ plutôt que de rejouer l'inverse
 * du geste ; un événement socket arrivé entre le geste et l'échec serait perdu par la restauration, et
 * `notification:counts` comme la prochaine lecture le recalent. La lecture d'UNE ligne, geste ou lecture à
 * l'arrivée, n'annule que ce qu'elle a fait (`readNotification`) : c'est elle qui court avec la suite du fil.
 *
 * Chaque geste rend `true` s'il a abouti : l'écran annonce l'échec, jamais le
 * succès (le changement à l'écran EST l'annonce).
 */

export type NotificationActionDeps = NotificationsDeps & { readonly queryClient: QueryClient };

export async function performMarkNotificationRead(params: { readonly id: string; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const known = findNotification(params.deps.queryClient, params.id);
  if (known?.state.isRead === true) return true;
  return readNotification({ ...params, unread: known });
}

/**
 * **LA LECTURE À L'ARRIVÉE N'EST PAS UN GESTE** (#18907) — une notification arrivée sur le fil ouvert se marque lue
 * sans que personne ne l'ait demandé, avec la même loi que le geste. Elle compte comme non lue ce que la PASSERELLE en
 * dit (`state.isRead` de la charge poussée) : c'est ce que ses instantanés de compte comptent.
 */
export async function performReadOnArrival(params: { readonly notification: NotificationRecord; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { notification, deps } = params;
  return readNotification({ id: notification.id, deps, unread: notification.state.isRead ? undefined : notification });
}

/**
 * **UNE LIGNE LUE, DE L'ÉCRAN À LA PASSERELLE** (#6288, #18907, revue du 2026-11-17) — sans instantané global : son
 * retour arrière effaçait ce qui était arrivé pendant la requête et ressuscitait ce qui avait été supprimé. La ligne
 * passe lue, la pastille baisse d'une unité si elle comptait la ligne (`unread`), et la lecture s'inscrit au registre
 * des lectures en attente, que chaque compte serveur déduit tant qu'elle n'est pas confirmée. À la réponse :
 * - succès : rien à faire, la passerelle annonce `read` et son compte ;
 * - 404 : la passerelle n'a plus la ligne (supprimée pour tous, réaction retirée) — elle quitte la cloche au lieu de
 *   revenir non lue, et le compte se relit chez elle ;
 * - autre échec : seule une lecture ENCORE en attente se défait — sa ligne redevient non lue, la pastille la recompte.
 *   Une ligne que la passerelle a lue, supprimée ou réécrite entre-temps ne revient pas.
 */
async function readNotification(params: {
  readonly id: string;
  readonly deps: NotificationActionDeps;
  readonly unread: NotificationRecord | undefined;
}): Promise<boolean> {
  const { id, deps, unread } = params;
  const { queryClient } = deps;
  markNotificationsRead(queryClient, (n) => n.id === id);
  const token = unread === undefined ? null : beginPendingRead(queryClient, unread);
  if (token !== null) adjustNotificationCounts(queryClient, { unread: -1 });

  const result = await postNotificationRead(deps, id);
  const stillPending = token === null ? null : settlePendingRead(queryClient, id, token);
  if (result.ok) return true;
  if (result.status === 404) {
    removeNotifications(queryClient, (n) => n.id === id);
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_QUERY_KEY });
    return false;
  }
  if (stillPending === null) return false;
  restoreNotificationUnread(queryClient, stillPending);
  adjustNotificationCounts(queryClient, { unread: 1 });
  return false;
}

/**
 * Les lignes non lues d'UN type (#10175) : le carnet ouvert éteint « moments à immortaliser » sans toucher au reste
 * de la cloche. La passerelle, pas le cache, sait quelles lignes éteindre : le push ne part que pour un compte HORS
 * LIGNE, le tap ouvre le carnet à froid et la ligne, créée app fermée, n'est dans aucune liste en cache. D'où UNE
 * requête `read-by-types`, qui couvre aussi les lignes jamais chargées et annonce `notification:read-bulk` aux
 * autres appareils. Le cache bouge d'abord (lignes connues, compte), le compte est relu à la confirmation.
 *
 * Seule une cloche qui SAIT n'avoir aucune non-lue dispense de la requête : un compte inconnu n'est pas un zéro.
 */
export async function performMarkNotificationsOfTypeRead(params: { readonly type: string; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { type, deps } = params;
  const matches = (n: { readonly type: string }) => n.type === type;
  const cached = unreadNotificationIds(deps.queryClient, matches);
  const counts = deps.queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY);
  if (cached.length === 0 && counts?.unread === 0) return true;

  const snapshot = snapshotNotifications(deps.queryClient);
  markNotificationsRead(deps.queryClient, matches);
  adjustNotificationCounts(deps.queryClient, { unread: -cached.length });

  const result = await postNotificationsReadByTypes(deps, [type]);
  if (!result.ok) {
    restoreNotifications(deps.queryClient, snapshot);
    return false;
  }
  void deps.queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_QUERY_KEY });
  return true;
}

/**
 * Tant que l'écran est ouvert (#10175) : une non-lue arrivée pendant qu'il est à l'écran — la fenêtre visible, le
 * service worker se tait — s'éteint aussi. Une ARRIVÉE est le compte de CE type (`byType`) qui MONTE ou une ligne de ce
 * type jamais vue — jamais le compte global : un message ou une réaction, carnet ouvert, ne relance rien, et aucun
 * retour arrière ne vient effacer ce qui est arrivé entre-temps. `byType` compte les lignes lues comme non lues : ni la
 * confirmation ni le retour arrière d'un refus ne le font monter. Rend l'arrêt, à appeler quand l'écran se ferme.
 */
export function followNotificationsOfTypeRead(params: { readonly type: string; readonly deps: NotificationActionDeps }): () => void {
  const { type, deps } = params;
  const ofTypeNow = (): number | undefined => {
    const counts = deps.queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY);
    return counts === undefined ? undefined : (counts.byType[type] ?? 0);
  };
  const pendingOfType = () => unreadNotificationIds(deps.queryClient, (n) => n.type === type);
  const state = { stopped: false, running: false, missed: false, observed: ofTypeNow(), handled: new Set<string>() };

  const arrived = (): boolean => {
    const now = ofTypeNow();
    const rose = now !== undefined && state.observed !== undefined && now > state.observed;
    state.observed = now;
    return rose || pendingOfType().some((id) => !state.handled.has(id));
  };

  const run = async (): Promise<void> => {
    state.running = true;
    state.missed = false;
    state.handled = new Set([...state.handled, ...pendingOfType()]);
    const ok = await performMarkNotificationsOfTypeRead({ type, deps });
    state.running = false;
    state.observed = ofTypeNow();
    if (!state.stopped && ok && state.missed) await run();
  };
  const start = (): void =>
    void run().catch(() => {
      state.running = false;
    });

  const unsubscribe = deps.queryClient.getQueryCache().subscribe((event) => {
    if (state.stopped || event.query.queryKey[0] !== NOTIFICATIONS_QUERY_KEY[0]) return;
    if (!arrived()) return;
    if (state.running) state.missed = true;
    else start();
  });
  start();

  return () => {
    state.stopped = true;
    unsubscribe();
  };
}

export async function performMarkAllNotificationsRead(params: { readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { deps } = params;
  const snapshot = snapshotNotifications(deps.queryClient);
  markNotificationsRead(deps.queryClient, () => true);
  deps.queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, (counts) =>
    counts === undefined ? counts : { ...counts, unread: 0 },
  );

  const result = await postAllNotificationsRead(deps);
  if (!result.ok) restoreNotifications(deps.queryClient, snapshot);
  return result.ok;
}

export async function performDeleteNotification(params: { readonly id: string; readonly deps: NotificationActionDeps }): Promise<boolean> {
  const { id, deps } = params;
  const known = findNotification(deps.queryClient, id);
  const snapshot = snapshotNotifications(deps.queryClient);
  removeNotifications(deps.queryClient, (n) => n.id === id);
  if (known !== undefined) {
    adjustNotificationCounts(deps.queryClient, { total: -1, unread: known.state.isRead ? 0 : -1 });
  }

  const result = await removeNotification(deps, id);
  if (!result.ok) restoreNotifications(deps.queryClient, snapshot);
  return result.ok;
}
