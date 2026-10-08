/**
 * LA CONSERVATION DE CE QU'UNE CONNEXION LAISSE (#9614, #9642).
 *
 * Décision du porteur du 2026-10-08, sur l'analyse `conformite-juridique` (pas
 * un avis juridique signé) :
 *  - une session CLOSE s'efface 90 jours après sa clôture (`invalidatedAt`) ;
 *  - un `SecurityEvent` s'efface après 12 mois ; d'un compte PURGÉ, 90 jours
 *    après la purge (`User.deletedAt`, posé à l'instant de la purge ; le
 *    compte doit être désactivé et porter une demande de suppression aboutie)
 *    — la plus courte des deux durées l'emporte ;
 *  - une ligne d'`AdminAuditLog` s'efface après 15 mois — le journal de
 *    l'administration survit à TOUTE donnée qu'il décrit (12 mois au plus,
 *    + 90 jours) : la décision du 2026-10-08 disait 12, la revue
 *    « evidence-destruction » a montré qu'à égalité il disparaissait avec ce
 *    qu'il prouve. À confirmer par le porteur ;
 *  - adresse, lieu et agent d'inscription (`registrationIp` / `Location` /
 *    `Device`) passent à `null` 12 mois après l'inscription, ceux de dernière
 *    connexion (`lastLogin*`) 12 mois après la dernière connexion (`lastLoginAt`). Un compte antérieur à `lastLoginAt`
 *    perd sa trace quand aucune session ne s'est ouverte depuis 12 mois.
 *
 * L'INTERRUPTEUR. En production, la PREMIÈRE exécution supprime des données
 * anciennes : elle attend le feu vert du porteur et une sauvegarde vérifiée.
 * La purge n'écrit donc que si `RETENTION_PURGE_ENABLED` vaut exactement
 * `true` (posé en staging, absent en production). Désarmée, elle COMPTE ce
 * qu'elle effacerait et l'écrit au journal — le porteur décide sur un chiffre.
 *
 * UNE TRACE VISÉE PAR UNE PROCÉDURE ÉCHAPPE À LA PURGE (revue
 * « evidence-destruction »). Le schéma ne porte aucun indicateur de rétention
 * légale ; les procédures qu'il SAIT dire sont : un bannissement en cours
 * (`Ban` non levé, non échu), un signalement ouvert visant le compte (`Report`
 * `reportedType: 'user'`, non résolu), un verrou actif (`lockedUntil` à venir).
 * Les sessions closes, événements de sécurité, lignes d'audit (visant le
 * compte OU écrites par lui) et adresses d'un tel compte sont gardés. Si ces
 * procédures ne se lisent pas, la passe n'efface RIEN : fail-closed.
 *
 * Chaque étape est indépendante : une étape qui échoue est journalisée, rend
 * `null`, et n'empêche pas les suivantes. Toutes sont idempotentes : filtrées
 * sur l'état à corriger, leur premier passage solde l'arriéré comme les
 * suivants font l'entretien.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { unsetOrNull } from '../utils/prisma-unset';
import {
  RETENTION,
  daysBefore,
  expiredSessionRetentionWhere,
  monthsBefore,
} from '../services/retention/retention-bounds';

const logger = enhancedLogger.child({ module: 'RetentionSweep' });

export { RETENTION } from '../services/retention/retention-bounds';

/** Une page de comptes purgés ou anciens. */
const BATCH = 500;

/**
 * Pages par passe et par étape (audit L2-5) : la passe parcourt par CURSEUR
 * jusqu'à épuisement, bornée à 40 pages (20 000 lignes) — au-delà, la passe du
 * lendemain reprend. Sans curseur, `take: 500` rendait chaque jour les MÊMES
 * 500 premiers comptes, et l'arriéré au-delà n'était jamais atteint.
 */
const MAX_PAGES = 40;

type Paged = { readonly id: string };

/**
 * Le curseur est un FILTRE `id > dernier` et non le `cursor` + `skip: 1` de
 * Prisma : une ligne que la page vient d'effacer ne répond plus au filtre, et
 * `skip: 1` sauterait alors la PREMIÈRE ligne encore à traiter.
 */
