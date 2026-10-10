/**
 * Revue « privacy-retention-bypass » — **un lecteur applique la même borne que
 * la purge, purge armée ou non** : une session close ou échue depuis plus de
 * 90 jours, un événement de sécurité de plus de 12 mois, une adresse de
 * connexion de plus de 12 mois ne se servent plus — ni au membre (liste,
 * export, événements), ni à l'administration.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  retainedSecurityEventWhere,
  retainedSessionWhere,
  withoutExpiredConnectionTraces,
} from '../../../services/retention/retention-bounds';
import { exportSecurityEvents, exportSessions } from '../../../routes/me/export-security';
import { sanitizationService } from '../../../services/admin/user-sanitization.service';
import { UserRoleEnum } from '@meeshy/shared/types';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const monthsAgo = (n: number) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
};

describe('withoutExpiredConnectionTraces', () => {
  const traces = {
    registrationIp: '81.2.69.160', registrationLocation: 'Paris, France', registrationDevice: 'UA-1',
    lastLoginIp: '81.2.69.161', lastLoginLocation: 'Lyon, France', lastLoginDevice: 'UA-2',
  };

  it('masque l’inscription 12 mois après elle, et la dernière connexion 12 mois après elle', () => {
    expect(withoutExpiredConnectionTraces({ ...traces, createdAt: monthsAgo(13), lastLoginAt: monthsAgo(13) }, NOW)).toEqual({
      createdAt: monthsAgo(13), lastLoginAt: monthsAgo(13),
      registrationIp: null, registrationLocation: null, registrationDevice: null,
      lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null,
    });
  });

  it('garde ce qui est dans la borne', () => {
    const recent = { ...traces, createdAt: monthsAgo(13), lastLoginAt: monthsAgo(2) };
    expect(withoutExpiredConnectionTraces(recent, NOW)).toMatchObject({ registrationIp: null, lastLoginIp: '81.2.69.161' });
  });

  it('une dernière connexion sans date reste servie (rien ne dit qu’elle a dépassé la borne)', () => {
    expect(withoutExpiredConnectionTraces({ ...traces, createdAt: monthsAgo(1) }, NOW)).toMatchObject({ lastLoginIp: '81.2.69.161', registrationIp: '81.2.69.160' });
  });

  it('n’ajoute jamais une clé que l’objet ne portait pas', () => {
    expect(withoutExpiredConnectionTraces({ createdAt: monthsAgo(20), registrationIp: 'x' }, NOW)).toEqual({ createdAt: monthsAgo(20), registrationIp: null });
  });
});

describe('les lecteurs bornés', () => {
  const prisma = () => ({
    userSession: { findMany: jest.fn(async (_a: unknown) => []), count: jest.fn(async (_a: unknown) => 0) },
    securityEvent: { findMany: jest.fn(async (_a: unknown) => []), count: jest.fn(async (_a: unknown) => 0) },
  });

  it('l’export ne lit que les sessions dans la borne', async () => {
    const p = prisma();
    await exportSessions(p as never, 'u-1', { limit: 10, offset: 0 }, 'fr', NOW);
    expect((p.userSession.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ userId: 'u-1', ...retainedSessionWhere(NOW) });
    expect((p.userSession.count.mock.calls[0][0] as { where: unknown }).where).toEqual({ userId: 'u-1', ...retainedSessionWhere(NOW) });
  });

  it('l’export ne lit que les événements de moins de 12 mois', async () => {
    const p = prisma();
    await exportSecurityEvents(p as never, 'u-1', { limit: 10, offset: 0 }, NOW);
    expect((p.securityEvent.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ userId: 'u-1', ...retainedSecurityEventWhere(NOW) });
  });

  it('la fiche d’administration ne sert plus une adresse de plus de 12 mois', () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setImmediate', 'nextTick'] });
    try {
      const served = sanitizationService.sanitizeUser({
        id: 'u-1', username: 'ada', role: 'USER', isActive: true, createdAt: monthsAgo(20), lastLoginAt: monthsAgo(14),
        registrationIp: '81.2.69.160', registrationLocation: 'Paris', registrationDevice: 'UA',
        lastLoginIp: '81.2.69.161', lastLoginLocation: 'Lyon', lastLoginDevice: 'UA',
      } as never, UserRoleEnum.BIGBOSS) as unknown as Record<string, unknown>;
      expect(served).toMatchObject({ registrationIp: null, lastLoginIp: null, lastLoginLocation: null });
    } finally {
      jest.useRealTimers();
    }
  });
});
