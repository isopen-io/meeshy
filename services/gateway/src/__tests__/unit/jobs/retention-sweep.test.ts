/**
 * #9614, #9642 — **ce que Meeshy garde d'une connexion a une durée.**
 *
 *  - une session CLOSE s'efface 90 jours après sa clôture ;
 *  - un événement de sécurité s'efface après 12 mois — et 90 jours après la
 *    purge du compte quand le compte a été purgé ;
 *  - une ligne du journal d'audit d'administration s'efface après 12 mois ;
 *  - l'adresse et le lieu d'inscription s'effacent 12 mois après l'inscription,
 *    ceux de la dernière connexion 12 mois après elle.
 *
 * Et la PREMIÈRE exécution en production supprime des données anciennes : la
 * purge n'écrit que si `RETENTION_PURGE_ENABLED` vaut exactement `true`.
 * Désarmée, elle COMPTE ce qu'elle effacerait, et n'écrit rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  RETENTION,
  retentionPurgeArmed,
  sweepRetention,
} from '../../../jobs/retention-sweep';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const monthsBefore = (months: number) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

type FakeOverrides = {
  purgedUserIds?: string[];
  legacyLoginUserIds?: string[];
  bannedUserIds?: string[];
  reportedUserIds?: string[];
  lockedUserIds?: string[];
};

const fakePrisma = (overrides: FakeOverrides = {}) => {
  const counted = (n: number) => jest.fn(async (_args: unknown) => n);
  const removed = (n: number) => jest.fn(async (_args: unknown) => ({ count: n }));
  return {
    userSession: { count: counted(3), deleteMany: removed(3) },
    securityEvent: { count: counted(5), deleteMany: removed(5) },
    adminAuditLog: { count: counted(7), deleteMany: removed(7) },
    ban: { findMany: jest.fn(async (_args: unknown) => (overrides.bannedUserIds ?? []).map((userId) => ({ userId }))) },
    report: { findMany: jest.fn(async (_args: unknown) => (overrides.reportedUserIds ?? []).map((reportedEntityId) => ({ reportedEntityId }))) },
    user: {
      count: counted(2),
      updateMany: removed(2),
      // Deux lectures distinctes : les comptes PURGÉS (filtre `deletedAt`) et
      // les comptes ANTÉRIEURS à `lastLoginAt` (filtre `lastLoginAt`).
      findMany: jest.fn(async (args: any) =>
        (args?.where?.lockedUntil
          ? overrides.lockedUserIds ?? []
          : args?.where?.deletedAt ? overrides.purgedUserIds ?? [] : overrides.legacyLoginUserIds ?? []).map((id) => ({ id }))),
    },
  };
};

const writes = (prisma: ReturnType<typeof fakePrisma>) => [
  ...prisma.userSession.deleteMany.mock.calls,
  ...prisma.securityEvent.deleteMany.mock.calls,
  ...prisma.adminAuditLog.deleteMany.mock.calls,
  ...prisma.user.updateMany.mock.calls,
];

describe('les durées décidées', () => {
  it('sont nommées, une seule fois', () => {
    expect(RETENTION).toEqual({
      closedSessionDays: 90,
      securityEventMonths: 12,
      purgedAccountSecurityEventDays: 90,
      adminAuditLogMonths: 15,
      connectionTraceMonths: 12,
    });
  });
});

describe('l’interrupteur', () => {
  it('n’arme la purge que sur la valeur exacte `true`', () => {
    expect(retentionPurgeArmed({ RETENTION_PURGE_ENABLED: 'true' })).toBe(true);
    for (const value of [undefined, '', 'false', '1', 'yes', 'TRUE', ' true']) {
      expect(retentionPurgeArmed({ RETENTION_PURGE_ENABLED: value })).toBe(false);
    }
  });
});

describe('sweepRetention — désarmée', () => {
  it('compte ce qu’elle effacerait et n’écrit RIEN', async () => {
    const prisma = fakePrisma({ purgedUserIds: ['u-purge'] });

    const report = await sweepRetention(prisma as never, { now: NOW, apply: false });

    expect(writes(prisma)).toEqual([]);
    expect(report).toEqual({
      applied: false,
      closedSessions: 3,
      securityEvents: 5,
      purgedAccountSecurityEvents: 5,
      adminAuditLogs: 7,
      registrationTraces: 2,
      loginTraces: 2,
    });
  });
});

describe('sweepRetention — armée', () => {
  it('efface les sessions closes depuis plus de 90 jours, et seulement des sessions closes', async () => {
    const prisma = fakePrisma();

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: {
        isValid: false,
        OR: [
          { invalidatedAt: { lt: daysBefore(90) } },
          {
            AND: [
              { OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }] },
              { lastActivityAt: { lt: daysBefore(90) } },
            ],
          },
        ],
      },
    });
  });

  it('efface les événements de sécurité de plus de 12 mois et le journal d’audit de plus de 15 mois', async () => {
    const prisma = fakePrisma();

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.securityEvent.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: monthsBefore(12) } } });
    expect(prisma.adminAuditLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: monthsBefore(15) } } });
  });

  it('efface les événements de sécurité d’un compte purgé depuis plus de 90 jours', async () => {
    const prisma = fakePrisma({ purgedUserIds: ['u-purge-1', 'u-purge-2'] });

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deletedAt: { lt: daysBefore(90) },
        isActive: false,
        accountDeletionRequests: { some: { status: { in: ['GRACE_PERIOD_EXPIRED', 'COMPLETED'] } } },
        securityEvents: { some: {} },
      },
    }));
    expect(prisma.securityEvent.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u-purge-1', 'u-purge-2'] } } });
  });

  it('aucun compte purgé : aucune suppression par compte', async () => {
    const prisma = fakePrisma({ purgedUserIds: [] });

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.securityEvent.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { userId: expect.anything() } }));
  });

  it('met à null l’adresse et le lieu d’inscription 12 mois après l’inscription', async () => {
    const prisma = fakePrisma();

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: monthsBefore(12) },
        OR: [{ registrationIp: { not: null } }, { registrationLocation: { not: null } }],
      },
      data: { registrationIp: null, registrationLocation: null },
    });
  });

  it('met à null l’adresse et le lieu de dernière connexion 12 mois après elle', async () => {
    const prisma = fakePrisma();

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        lastLoginAt: { lt: monthsBefore(12) },
        OR: [{ lastLoginIp: { not: null } }, { lastLoginLocation: { not: null } }],
      },
      data: { lastLoginIp: null, lastLoginLocation: null },
    });
  });

  it('un compte d’avant la date de dernière connexion, sans session ouverte depuis 12 mois, perd aussi sa trace', async () => {
    const prisma = fakePrisma({ legacyLoginUserIds: ['u-ancien'] });

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        lastLoginAt: { isSet: false },
        createdAt: { lt: monthsBefore(12) },
        sessions: { none: { createdAt: { gte: monthsBefore(12) } } },
        OR: [{ lastLoginIp: { not: null } }, { lastLoginLocation: { not: null } }],
      },
    }));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u-ancien'] }, lastLoginAt: { isSet: false } },
      data: { lastLoginIp: null, lastLoginLocation: null },
    });
  });

  it('une étape qui échoue n’empêche pas les suivantes, et son compte est absent', async () => {
    const prisma = fakePrisma();
    prisma.securityEvent.deleteMany.mockRejectedValueOnce(new Error('mongo down'));

    const report = await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(report.securityEvents).toBeNull();
    expect(report.adminAuditLogs).toBe(7);
    expect(prisma.adminAuditLog.deleteMany).toHaveBeenCalled();
  });
});

describe('audit L2-5 — la passe va jusqu’au bout, par curseur, pas sur les mêmes 500', () => {
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(5, '0')}`);

  /** Un `findMany` qui respecte `orderBy id`, le filtre `id > dernier` et `take`. */
  const paged = (all: readonly string[], toRow: (id: string) => Record<string, string>) =>
    jest.fn(async (args: any) => {
      expect(args.orderBy).toEqual({ id: 'asc' });
      const after: string | undefined = args.where?.id?.gt;
      return all.filter((id) => after === undefined || id > after).slice(0, args.take).map(toRow);
    });

  /**
   * Comptes purgés simulés : chacun garde des événements tant qu'aucun
   * `deleteMany` ne les a effacés — le filtre `securityEvents: { some: {} }`
   * les fait disparaître de la sélection une fois traités.
   */
  const purgedWorld = (n: number) => {
    const all = ids('u', n);
    const withEvents = new Set(all);
    const prisma = fakePrisma();
    prisma.user.findMany = jest.fn(async (args: any) => {
      if (!args?.where?.deletedAt) return [];
      expect(args.orderBy).toEqual({ id: 'asc' });
      const after: string | undefined = args.where?.id?.gt;
      return all.filter((id) => withEvents.has(id) && (after === undefined || id > after)).slice(0, args.take).map((id) => ({ id }));
    }) as never;
    prisma.securityEvent.deleteMany = jest.fn(async (args: any) => {
      const target: string[] = args?.where?.userId?.in ?? [];
      target.forEach((id) => withEvents.delete(id));
      return { count: target.length };
    }) as never;
    return { all, withEvents, prisma };
  };

  it('efface les événements de TOUS les comptes purgés, au-delà de 500', async () => {
    const { withEvents, prisma } = purgedWorld(1200);

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(withEvents.size).toBe(0);
  });

  it('au-delà du plafond d’une passe, la passe suivante reprend où l’autre s’est arrêtée — rien n’échappe indéfiniment', async () => {
    const { withEvents, prisma } = purgedWorld(25_000);

    await sweepRetention(prisma as never, { now: NOW, apply: true });
    expect(withEvents.size).toBe(5_000);
    await sweepRetention(prisma as never, { now: NOW, apply: true });
    expect(withEvents.size).toBe(0);
  });

  it('le décompte à blanc couvre aussi tous les comptes, et n’efface rien', async () => {
    const { all, withEvents, prisma } = purgedWorld(1200);

    await sweepRetention(prisma as never, { now: NOW, apply: false });

    const counted = prisma.securityEvent.count.mock.calls
      .map(([args]) => (args as { where: { userId?: { in: string[] } } }).where.userId?.in ?? [])
      .flat();
    expect(new Set(counted)).toEqual(new Set(all));
    expect(withEvents.size).toBe(1200);
  });

  it('les comptes anciens sans date de connexion sont tous traités, à blanc comme armée', async () => {
    const legacy = ids('l', 1100);
    const prisma = fakePrisma();
    const legacyPage = paged(legacy, (id) => ({ id }));
    prisma.user.findMany = jest.fn(async (args: any) =>
      (args?.where?.deletedAt || args?.where?.lockedUntil ? [] : legacyPage(args))) as never;

    const report = await sweepRetention(prisma as never, { now: NOW, apply: false });
    expect(report.loginTraces).toBe(2 + 1100);

    await sweepRetention(prisma as never, { now: NOW, apply: true });
    const erased = prisma.user.updateMany.mock.calls
      .map(([args]) => (args as { where: { id?: { in: string[] } } }).where.id?.in ?? [])
      .flat();
    expect(new Set(erased)).toEqual(new Set(legacy));
  });
});

