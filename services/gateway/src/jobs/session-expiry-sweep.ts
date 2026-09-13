import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Une session dont `expiresAt` est dépassé cesse de se déclarer valide.
 *
 * Mesuré le 2026-09-08 : 140 lignes expirées portaient `isValid: true`, dont
 * certaines depuis mars — 41 % des sessions dites valides, sur 34 utilisateurs.
 *
 * Aucun accès n'en découlait : `validateSession` filtre déjà sur `expiresAt`.
 * Le coût était ailleurs — toute lecture qui se fie à `isValid` sans joindre
 * `expiresAt` conclut faux. L'espace admin, les statistiques de sessions
 * actives et le diagnostic de #5703 s'y sont trompés, et la garde de #5712 sur
 * la présence lit précisément cette colonne.
 *
 * Aucun script de migration n'accompagne ce balayage, et il n'en faut pas :
 * l'`updateMany` étant filtré sur l'état à corriger, son PREMIER passage solde
 * le passif hérité exactement comme les suivants font l'entretien courant.
 * (Repris d'une seconde implémentation de #5712, `claude/eager-planck-ngrirs`,
 * à la fusion du 2026-09-13.)
 *
 * `invalidatedReason: 'expired'` distingue cette invalidation AUTOMATIQUE de
 * celles qu'un humain provoque (`user_revoked`, `user_revoked_all`) : sans ce
 * motif, un balayage de fond serait indiscernable d'une révocation volontaire
 * dans l'historique d'un compte.
 */
export async function sweepExpiredSessions(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.userSession.updateMany({
    where: { isValid: true, expiresAt: { lt: new Date() } },
    data: { isValid: false, invalidatedAt: new Date(), invalidatedReason: 'expired' },
  });
  return count;
}
