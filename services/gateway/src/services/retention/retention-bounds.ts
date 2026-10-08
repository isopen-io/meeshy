import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * LES BORNES DE CONSERVATION, une seule fois (#9614, #9642) — la PURGE les
 * applique (`jobs/retention-sweep.ts`), et les LECTEURS aussi : une session
 * close depuis plus de 90 jours, un événement de plus de 12 mois, une adresse
 * de connexion de plus de 12 mois ne sont plus servis, que la purge soit armée
 * ou non (revue « privacy-retention-bypass »). Une donnée gardée pour une
 * procédure (#9650) reste en base mais ne se sert plus par l'interface.
 */

export const RETENTION = {
  closedSessionDays: 90,
  securityEventMonths: 12,
  purgedAccountSecurityEventDays: 90,
  /**
   * 15 mois : le journal de l'administration survit à TOUTE donnée qu'il
   * décrit (12 mois au plus, + 90 jours). À confirmer par le porteur (#9650).
   */
  adminAuditLogMonths: 15,
  connectionTraceMonths: 12,
} as const;

export const daysBefore = (now: Date, days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

export const monthsBefore = (now: Date, months: number): Date => {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
};

/**
 * UN CHAMP ABSENT N'EST PAS `null`, ET UNE NÉGATION ÉCARTE LE DOCUMENT QUI N'A
 * PAS LA CLÉ (sémantique mesurée contre mongo:8, #8309 ; double
 * `__tests__/helpers/mongo-where.ts`). Une session vivante n'a jamais de clé
 * `invalidatedAt` : toute borne s'écrit donc en branches POSITIVES, jamais en
 * `NOT` — un `NOT` de la purge masquait toutes les sessions vivantes.
 */
const CLOSED_WITHOUT_DATE: Prisma.UserSessionWhereInput = { OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }] };

/**
 * Les sessions dont la conservation est ÉCHUE :
 *  - closes depuis plus de 90 jours ;
 *  - closes sans date de clôture, inactives depuis plus de 90 jours ;
 *  - échues depuis plus de 90 jours ET inactives depuis plus de 90 jours —
 *    l'échéance seule ne suffit pas : `/auth/refresh` et la garde REST ne
 *    lisent pas `expiresAt`, une session échue mais rafraîchie est VIVANTE
 *    (audit A2-2, #9656).
 */
export function expiredSessionRetentionWhere(now: Date): Prisma.UserSessionWhereInput {
  const cutoff = daysBefore(now, RETENTION.closedSessionDays);
  return {
    OR: [
      { isValid: false, invalidatedAt: { lt: cutoff } },
      { isValid: false, AND: [CLOSED_WITHOUT_DATE, { lastActivityAt: { lt: cutoff } }] },
      { expiresAt: { lt: cutoff }, lastActivityAt: { lt: cutoff } },
    ],
  };
}

/**
 * Ce qu'un lecteur de sessions peut encore servir : le COMPLÉMENT exact de la
 * purge, écrit en branches positives (un témoin le vérifie ligne à ligne).
 */
export function retainedSessionWhere(now: Date): Prisma.UserSessionWhereInput {
  const cutoff = daysBefore(now, RETENTION.closedSessionDays);
  return {
    AND: [
      // ni close il y a plus de 90 jours…
      { OR: [{ isValid: true }, { invalidatedAt: { gte: cutoff } }, CLOSED_WITHOUT_DATE] },
      // …ni close sans date et inactive depuis plus de 90 jours…
      { OR: [{ isValid: true }, { invalidatedAt: { not: null } }, { lastActivityAt: { gte: cutoff } }] },
      // …ni échue et inactive depuis plus de 90 jours.
      { OR: [{ expiresAt: { gte: cutoff } }, { lastActivityAt: { gte: cutoff } }] },
    ],
  };
}

/** Ce qu'un lecteur d'événements de sécurité peut encore servir. */
export function retainedSecurityEventWhere(now: Date): Prisma.SecurityEventWhereInput {
  return { createdAt: { gte: monthsBefore(now, RETENTION.securityEventMonths) } };
}

type ConnectionTraces = {
  readonly createdAt?: Date | null;
  readonly lastLoginAt?: Date | null;
  readonly registrationIp?: string | null;
  readonly registrationLocation?: string | null;
  readonly registrationDevice?: string | null;
  readonly lastLoginIp?: string | null;
  readonly lastLoginLocation?: string | null;
  readonly lastLoginDevice?: string | null;
};

const olderThan = (date: Date | null | undefined, cutoff: Date): boolean =>
  date instanceof Date && date.getTime() < cutoff.getTime();

/**
 * Les adresses, lieux et agents d'inscription et de dernière connexion, masqués
 * au-delà de 12 mois — la même borne que la purge. Une dernière connexion sans
 * date (`lastLoginAt` absent, compte antérieur au champ) reste servie : rien ne
 * dit qu'elle a dépassé la borne, et la purge la traite par sa propre règle.
 */
export function withoutExpiredConnectionTraces<T extends ConnectionTraces>(user: T, now: Date): T {
  const cutoff = monthsBefore(now, RETENTION.connectionTraceMonths);
  const registration = 'createdAt' in user && olderThan(user.createdAt, cutoff)
    ? { registrationIp: null, registrationLocation: null, registrationDevice: null }
    : {};
  const lastLogin = olderThan(user.lastLoginAt, cutoff)
    ? { lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null }
    : {};
  const masked = { ...registration, ...lastLogin };
  const present = Object.fromEntries(Object.entries(masked).filter(([key]) => key in user));
  return { ...user, ...present };
}
