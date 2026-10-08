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

/** Une session close avant que `invalidatedAt` ne soit écrit : sa date de fin est sa dernière activité. */
const CLOSED_WITHOUT_DATE = { OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }] };

/**
 * Les sessions dont la conservation est ÉCHUE : closes depuis plus de 90 jours,
 * ou ÉCHUES depuis plus de 90 jours même si rien n'a jamais écrit leur clôture
 * (`expiresAt` dépassé, `isValid` resté vrai) — une session échue n'est plus
 * utilisable, elle n'est donc jamais une session vivante.
 */
export function expiredSessionRetentionWhere(now: Date) {
  const cutoff = daysBefore(now, RETENTION.closedSessionDays);
  return {
    OR: [
      { isValid: false, invalidatedAt: { lt: cutoff } },
      { isValid: false, AND: [CLOSED_WITHOUT_DATE, { lastActivityAt: { lt: cutoff } }] },
      { expiresAt: { lt: cutoff } },
    ],
  };
}

/** Ce qu'un lecteur de sessions peut encore servir. */
export function retainedSessionWhere(now: Date) {
  return { NOT: [expiredSessionRetentionWhere(now)] };
}

/** Ce qu'un lecteur d'événements de sécurité peut encore servir. */
export function retainedSecurityEventWhere(now: Date) {
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
