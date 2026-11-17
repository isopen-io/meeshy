import type { QueryClient } from '@tanstack/react-query';

import type { NotificationRecord } from '@/lib/notifications/record';

import type { NotificationCounts } from './notifications';

/**
 * **LES LECTURES LOCALES QUE LA PASSERELLE N'A PAS ENCORE CONFIRMÉES** (#18907, revue du 2026-11-17).
 *
 * La passerelle émet `notification:counts` après chaque `new`, `read` et `deleted`, et son compte REMPLACE celui de
 * l'écran. Une lecture faite ici — le geste de la cloche, ou la lecture à l'arrivée sur le fil ouvert — a déjà baissé
 * la pastille ; mais tant que son POST n'est pas traité, chaque instantané serveur compte encore la ligne non lue.
 * L'écrire tel quel remontait la pastille pendant la requête, et le retour arrière d'un échec l'ajoutait une seconde
 * fois par-dessus.
 *
 * Le registre tient ces lectures, par client de requêtes, avec la ligne non lue telle qu'elle était. Il les SOLDE dès
 * que la passerelle a parlé de la ligne (`notification:read`, `read-bulk`, `deleted`) ou que le POST a répondu. Deux
 * lois en découlent, et ce sont les seules :
 *  - tout instantané serveur, poussé ou relu, s'écrit déduction faite des lectures en attente (`withoutPendingReads`) ;
 *  - seul l'échec d'une lecture ENCORE en attente se défait : une ligne que la passerelle a lue, supprimée ou réécrite
 *    entre-temps ne revient jamais non lue.
 *
 * Chaque lecture porte son propre jeton : une notification réécrite (même id) lue une seconde fois pendant le POST de
 * la première ne se fait pas solder par la réponse de celle-ci.
 */
type PendingRead = { readonly row: NotificationRecord; readonly token: symbol };

const registries = new WeakMap<QueryClient, Map<string, PendingRead>>();

const registryOf = (queryClient: QueryClient): Map<string, PendingRead> => {
  const existing = registries.get(queryClient);
  if (existing !== undefined) return existing;
  const created = new Map<string, PendingRead>();
  registries.set(queryClient, created);
  return created;
};

/** Une lecture locale part : rend le jeton qui seul pourra la solder à la réponse du POST. */
export function beginPendingRead(queryClient: QueryClient, row: NotificationRecord): symbol {
  const token = Symbol(row.id);
  registryOf(queryClient).set(row.id, { row, token });
  return token;
}

/** Le POST de cette lecture a répondu : rend la ligne non lue si rien ne l'avait confirmée entre-temps, sinon `null`. */
export function settlePendingRead(queryClient: QueryClient, id: string, token: symbol): NotificationRecord | null {
  const registry = registries.get(queryClient);
  const pending = registry?.get(id);
  if (registry === undefined || pending === undefined || pending.token !== token) return null;
  registry.delete(id);
  return pending.row;
}

/** La passerelle a parlé de ces lignes — lues ou supprimées : leur lecture n'a plus rien à défaire ni à déduire. */
export function confirmPendingReads(queryClient: QueryClient, matches: (row: NotificationRecord) => boolean): void {
  const registry = registries.get(queryClient);
  if (registry === undefined) return;
  for (const [id, pending] of registry) {
    if (matches(pending.row)) registry.delete(id);
  }
}

export function withoutPendingReads(queryClient: QueryClient, counts: NotificationCounts): NotificationCounts {
  const pending = registries.get(queryClient)?.size ?? 0;
  return pending === 0 ? counts : { ...counts, unread: Math.max(0, counts.unread - pending) };
}