describe('revue « privacy-retention-logic » — rien de vivant ne part', () => {
  it('une session n’est effacée que close (`isValid: false`), quelle que soit sa date', async () => {
    const prisma = fakePrisma();
    await sweepRetention(prisma as never, { now: NOW, apply: true });
    const where = (prisma.userSession.deleteMany.mock.calls[0][0] as { where: { isValid: boolean } }).where;
    expect(where.isValid).toBe(false);
  });

  it('les événements d’un compte ne partent par la règle du compte purgé que s’il est désactivé, supprimé depuis plus de 90 jours ET purgé par une demande aboutie', async () => {
    const prisma = fakePrisma({ purgedUserIds: ['u-1'] });
    await sweepRetention(prisma as never, { now: NOW, apply: true });
    const where = (prisma.user.findMany.mock.calls.find(([args]: any) => args?.where?.deletedAt)?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      isActive: false,
      deletedAt: { lt: daysBefore(90) },
      accountDeletionRequests: { some: { status: { in: ['GRACE_PERIOD_EXPIRED', 'COMPLETED'] } } },
    });
  });

  it('toute durée se compte vers le PASSÉ : chaque seuil est antérieur à maintenant', async () => {
    const prisma = fakePrisma();
    await sweepRetention(prisma as never, { now: NOW, apply: true });
    const cutoffs = [
      ...prisma.securityEvent.deleteMany.mock.calls.map(([a]: any) => a?.where?.createdAt?.lt),
      ...prisma.adminAuditLog.deleteMany.mock.calls.map(([a]: any) => a?.where?.createdAt?.lt),
    ].filter(Boolean) as Date[];
    expect(cutoffs.length).toBeGreaterThan(0);
    cutoffs.forEach((cutoff) => expect(cutoff.getTime()).toBeLessThan(NOW.getTime()));
  });
});