async function eachPage<T extends Paged>(
  fetch: (after: { readonly id?: { gt: string } }) => Promise<readonly T[]>,
  handle: (page: readonly T[]) => Promise<number>,
): Promise<number> {
  let total = 0;
  let cursor: string | null = null;
  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    const page = await fetch(cursor === null ? {} : { id: { gt: cursor } });
    if (page.length === 0) break;
    total += await handle(page);
    if (page.length < BATCH) break;
    cursor = page[page.length - 1].id;
  }
  return total;
}

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

type RetentionStore = Pick<PrismaClient, 'userSession' | 'securityEvent' | 'adminAuditLog' | 'user' | 'ban' | 'report'>;

/** Les comptes visés par une procédure en cours — leurs traces ne partent pas. */
async function accountsUnderProcedure(prisma: RetentionStore, now: Date): Promise<readonly string[]> {
  const [bans, reports, locked] = await Promise.all([
    // `BanService.createBan` n'écrit NI `liftedAt` NI parfois `expiresAt` : la
    // clé est ABSENTE, et `{ liftedAt: null }` ne l'apparie pas (audit A2-1) —
    // `unsetOrNull`, comme `BanService.listActiveBans`.
    prisma.ban.findMany({
      where: {
        AND: [
          unsetOrNull('liftedAt'),
          { OR: [...unsetOrNull('expiresAt').OR, { expiresAt: { gt: now } }] },
        ],
      },
      select: { userId: true },
    }),
    prisma.report.findMany({
      // Le STATUT, jamais `resolvedAt` : un signalement ouvert n'a pas la clé
      // (absente ≠ null), et `dismissed` ne l'écrit pas (`report.service.ts`).
      where: { reportedType: 'user', status: { in: ['pending', 'under_review'] } },
      select: { reportedEntityId: true },
    }),
    prisma.user.findMany({ where: { lockedUntil: { gt: now } }, select: { id: true } }),
  ]);
  return [...new Set([
    ...bans.map((ban) => ban.userId),
    ...reports.map((report) => report.reportedEntityId),
    ...locked.map((user) => user.id),
  ])];
}

const NOTHING_SWEPT = (apply: boolean): RetentionReport => ({
  applied: apply,
  closedSessions: null,
  securityEvents: null,
  purgedAccountSecurityEvents: null,
  adminAuditLogs: null,
  registrationTraces: null,
  loginTraces: null,
});

async function step(name: string, run: () => Promise<number>): Promise<number | null> {
  try {
    return await run();
  } catch (error) {
    logger.error(`retention step failed: ${name}`, error);
    return null;
  }
}

