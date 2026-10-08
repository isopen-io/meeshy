/**
 * Audit L2-2 — **l'adresse et le lieu d'un TIERS ne sortent pas avec les
 * événements de sécurité du titulaire.** `PHONE_TRANSFER_INITIATED`,
 * `PHONE_TRANSFER_REGISTRATION_INITIATED` et `PHONE_TRANSFERRED_OUT` sont
 * écrits sur le compte du DÉTENTEUR du numéro avec l'adresse du DEMANDEUR :
 * l'export RGPD, la lecture du membre et la lecture d'administration servent
 * l'événement, jamais la trace du tiers. Les données stockées ne sont pas
 * réécrites.
 *
 * Audit L2-4 — le membre lit SES événements de sécurité
 * (`GET /me/security-events`), dont la fermeture par l'équipe Meeshy.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { exportSecurityEvents } from '../../../../routes/me/export-security';
import { securityEventsRoutes } from '../../../../routes/me/security-events';

const USER_ID = '507f1f77bcf86cd799439011';

const event = (eventType: string) => ({
  id: `e-${eventType}`,
  eventType,
  severity: 'MEDIUM',
  status: 'SUCCESS',
  description: 'd',
  ipAddress: '198.51.100.9',
  userAgent: 'Tiers/1.0',
  geoLocation: 'Lyon, France',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
});

const THIRD_PARTY = ['PHONE_TRANSFER_INITIATED', 'PHONE_TRANSFER_REGISTRATION_INITIATED', 'PHONE_TRANSFERRED_OUT'];

describe('export RGPD', () => {
  it.each(THIRD_PARTY)('%s : ne livre pas l’adresse du demandeur d’un transfert de numéro', async (type) => {
    const prisma = {
      userSession: { findMany: jest.fn(), count: jest.fn() },
      securityEvent: {
        findMany: jest.fn(async (_a: unknown) => [event(type), event('PASSWORD_RESET_SUCCESS')]),
        count: jest.fn(async (_a: unknown) => 2),
      },
    };
    const { items } = await exportSecurityEvents(prisma as never, USER_ID, { limit: 500, offset: 0 });
    expect(items[0]).toMatchObject({ ipAddress: null, geoLocation: null, userAgent: null });
    expect(items[1]).toMatchObject({ ipAddress: '198.51.100.9' });
  });
});

describe('GET /me/security-events', () => {
  const build = (rows: unknown[]) => {
    const prisma = {
      securityEvent: {
        findMany: jest.fn(async (_a: unknown) => rows),
        count: jest.fn(async (_a: unknown) => rows.length),
      },
    };
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    app.decorate('authenticate', async (request: { authContext: unknown }) => {
      request.authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
    });
    app.register(securityEventsRoutes);
    return { app, prisma };
  };

  it('sert les événements DU membre, sans métadonnées ni empreinte, et sans la trace d’un tiers', async () => {
    const { app, prisma } = build([
      { ...event('SESSION_CLOSED_BY_TEAM'), description: 'Session fermée par l’équipe Meeshy', ipAddress: null, userAgent: null, geoLocation: null },
      event('PHONE_TRANSFERRED_OUT'),
    ]);

    const res = await app.inject({ method: 'GET', url: '/security-events?offset=0&limit=20' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const call = prisma.securityEvent.findMany.mock.calls[0][0] as { where: unknown; select: Record<string, boolean>; take: number };
    expect(call.where).toEqual({ userId: USER_ID });
    expect(call.select).not.toHaveProperty('metadata');
    expect(call.select).not.toHaveProperty('deviceFingerprint');
    const body = res.json();
    expect(body.data[0]).toMatchObject({ eventType: 'SESSION_CLOSED_BY_TEAM', description: 'Session fermée par l’équipe Meeshy' });
    expect(body.data[1]).toMatchObject({ eventType: 'PHONE_TRANSFERRED_OUT', ipAddress: null, geoLocation: null });
    expect(body.pagination).toMatchObject({ total: 2, offset: 0, limit: 20, hasMore: false });
  });

  it('401 sans compte inscrit', async () => {
    const prisma = { securityEvent: { findMany: jest.fn(), count: jest.fn() } };
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    app.decorate('authenticate', async (request: { authContext: unknown }) => {
      request.authContext = { isAuthenticated: false, isAnonymous: true };
    });
    app.register(securityEventsRoutes);
    const res = await app.inject({ method: 'GET', url: '/security-events' });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(prisma.securityEvent.findMany).not.toHaveBeenCalled();
  });
});
