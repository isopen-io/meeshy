/**
 * Un clic sur un lien de suivi fait bouger les chiffres de son créateur, en temps
 * réel (#19446) — après l'écriture, hors de la redirection, dans sa seule room.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../middleware/admin-permissions.middleware', () => ({ requireAnalyticsPermission: jest.fn() }));
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: { authContext?: unknown }) => {
    req.authContext = { isAuthenticated: false, type: 'anonymous', anonymousUser: null, registeredUser: null };
  }),
  isRegisteredUser: jest.fn().mockReturnValue(false),
  UnifiedAuthRequest: {},
}));

const UPDATED = {
  id: 'tl-1', token: 'abc123', createdBy: 'u-owner', totalClicks: 42, uniqueClicks: 30,
  lastClickedAt: new Date('2026-11-17T10:00:00.000Z'), originalUrl: 'https://example.com/p', isActive: true, expiresAt: null,
};
const recordClick = jest.fn<(a: Record<string, unknown>) => Promise<unknown>>();
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: async () => UPDATED,
    recordClick: (a: Record<string, unknown>) => recordClick(a),
  })),
  resolveFrontendBaseUrl: () => 'https://meeshy.me',
}));

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';

function makeIO() {
  const sent: [string, string, unknown][] = [];
  const io = { to: (room: string) => ({ emit: (event: string, data: unknown) => { sent.push([room, event, data]); } }) };
  return { io, sent };
}

async function build(io: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async () => {});
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as never);
  await registerTrackingRoutes(app);
  await app.ready();
  return app;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  recordClick.mockReset();
  recordClick.mockResolvedValue({
    trackingLink: UPDATED,
    click: { id: 'clk-1', country: 'SN', ipAddress: '41.82.1.2', deviceFingerprint: 'fp', participantId: 'visitor' },
  });
});

describe('le clic annoncé au créateur du lien', () => {
  it('GET /l/:token redirige, puis pose les totaux absolus dans la seule room du créateur', async () => {
    const { io, sent } = makeIO();
    const app = await build(io);
    const res = await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'cf-ipcountry': 'SN' } });
    expect(res.statusCode).toBe(302);
    await tick();
    expect(sent).toEqual([[
      'user:u-owner',
      'tracking-link:clicked',
      { token: 'abc123', totalClicks: 42, uniqueClicks: 30, lastClickedAt: '2026-11-17T10:00:00.000Z', country: 'SN' },
    ]]);
    await app.close();
  });

  it('POST /tracking-links/:token/click annonce aussi, sans rien du visiteur', async () => {
    const { io, sent } = makeIO();
    const app = await build(io);
    const res = await app.inject({ method: 'POST', url: '/tracking-links/abc123/click', payload: {} });
    expect(res.statusCode).toBe(200);
    await tick();
    expect(sent.map(([room, event]) => [room, event])).toEqual([['user:u-owner', 'tracking-link:clicked']]);
    expect(JSON.stringify(sent)).not.toMatch(/41\.82|fp|visitor|clk-1/);
    await app.close();
  });
});
