/**
 * #19463 — `POST /api/v1/me/live-activity-tokens` : le jeton d'une Activité en direct de partage
 * de position. Corps validé à la frontière (Zod), lecteur = le compte authentifié (jamais un champ
 * du corps), refus `404 LIVE_ACTIVITY_NOT_SHARED` à qui n'est pas servi, et le jeton ne revient pas.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const mockRegister = jest.fn<(...args: unknown[]) => Promise<{ expiresAt: string } | null>>();
jest.mock('../../../../services/sharedLocation/sharedLocationLiveActivity', () => ({
  registerSharedLocationLiveActivityToken: (...args: unknown[]) => mockRegister(...args),
}));
jest.mock('../../../../services/sharedLocation/sharedLocationDeps', () => ({
  sharedLocationRelayDepsOf: () => ({ relais: true }),
}));

import Fastify from 'fastify';
import liveActivityTokensMeRoutes from '../../../../routes/me/live-activity-tokens';

const MOI = '6300000000000000000000a1';
const SUJET = '6300000000000000000000e1';
const JETON = 'ab'.repeat(40);
const FIN = '2026-11-17T11:00:00.000Z';

async function appli() {
  const app = Fastify();
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async (request: { user?: unknown }) => {
    request.user = { userId: MOI };
  });
  await app.register(liveActivityTokensMeRoutes, { prefix: '/api/v1/me' });
  return app;
}

const poster = async (body: unknown) => {
  const app = await appli();
  return app.inject({ method: 'POST', url: '/api/v1/me/live-activity-tokens', payload: body as Record<string, unknown> });
};

beforeEach(() => mockRegister.mockReset());

describe('POST /me/live-activity-tokens', () => {
  it('un lecteur servi enregistre son jeton : la réponse ne dit que l\'échéance', async () => {
    mockRegister.mockResolvedValue({ expiresAt: FIN });
    const res = await poster({ kind: 'shared-location', subjectUserId: SUJET, token: JETON });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { expiresAt: FIN } });
    expect(res.body).not.toContain(JETON);
    expect(mockRegister).toHaveBeenCalledWith({ relais: true }, { readerId: MOI, registration: { kind: 'shared-location', subjectUserId: SUJET, token: JETON } });
  });

  it('qui n\'est pas servi reçoit 404 LIVE_ACTIVITY_NOT_SHARED', async () => {
    mockRegister.mockResolvedValue(null);
    const res = await poster({ kind: 'shared-location', subjectUserId: SUJET, token: JETON });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, code: 'LIVE_ACTIVITY_NOT_SHARED' });
  });

  it('un corps illisible ou porteur d\'un champ inconnu est refusé avant toute lecture', async () => {
    for (const body of [
      { kind: 'call', subjectUserId: SUJET, token: JETON },
      { kind: 'shared-location', subjectUserId: 'x', token: JETON },
      { kind: 'shared-location', subjectUserId: SUJET, token: JETON, readerId: SUJET },
    ]) {
      const res = await poster(body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'LIVE_ACTIVITY_TOKEN_INVALID' });
    }
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('une panne rend 500, sans détail', async () => {
    mockRegister.mockRejectedValue(new Error('redis injoignable'));
    const res = await poster({ kind: 'shared-location', subjectUserId: SUJET, token: JETON });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('redis');
  });
});
