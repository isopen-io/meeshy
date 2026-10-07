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

const fakePrisma = (overrides: { purgedUserIds?: string[]; legacyLoginUserIds?: string[] } = {}) => {
  const counted = (n: number) => jest.fn(async (_args: unknown) => n);
  const removed = (n: number) => jest.fn(async (_args: unknown) => ({ count: n }));
  return {
    userSession: { count: counted(3), deleteMany: removed(3) },
    securityEvent: { count: counted(5), deleteMany: removed(5) },
    adminAuditLog: { count: counted(7), deleteMany: removed(7) },
    accountDeletionRequest: {
      findMany: jest.fn(async (_args: unknown) => (overrides.purgedUserIds ?? []).map((userId) => ({ userId }))),
    },
    user: {
      count: counted(2),
      updateMany: removed(2),
      findMany: jest.fn(async (_args: unknown) => (overrides.legacyLoginUserIds ?? []).map((id) => ({ id }))),
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
      adminAuditLogMonths: 12,
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

  it('efface les événements de sécurité de plus de 12 mois et le journal d’audit de plus de 12 mois', async () => {
    const prisma = fakePrisma();

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.securityEvent.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: monthsBefore(12) } } });
    expect(prisma.adminAuditLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: monthsBefore(12) } } });
  });

  it('efface les événements de sécurité d’un compte purgé depuis plus de 90 jours', async () => {
    const prisma = fakePrisma({ purgedUserIds: ['u-purge-1', 'u-purge-2'] });

    await sweepRetention(prisma as never, { now: NOW, apply: true });

    expect(prisma.accountDeletionRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ['GRACE_PERIOD_EXPIRED', 'COMPLETED'] }, gracePeriodEndsAt: { lt: daysBefore(90) } },
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