export async function sweepRetention(
  prisma: RetentionStore,
  options: { readonly now?: Date; readonly apply: boolean },
): Promise<RetentionReport> {
  const now = options.now ?? new Date();
  const { apply } = options;
  const eventCutoff = monthsBefore(now, RETENTION.securityEventMonths);
  const purgeCutoff = daysBefore(now, RETENTION.purgedAccountSecurityEventDays);
  const auditCutoff = monthsBefore(now, RETENTION.adminAuditLogMonths);
  const traceCutoff = monthsBefore(now, RETENTION.connectionTraceMonths);

  let held: readonly string[];
  try {
    held = await accountsUnderProcedure(prisma, now);
  } catch (error) {
    logger.error('retention sweep suspended — procedures could not be read, nothing is erased', error);
    return NOTHING_SWEPT(apply);
  }
  // Les comptes sous procédure s'écartent par des branches POSITIVES : une
  // négation écarterait aussi le document sans la clé (un événement sans
  // `userId` serait gardé à jamais).
  const heldIds = [...held];
  // `SecurityEvent.userId` est NULLABLE (tentative sans compte) : l'absence et
  // `null` se gardent par des branches positives. `UserSession.userId` est requis.
  const spareEventOwner: Prisma.SecurityEventWhereInput[] = heldIds.length > 0
    ? [{ OR: [{ userId: { notIn: heldIds } }, { userId: null }, { userId: { isSet: false } }] }]
    : [];
  const spareSessionOwner: Prisma.UserSessionWhereInput[] = heldIds.length > 0 ? [{ userId: { notIn: heldIds } }] : [];
  const spareAccount: Prisma.UserWhereInput[] = heldIds.length > 0 ? [{ id: { notIn: heldIds } }] : [];
  const spareAudit: Prisma.AdminAuditLogWhereInput[] = heldIds.length > 0 ? [{ userId: { notIn: heldIds } }, { adminId: { notIn: heldIds } }] : [];

  const closedSessionsWhere: Prisma.UserSessionWhereInput = { AND: [expiredSessionRetentionWhere(now), ...spareSessionOwner] };
  const closedSessions = await step('closed sessions', async () =>
    apply
      ? (await prisma.userSession.deleteMany({ where: closedSessionsWhere })).count
      : prisma.userSession.count({ where: closedSessionsWhere }));

  const eventsWhere: Prisma.SecurityEventWhereInput = { AND: [{ createdAt: { lt: eventCutoff } }, ...spareEventOwner] };
  const securityEvents = await step('security events', async () =>
    apply
      ? (await prisma.securityEvent.deleteMany({ where: eventsWhere })).count
      : prisma.securityEvent.count({ where: eventsWhere }));

  // Un compte PURGÉ, et lui seul : désactivé, supprimé (`deletedAt`, posé à
  // l'instant de la purge par les deux chemins — passe horaire et « supprimer
  // maintenant ») depuis plus de 90 jours, ET porteur d'une demande de
  // suppression aboutie. Un compte réactivé, ou supprimé par un autre chemin,
  // garde ses événements jusqu'aux 12 mois. `securityEvents: { some: {} }` fait
  // sortir de la sélection un compte déjà traité : au-delà du plafond d'une
  // passe, la suivante reprend sur les comptes restants — rien n'échappe.
  const purgedAccountSecurityEvents = await step('security events of purged accounts', () =>
    eachPage(
      (after) => prisma.user.findMany({
        where: {
          AND: [
            {
              deletedAt: { lt: purgeCutoff },
              isActive: false,
              accountDeletionRequests: { some: { status: { in: ['GRACE_PERIOD_EXPIRED', 'COMPLETED'] } } },
              securityEvents: { some: {} },
            },
            ...spareAccount,
            after,
          ],
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      }),
      async (users) => {
        const where = { userId: { in: users.map((user) => user.id) } };
        return apply ? (await prisma.securityEvent.deleteMany({ where })).count : prisma.securityEvent.count({ where });
      },
    ));

  const auditWhere = { AND: [{ createdAt: { lt: auditCutoff } }, ...spareAudit] };
  const adminAuditLogs = await step('admin audit log', async () =>
    apply
      ? (await prisma.adminAuditLog.deleteMany({ where: auditWhere })).count
      : prisma.adminAuditLog.count({ where: auditWhere }));

  const registrationWhere = {
    AND: [
      { createdAt: { lt: traceCutoff } },
      { OR: [{ registrationIp: { not: null } }, { registrationLocation: { not: null } }, { registrationDevice: { not: null } }] },
      ...spareAccount,
    ],
  };
  const registrationTraces = await step('registration address', async () =>
    apply
      ? (await prisma.user.updateMany({ where: registrationWhere, data: { registrationIp: null, registrationLocation: null, registrationDevice: null } })).count
      : prisma.user.count({ where: registrationWhere }));

  const loginTraceFields = { OR: [{ lastLoginIp: { not: null } }, { lastLoginLocation: { not: null } }, { lastLoginDevice: { not: null } }] };
  const loginTraces = await step('last login address', async () => {
    const datedWhere = { AND: [{ lastLoginAt: { lt: traceCutoff } }, loginTraceFields, ...spareAccount] };
    const dated = apply
      ? (await prisma.user.updateMany({ where: datedWhere, data: { lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null } })).count
      : await prisma.user.count({ where: datedWhere });
    const legacy = await eachPage(
      (after) => prisma.user.findMany({
        where: {
          AND: [
            {
              lastLoginAt: { isSet: false },
              createdAt: { lt: traceCutoff },
              sessions: { none: { createdAt: { gte: traceCutoff } } },
            },
            loginTraceFields,
            ...spareAccount,
            after,
          ],
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      }),
      async (users) => {
        if (!apply) return users.length;
        const erased = await prisma.user.updateMany({
          where: { AND: [{ id: { in: users.map((user) => user.id) }, lastLoginAt: { isSet: false } }, ...spareAccount] },
          data: { lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null },
        });
        return erased.count;
      },
    );
    return dated + legacy;
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
