import {
  notificationMatchesReadBulkScope,
  type NotificationReadBulkCandidate,
} from '@meeshy/shared/utils/notification-read-bulk';
import type { NotificationReadBulkScope } from '@meeshy/shared/types/notification';

import type { Notification } from '@/lib/api/notifications';
import { textesDeNotif, type CleDeContexte } from '@/lib/contenu/notifs';

/**
 * L'ÉTAT DE `/notifications` — les réducteurs PURS du module de participation
 * (issue #4898), sans DOM, testés par `__tests__/notifs-etat.test.ts`.
 *
 * LE COMPTEUR A DEUX RÉGIMES, ET UN SEUL MAÎTRE. Ligne à ligne (`arrive`,
 * `lit`), il bouge localement — le lecteur voit l'effet tout de suite. En
 * masse (`litEnMasse`), il ne bouge PAS : le prédicat rejoué sur un cache
 * PARTIEL matche moins de lignes que le serveur n'en a marquées, et tout
 * décrément déduit ferait dériver le badge (doc-comment de
 * `notificationMatchesReadBulkScope`, `@meeshy/shared`).
 * `notification:counts`, émis juste après chaque mutation par la passerelle
 * (`NotificationService.emitCountsUpdate`), recale par `compte()`.
 */

export type LigneDeNotif = {
  readonly id: string;
  readonly genre: string;
  readonly primaire: string;
  readonly secondaire: string | null;
  readonly lue: boolean;
  readonly creeeA: string | null;
  readonly contexte: Readonly<Partial<Record<CleDeContexte, string>>>;
};

export type EtatDesNotifs = {
  readonly lignes: readonly LigneDeNotif[];
  readonly nonLues: number;
};

/**
 * UNE LIGNE DEPUIS UNE NOTIFICATION PROJETÉE — la composition des textes est
 * celle de la vue (`textesDeNotif`, site unique) : la ligne reçue par socket et
 * la ligne servie par le document disent la même phrase.
 */
export const ligneDeNotification = (n: Notification): LigneDeNotif => ({
  id: n.id,
  genre: n.genre,
  ...textesDeNotif(n),
  lue: n.lue,
  creeeA: n.creeeA,
  contexte: n.contexte,
});

export const arrive = (etat: EtatDesNotifs, ligne: LigneDeNotif): EtatDesNotifs => {
  if (etat.lignes.some((existante) => existante.id === ligne.id)) return etat;
  return {
    lignes: [ligne, ...etat.lignes],
    nonLues: ligne.lue ? etat.nonLues : etat.nonLues + 1,
  };
};

export const lit = (etat: EtatDesNotifs, id: string): EtatDesNotifs => {
  const ligne = etat.lignes.find((existante) => existante.id === id);
  if (ligne === undefined || ligne.lue) return etat;
  return {
    lignes: etat.lignes.map((existante) => (existante.id === id ? { ...existante, lue: true } : existante)),
    nonLues: Math.max(0, etat.nonLues - 1),
  };
};

const candidate = (ligne: LigneDeNotif): NotificationReadBulkCandidate => ({
  type: ligne.genre,
  context: ligne.contexte,
});

export const litEnMasse = (etat: EtatDesNotifs, scope: NotificationReadBulkScope): EtatDesNotifs => ({
  lignes: etat.lignes.map((ligne) =>
    !ligne.lue && notificationMatchesReadBulkScope(scope, candidate(ligne)) ? { ...ligne, lue: true } : ligne,
  ),
  nonLues: etat.nonLues,
});

export const compte = (etat: EtatDesNotifs, nonLues: number): EtatDesNotifs => ({ ...etat, nonLues });

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

/** La charge de `notification:counts` (`{ unread, total }`, `emitCountsUpdate`) — seul `unread` a un lecteur ici. */
export const chargeDeComptes = (charge: unknown): number | null => {
  const unread = objet(charge)?.unread;
  return typeof unread === 'number' && Number.isFinite(unread) && unread >= 0 ? unread : null;
};

/** La charge de `notification:read` (`{ notificationId }`, `markAsRead`). */
export const chargeDeLue = (charge: unknown): string | null => {
  const id = objet(charge)?.notificationId;
  return typeof id === 'string' && id !== '' ? id : null;
};

/**
 * La charge de `notification:read-bulk` (`{ scope }`, `announceReadBulk`). Le
 * KIND n'est pas filtré ici : un kind inconnu traverse, et c'est le prédicat
 * partagé qui rend son repli sûr (ne rien marquer) — filtrer en amont
 * réécrirait sa liste de cas, la jumelle exacte qu'il existe pour interdire.
 */
export const chargeDeLueEnMasse = (charge: unknown): NotificationReadBulkScope | null => {
  const scope = objet(objet(charge)?.scope);
  return scope !== null && typeof scope.kind === 'string' ? (scope as unknown as NotificationReadBulkScope) : null;
};
