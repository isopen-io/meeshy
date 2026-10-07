/**
 * LA CONSERVATION DE CE QU'UNE CONNEXION LAISSE (#9614, #9642).
 *
 * Décision du porteur du 2026-10-08, sur l'analyse `conformite-juridique` (pas
 * un avis juridique signé) :
 *  - une session CLOSE s'efface 90 jours après sa clôture (`invalidatedAt`) ;
 *  - un `SecurityEvent` s'efface après 12 mois ; d'un compte PURGÉ, 90 jours
 *    après la purge (`AccountDeletionRequest.gracePeriodEndsAt`, la date à
 *    laquelle la purge s'exécute) — la plus courte des deux durées l'emporte ;
 *  - une ligne d'`AdminAuditLog` s'efface après 12 mois ;
 *  - `registrationIp` / `registrationLocation` passent à `null` 12 mois après
 *    l'inscription, `lastLoginIp` / `lastLoginLocation` 12 mois après la
 *    dernière connexion (`lastLoginAt`). Un compte antérieur à `lastLoginAt`
 *    perd sa trace quand aucune session ne s'est ouverte depuis 12 mois.
 *
 * L'INTERRUPTEUR. En production, la PREMIÈRE exécution supprime des données
 * anciennes : elle attend le feu vert du porteur et une sauvegarde vérifiée.
 * La purge n'écrit donc que si `RETENTION_PURGE_ENABLED` vaut exactement
 * `true` (posé en staging, absent en production). Désarmée, elle COMPTE ce
 * qu'elle effacerait et l'écrit au journal — le porteur décide sur un chiffre.
 *
 * Chaque étape est indépendante : une étape qui échoue est journalisée, rend
 * `null`, et n'empêche pas les suivantes. Toutes sont idempotentes : filtrées
 * sur l'état à corriger, leur premier passage solde l'arriéré comme les
 * suivants font l'entretien.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'RetentionSweep' });

export const RETENTION = {
  closedSessionDays: 90,
  securityEventMonths: 12,
  purgedAccountSecurityEventDays: 90,
  adminAuditLogMonths: 12,
  connectionTraceMonths: 12,
} as const;

/** Les comptes purgés et anciens comptes traités par passe — la passe suivante reprend. */
const BATCH = 500;

export function retentionPurgeArmed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.RETENTION_PURGE_ENABLED === 'true';
}

export type RetentionReport = {
  readonly applied: boolean;
  readonly closedSessions: number | null;
  readonly securityEvents: number | null;
  readonly purgedAccountSecurityEvents: number | null;
  readonly adminAuditLogs: number | null;
  readonly registrationTraces: number | null;
  readonly loginTraces: number | null;
};

type RetentionStore = Pick<PrismaClient, 'userSession' | 'securityEvent' | 'adminAuditLog' | 'accountDeletionRequest' | 'user'>;

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const monthsBefore = (now: Date, months: number) => {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
};

async function step(name: string, run: () => Promise<number>): Promise<number | null> {
  try {
    return await run();
  } catch (error) {
    logger.error(`retention step failed: ${name}`, error);
    return null;
  }
}

/** Une session close avant que `invalidatedAt` ne soit écrit : sa date de fin est sa dernière activité. */
const CLOSED_WITHOUT_DATE = { OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }] };

export async function sweepRetention(
  prisma: RetentionStore,
  options: { readonly now?: Date; readonly apply: boolean },
): Promise<RetentionReport> {
  const now = options.now ?? new Date();
  const { apply } = options;
  const sessionCutoff = daysBefore(now, RETENTION.closedSessionDays);
  const eventCutoff = monthsBefore(now, RETENTION.securityEventMonths);
  const purgeCutoff = daysBefore(now, RETENTION.purgedAccountSecurityEventDays);
  const auditCutoff = monthsBefore(now, RETENTION.adminAuditLogMonths);
  const traceCutoff = monthsBefore(now, RETENTION.connectionTraceMonths);

  const closedSessionsWhere = {
    isValid: false,
    OR: [
      { invalidatedAt: { lt: sessionCutoff } },
      { AND: [CLOSED_WITHOUT_DATE, { lastActivityAt: { lt: sessionCutoff } }] },
    ],
  };
  const closedSessions = await step('closed sessions', async () =>
    apply
      ? (await prisma.userSession.deleteMany({ where: closedSessionsWhere })).count
      : prisma.userSession.count({ where: closedSessionsWhere }));

  const eventsWhere = { createdAt: { lt: eventCutoff } };
  const securityEvents = await step('security events', async () =>
    apply
      ? (await prisma.securityEvent.deleteMany({ where: eventsWhere })).count
      : prisma.securityEvent.count({ where: eventsWhere }));

  const purgedAccountSecurityEvents = await step('security events of purged accounts', async () => {
    const purged = await prisma.accountDeletionRequest.findMany({
      where: { status: { in: ['GRACE_PERIOD_EXPIRED', 'COMPLETED'] }, gracePeriodEndsAt: { lt: purgeCutoff } },
      select: { userId: true },
      take: BATCH,
    });
    const userIds = [...new Set(purged.map((request) => request.userId))];
    if (userIds.length === 0) return 0;
    const where = { userId: { in: userIds } };
    return apply ? (await prisma.securityEvent.deleteMany({ where })).count : prisma.securityEvent.count({ where });
  });

  const auditWhere = { createdAt: { lt: auditCutoff } };
  const adminAuditLogs = await step('admin audit log', async () =>
    apply
      ? (await prisma.adminAuditLog.deleteMany({ where: auditWhere })).count
      : prisma.adminAuditLog.count({ where: auditWhere }));

  const registrationWhere = {
    createdAt: { lt: traceCutoff },
    OR: [{ registrationIp: { not: null } }, { registrationLocation: { not: null } }],
  };
  const registrationTraces = await step('registration address', async () =>
    apply
      ? (await prisma.user.updateMany({ where: registrationWhere, data: { registrationIp: null, registrationLocation: null } })).count
      : prisma.user.count({ where: registrationWhere }));

  const loginTraceFields = { OR: [{ lastLoginIp: { not: null } }, { lastLoginLocation: { not: null } }] };
  const loginTraces = await step('last login address', async () => {
    const datedWhere = { lastLoginAt: { lt: traceCutoff }, ...loginTraceFields };
    const dated = apply
      ? (await prisma.user.updateMany({ where: datedWhere, data: { lastLoginIp: null, lastLoginLocation: null } })).count
      : await prisma.user.count({ where: datedWhere });
    const legacy = await prisma.user.findMany({
      where: {
        lastLoginAt: { isSet: false },
        createdAt: { lt: traceCutoff },
        sessions: { none: { createdAt: { gte: traceCutoff } } },
        ...loginTraceFields,
      },
      select: { id: true },
      take: BATCH,
    });
    if (legacy.length === 0 || !apply) return dated + legacy.length;
    const erased = await prisma.user.updateMany({
      where: { id: { in: legacy.map((user) => user.id) }, lastLoginAt: { isSet: false } },
      data: { lastLoginIp: null, lastLoginLocation: null },
    });
    return dated + erased.count;
  });

  return {
    applied: apply,
    closedSessions,
    securityEvents,
    purgedAccountSecurityEvents,
    adminAuditLogs,
    registrationTraces,
    loginTraces,
  };
}
