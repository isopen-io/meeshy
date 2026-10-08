/**
 * #9614 — **l'export RGPD contient ce qu'une session retient**, et les
 * événements de sécurité du compte.
 *
 * Chaque session : son identifiant, ses dates, le motif de clôture EN CLAIR,
 * l'appareil, le système, le navigateur, la version, la plateforme, le moyen de
 * connexion, l'adresse, le pays, la ville, le fuseau, l'agent utilisateur. Pas
 * `isCurrentSession` (une colonne qui disait « courante » pour toutes), pas de
 * jeton, pas de coordonnées.
 *
 * Le témoin traverse le VRAI sérialiseur : un champ non déclaré au schéma y
 * serait retiré, et le témoin tomberait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import {
  exportSessions,
  exportSecurityEvents,
  sessionExportItemSchema,
  securityEventExportItemSchema,
} from '../../../../routes/me/export-security';

const USER_ID = '507f1f77bcf86cd799439011';
const PAGE = { limit: 500, offset: 0 } as const;

const sessionRow = () => ({
  id: 's-1',
  deviceType: 'mobile', deviceVendor: 'Apple', deviceModel: 'iPhone16,1', deviceName: 'iPhone 15 Pro',
  osName: 'iOS', osVersion: '18.4', browserName: null, browserVersion: null, isMobile: true,
  appVersion: '1.4.2', appBuild: '1874', platform: 'ios', loginMethod: 'password',
  ipAddress: '81.2.69.160', country: 'FR', city: 'Paris', location: 'Paris, France', timezone: 'Europe/Paris',
  userAgent: 'Meeshy-iOS/1.4.2', isTrusted: false,
  expiresAt: new Date('2027-10-08T00:00:00.000Z'), isValid: false,
  invalidatedAt: new Date('2026-10-01T00:00:00.000Z'), invalidatedReason: 'admin_revoke',
  createdAt: new Date('2026-09-01T00:00:00.000Z'), lastActivityAt: new Date('2026-09-30T00:00:00.000Z'),
});

const prismaWith = (rows: unknown[]) => ({
  userSession: { findMany: jest.fn(async (_args: unknown) => rows), count: jest.fn(async (_args: unknown) => rows.length) },
  securityEvent: { findMany: jest.fn(async (_args: unknown) => []), count: jest.fn(async (_args: unknown) => 0) },
});

describe('exportSessions', () => {
  it('lit tout ce que la session retient, et jamais un jeton, une empreinte, des coordonnées ni la colonne « courante »', async () => {
    const prisma = prismaWith([]);
    await exportSessions(prisma as never, USER_ID, PAGE, 'fr');
    const { select, where, take } = prisma.userSession.findMany.mock.calls[0][0] as { select: Record<string, boolean>; where: unknown; take: number };

    expect(where).toMatchObject({ userId: USER_ID, NOT: expect.any(Array) });
    expect(take).toBe(500);
    for (const field of ['id', 'createdAt', 'lastActivityAt', 'expiresAt', 'invalidatedAt', 'invalidatedReason',
      'deviceType', 'deviceVendor', 'deviceModel', 'deviceName', 'osName', 'osVersion', 'browserName', 'browserVersion',
      'appVersion', 'appBuild', 'platform', 'loginMethod', 'ipAddress', 'country', 'city', 'location', 'timezone', 'userAgent']) {
      expect(select[field]).toBe(true);
    }
    for (const field of ['sessionToken', 'refreshToken', 'deviceFingerprint', 'isCurrentSession', 'latitude', 'longitude']) {
      expect(select).not.toHaveProperty(field);
    }
  });

  it('dit en clair, dans la langue de la personne, pourquoi la session s’est fermée — sans nommer l’administrateur', async () => {
    const prisma = prismaWith([sessionRow()]);
    const fr = await exportSessions(prisma as never, USER_ID, PAGE, 'fr');
    const en = await exportSessions(prisma as never, USER_ID, PAGE, 'en');

    expect(fr.items[0].invalidatedReasonText).toBe('Fermée par l’équipe Meeshy');
    expect(en.items[0].invalidatedReasonText).toBe('Closed by the Meeshy team');
  });

  it('une session ouverte n’a pas de motif', async () => {
    const prisma = prismaWith([{ ...sessionRow(), isValid: true, invalidatedAt: null, invalidatedReason: null }]);
    const { items } = await exportSessions(prisma as never, USER_ID, PAGE, 'fr');
    expect(items[0].invalidatedReasonText).toBeNull();
  });

  it('traverse le sérialiseur avec tous ses champs', async () => {
    const prisma = prismaWith([sessionRow()]);
    const { items } = await exportSessions(prisma as never, USER_ID, PAGE, 'fr');
    const app = Fastify({ logger: false });
    app.get('/x', { schema: { response: { 200: { type: 'object', properties: { sessions: { type: 'array', items: sessionExportItemSchema } } } } } },
      async () => ({ sessions: items }));
    const served = (await app.inject({ method: 'GET', url: '/x' })).json().sessions[0];
    await app.close();

    expect(served).toMatchObject({
      id: 's-1', appVersion: '1.4.2', appBuild: '1874', platform: 'ios', loginMethod: 'password',
      deviceName: 'iPhone 15 Pro', ipAddress: '81.2.69.160', country: 'FR', city: 'Paris',
      timezone: 'Europe/Paris', userAgent: 'Meeshy-iOS/1.4.2', invalidatedReason: 'admin_revoke',
      invalidatedReasonText: 'Fermée par l’équipe Meeshy',
    });
    expect(served).not.toHaveProperty('isCurrentSession');
  });
});

describe('exportSecurityEvents', () => {
  it('est borné, filtré sur le compte, et ne lit ni métadonnées ni empreinte', async () => {
    const prisma = prismaWith([]);
    await exportSecurityEvents(prisma as never, USER_ID, { limit: 50, offset: 10 });
    const call = prisma.securityEvent.findMany.mock.calls[0][0] as { select: Record<string, boolean>; where: unknown; take: number; skip: number };

    expect(call.where).toMatchObject({ userId: USER_ID, createdAt: { gte: expect.any(Date) } });
    expect(call.take).toBe(50);
    expect(call.skip).toBe(10);
    expect(call.select).toEqual({
      id: true, eventType: true, severity: true, status: true, description: true,
      ipAddress: true, userAgent: true, geoLocation: true, createdAt: true,
    });
  });

  it('déclare au schéma chaque colonne lue', () => {
    expect(Object.keys(securityEventExportItemSchema.properties).sort()).toEqual(
      ['createdAt', 'description', 'eventType', 'geoLocation', 'id', 'ipAddress', 'severity', 'status', 'userAgent'],
    );
  });
});
