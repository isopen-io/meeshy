import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * Ce qu'une inbox de notifications a le droit de MONTRER — le prédicat, isolé
 * de ses sept lectures.
 *
 * `Notification.expiresAt` existe depuis l'origine du modèle, et le type
 * partagé le publie jusqu'aux clients (`state.expiresAt`, `isNotificationExpired`).
 * Aucun producteur ne l'écrivait et aucune lecture ne l'honorait : les deux
 * moitiés d'une même règle, mortes chacune de son côté. Une notification de
 * message éphémère survivait donc à son message — une ligne qui ne montre rien
 * (l'extrait d'un message protégé est déjà un libellé générique) et ne mène
 * nulle part (`action: view_message` ouvre un message absent), avec un badge
 * que rien ne peut plus décrémenter puisqu'on ne peut pas lire ce qui n'est
 * plus là.
 *
 * Pourquoi un filtre à la LECTURE et non un balayage : contrairement au rappel,
 * la péremption n'est pas un événement — personne ne passe à l'instant T. Un
 * balayage périodique laisserait toujours une fenêtre entre l'expiration et son
 * passage ; le filtre, lui, est exact à la milliseconde, et il ne coûte aucune
 * écriture. La contrepartie assumée : la LIGNE reste en base (elle ne porte
 * aucune copie du contenu, cf. `protectedPreview`), et un badge déjà affiché
 * ne se corrige qu'au prochain recalcul — cohérence à terme, pas immédiate.
 *
 * Pourquoi une unité partagée : `emitCountsUpdate` porte déjà en commentaire la
 * trace d'une divergence passée entre le prédicat du badge et celui de la liste
 * (`readAt: null` contre `isRead: false`). Sept lectures qui répondent à la même
 * question — la liste REST, son total, le compte non-lus REST, les deux compteurs
 * du socket, le badge embarqué dans le push, et le digest e-mail — doivent la
 * poser une seule fois, sans quoi la cloche et la liste se contredisent à
 * nouveau.
 */
export interface VisibleNotificationsScope {
  /** Absent = toutes inboxes confondues (le balayage du digest). */
  readonly userId?: string;
  readonly unreadOnly?: boolean;
}

export function visibleNotificationsWhere(
  scope: VisibleNotificationsScope
): Prisma.NotificationWhereInput {
  // Pas d'instant injectable : les tests disent l'heure par des faux
  // minuteurs, et un paramètre que seule une signature connaît est un
  // paramètre que personne ne vérifie.
  const now = new Date();

  return {
    ...(scope.userId === undefined ? {} : { userId: scope.userId }),
    ...(scope.unreadOnly ? { isRead: false } : {}),
    // `null` d'abord : c'est le cas de l'écrasante majorité des lignes (toute
    // notification qui ne pointe pas un contenu éphémère), et la seule branche
    // que les données antérieures à ce prédicat peuvent emprunter.
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