describe('revue « evidence-destruction » — une trace visée par une procédure échappe à la purge', () => {
  const held = () => fakePrisma({ bannedUserIds: ['u-banni'], reportedUserIds: ['u-signale'], lockedUserIds: ['u-verrouille'] });
  const HELD = ['u-banni', 'u-signale', 'u-verrouille'];

  it('relève les comptes sous procédure : bannissement en cours, signalement ouvert, verrou actif', async () => {
    const prisma = held();
    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.ban.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] },
    }));
    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reportedType: 'user', resolvedAt: null },
    }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lockedUntil: { gt: NOW } } }));
  });

  it('ni leurs sessions closes, ni leurs événements, ni le journal d’audit qui les vise ou qu’ils ont écrit, ni leurs adresses ne partent', async () => {
    const prisma = held();
    await sweepRetention(prisma as never, { now: NOW, apply: true });

    const sessionWhere = (prisma.userSession.deleteMany.mock.calls[0][0] as any).where;
    expect(sessionWhere.NOT).toEqual([{ userId: { in: HELD } }]);
    const eventWhere = (prisma.securityEvent.deleteMany.mock.calls[0][0] as any).where;
    expect(eventWhere.NOT).toEqual([{ userId: { in: HELD } }]);
    const auditWhere = (prisma.adminAuditLog.deleteMany.mock.calls[0][0] as any).where;
    expect(auditWhere.NOT).toEqual([{ userId: { in: HELD } }, { adminId: { in: HELD } }]);
    for (const [args] of prisma.user.updateMany.mock.calls as any[]) {
      expect(args.where.NOT ?? []).toContainEqual({ id: { in: HELD } });
    }
  });

  it('un compte purgé sous procédure garde ses événements au-delà de purge + 90 jours', async () => {
    const prisma = held();
    await sweepRetention(prisma as never, { now: NOW, apply: true });
    const purgedQuery = (prisma.user.findMany.mock.calls.find(([a]: any) => a?.where?.deletedAt)?.[0] as any).where;
    expect(purgedQuery.NOT).toEqual([{ id: { in: HELD } }]);
  });

  it('si les procédures ne se lisent pas, la passe n’efface RIEN (fail-closed)', async () => {
    const prisma = held();
    prisma.ban.findMany.mockRejectedValueOnce(new Error('mongo down'));

    const report = await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(writes(prisma)).toEqual([]);
    expect(report.closedSessions).toBeNull();
    expect(report.adminAuditLogs).toBeNull();
  });

  it('le journal d’audit survit plus longtemps que toute donnée qu’il décrit', () => {
    expect(RETENTION.adminAuditLogMonths).toBeGreaterThan(RETENTION.securityEventMonths);
    expect(RETENTION.adminAuditLogMonths).toBeGreaterThan(RETENTION.connectionTraceMonths);
    expect(RETENTION.adminAuditLogMonths * 30).toBeGreaterThan(RETENTION.closedSessionDays);
  });
});

