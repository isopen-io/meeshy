/**
 * #9610 — **une session porte la version de Meeshy, sa plateforme, son nom
 * d'appareil et son moyen de connexion, relevés à l'ouverture et à chaque
 * rafraîchissement ; un ancien client garde ce que le serveur déduit.**
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EMPTY_CLIENT_SESSION_INFO, type ClientSessionInfo } from '@meeshy/shared/utils/client-session';
import { createSession, getUserSessions, initSessionService } from '../../../services/SessionService';
import {
  clientInfoChanges,
  recordSessionClientInfo,
} from '../../../services/auth/session-client-info';
import type { RequestContext } from '../../../services/GeoIPService';

const declared = (overrides: Partial<ClientSessionInfo> = {}): ClientSessionInfo => ({
  ...EMPTY_CLIENT_SESSION_INFO,
  appVersion: '1.4.2',
  appBuild: '1874',
  platform: 'ios',
  deviceName: 'iPhone 15 Pro',
  ...overrides,
});

const contextWith = (client?: ClientSessionInfo): RequestContext => ({
  ip: '81.2.69.160',
  userAgent: 'Meeshy-iOS/1.4.2',
  geoData: null,
  deviceInfo: null,
  ...(client ? { client } : {}),
});

const sessionDb = () => {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = {
    userSession: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `s-${rows.length + 1}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async () => rows),
      updateMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
    },
  };
  initSessionService(prisma as never);
  return { prisma, rows };
};

describe('createSession — ce que la session retient de son ouverture', () => {
  it('écrit la version, le build, la plateforme, le nom d’appareil déclarés et le moyen de connexion', async () => {
    const { rows } = sessionDb();

    const session = await createSession({
      userId: 'u-1',
      token: 'tok',
      requestContext: contextWith(declared()),
      loginMethod: 'password',
    });

    expect(rows[0]).toMatchObject({
      appVersion: '1.4.2',
      appBuild: '1874',
      platform: 'ios',
      deviceName: 'iPhone 15 Pro',
      loginMethod: 'password',
    });
    expect(session).toMatchObject({
      appVersion: '1.4.2',
      appBuild: '1874',
      platform: 'ios',
      deviceName: 'iPhone 15 Pro',
      loginMethod: 'password',
    });
  });

  it('un ancien client sans relevé ouvre une session sans ces champs, et rien d’autre ne change', async () => {
    const { rows } = sessionDb();

    await createSession({ userId: 'u-1', token: 'tok', requestContext: contextWith() });

    expect(rows[0]).toMatchObject({ appVersion: null, appBuild: null, platform: null, deviceName: null, loginMethod: null });
    expect(rows[0].ipAddress).toBe('81.2.69.160');
  });

  it('la liste des sessions sert ces champs, le fuseau, et jamais de coordonnées', async () => {
    const { rows } = sessionDb();
    rows.push({
      id: 's-9', userId: 'u-1', sessionToken: 'h', isTrusted: false, isMobile: true,
      appVersion: '2.0.3', appBuild: '203', platform: 'pwa', deviceName: 'Chrome sur Mac',
      loginMethod: 'magic_link', timezone: 'Europe/Paris', latitude: 48.8, longitude: 2.3,
      createdAt: new Date(), lastActivityAt: new Date(),
    });

    const [session] = await getUserSessions('u-1', { sessionId: 's-9' });

    expect(session).toMatchObject({
      appVersion: '2.0.3', appBuild: '203', platform: 'pwa', deviceName: 'Chrome sur Mac',
      loginMethod: 'magic_link', timezone: 'Europe/Paris', isCurrentSession: true,
    });
    expect(session).not.toHaveProperty('latitude');
    expect(session).not.toHaveProperty('longitude');
  });
});

describe('clientInfoChanges — ce qu’un rafraîchissement réécrit', () => {
  it('ne rend que les champs DÉCLARÉS qui ont changé', () => {
    const stored = { appVersion: '1.4.1', appBuild: '1873', platform: 'ios', deviceName: 'iPhone 15 Pro', deviceModel: 'iPhone16,1', osVersion: '18.1' };
    expect(clientInfoChanges(stored, declared({ deviceModel: 'iPhone16,1', osVersion: '18.2' }))).toEqual({
      appVersion: '1.4.2',
      appBuild: '1874',
      osVersion: '18.2',
    });
  });

  it('un client qui ne déclare rien n’efface rien', () => {
    const stored = { appVersion: '1.4.1', appBuild: null, platform: 'ios', deviceName: null, deviceModel: null, osVersion: null };
    expect(clientInfoChanges(stored, EMPTY_CLIENT_SESSION_INFO)).toEqual({});
  });
});

describe('recordSessionClientInfo — le relevé du rafraîchissement', () => {
  it('écrit les changements sur la session NOMMÉE, bornée au compte et vivante', async () => {
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
    const findFirst = jest.fn(async (_args: unknown) => ({ appVersion: '1.4.1', appBuild: '1873', platform: 'ios', deviceName: null, deviceModel: null, osVersion: null }));

    const written = await recordSessionClientInfo({ userSession: { findFirst, updateMany } }, {
      sessionId: 's-1', userId: 'u-1', declared: declared(),
    });

    expect(written).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', userId: 'u-1', isValid: true },
      data: { appVersion: '1.4.2', appBuild: '1874', deviceName: 'iPhone 15 Pro' },
    });
  });

  it('rien de neuf, rien d’écrit', async () => {
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
    const findFirst = jest.fn(async (_args: unknown) => ({ appVersion: '1.4.2', appBuild: '1874', platform: 'ios', deviceName: 'iPhone 15 Pro', deviceModel: null, osVersion: null }));

    expect(await recordSessionClientInfo({ userSession: { findFirst, updateMany } }, { sessionId: 's-1', userId: 'u-1', declared: declared() })).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('un client qui ne déclare rien ne coûte aucune lecture', async () => {
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
    const findFirst = jest.fn(async (_args: unknown) => null);

    await recordSessionClientInfo({ userSession: { findFirst, updateMany } }, { sessionId: 's-1', userId: 'u-1', declared: EMPTY_CLIENT_SESSION_INFO });

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('une session d’un autre compte, ou close, n’est pas lue', async () => {
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 0 }));
    const findFirst = jest.fn(async (_args: unknown) => null);

    expect(await recordSessionClientInfo({ userSession: { findFirst, updateMany } }, { sessionId: 's-x', userId: 'u-1', declared: declared() })).toBe(false);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's-x', userId: 'u-1', isValid: true } }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ne lève jamais : un relevé perdu attend le prochain rafraîchissement', async () => {
    const findFirst = jest.fn(async (_args: unknown) => { throw new Error('mongo down'); });
    await expect(recordSessionClientInfo({ userSession: { findFirst, updateMany: jest.fn() } }, { sessionId: 's-1', userId: 'u-1', declared: declared() })).resolves.toBe(false);
  });
});
