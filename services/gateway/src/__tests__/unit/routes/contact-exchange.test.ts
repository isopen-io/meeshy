/**
 * LE PARTAGE SANS CONTACT PAR REST (#19205) — `POST /me/contact-exchange` puis
 * `POST /contact-exchange/:token/accept`. Le drapeau `CONTACT_EXCHANGE_ENABLED` éteint, les deux
 * routes n'existent pas. Allumé : la réponse traverse le VRAI sérialiseur — rien de ce que la
 * vitrine n'a pas déclaré ne sort —, la demande part de l'émetteur vers le lecteur sans emporter
 * l'idempotence du lecteur, et l'émetteur reçoit l'accusé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { ...logger, child: () => logger } };
});
jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const cache = new Map<string, string>();
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (key: string) => cache.get(key) ?? null,
    set: async (key: string, value: string) => { cache.set(key, value); },
    setnx: async (key: string, value: string) => {
      if (cache.has(key)) return false;
      cache.set(key, value);
      return true;
    },
    del: async (key: string) => { cache.delete(key); },
    getNativeClient: () => null,
  }),
}));

const demandes: Array<{ emetteurId: string; receveurId: string; clientMutationId: unknown; viewer: unknown }> = [];
jest.mock('../../../routes/directory/friend-requests-core', () => ({
  envoyerDemande: async (_fastify: unknown, request: { clientMutationId?: unknown; user?: { userId: string } }, params: { emetteurId: string; receveurId: string }) => {
    demandes.push({ ...params, clientMutationId: request.clientMutationId, viewer: request.user?.userId });
    return { valeur: { id: 'fr1' } };
  },
}));

let contactRequests = true;
jest.mock('../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, { allowContactRequests: contactRequests }])),
}));

jest.mock('../../../routes/users/public-profile', () => {
  const actual = jest.requireActual('../../../routes/users/public-profile') as Record<string, unknown>;
  return {
    ...actual,
    composePublicProfile: async (_fastify: unknown, _request: unknown, user: { id: string; username: string }) => ({
      id: user.id, username: user.username, bio: 'Programmatrice de festival.', email: 'fuite@exemple.fr', phoneNumber: '+33600000000',
    }),
  };
});

import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import contactExchangeRoutes from '../../../routes/contact-exchange';
import { freezeClock, thawClock } from '../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, type BringAppOptions, type BringTestApp } from '../../helpers/bring-app';

const appli = (options: BringAppOptions = {}, cmid?: string): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    a.addHook('onRequest', async (req) => { Object.assign(req, { clientMutationId: cmid }); });
    await a.register(contactExchangeRoutes, { prefix: '/api/v1' });
  }, options);

beforeEach(() => {
  cache.clear();
  demandes.length = 0;
  contactRequests = true;
  process.env.CONTACT_EXCHANGE_ENABLED = 'true';
  freezeClock(NOW);
});
afterEach(() => {
  delete process.env.CONTACT_EXCHANGE_ENABLED;
  thawClock();
});

describe('le partage sans contact par REST (#19205)', () => {
  it('drapeau éteint : les deux routes répondent comme des routes absentes, rien n\'est rangé', async () => {
    delete process.env.CONTACT_EXCHANGE_ENABLED;
    const app = await appli();
    const emis = await app.call('POST', '/api/v1/me/contact-exchange', { offers: ['vitrine'] }, MOI);
    const lu = await app.call('POST', `/api/v1/contact-exchange/ce1.${'A'.repeat(22)}.1.1790000000.${'b'.repeat(22)}/accept`, {}, AUTRE);
    await app.close();

    expect(emis.status).toBe(404);
    expect(lu.status).toBe(404);
    expect(cache.size).toBe(0);
  });

  it('émettre puis accepter : la vitrine déclarée seule, la demande de l\'émetteur au lecteur, l\'accusé à l\'émetteur', async () => {
    const app = await appli();
    const emis = await app.call('POST', '/api/v1/me/contact-exchange', { offers: ['vitrine', 'friendRequest'] }, MOI);
    const token = emis.body.data.token as string;
    const lu = await app.call('POST', `/api/v1/contact-exchange/${token}/accept`, {}, AUTRE);
    const rejoue = await app.call('POST', `/api/v1/contact-exchange/${token}/accept`, {}, AUTRE);
    await app.close();

    expect(emis).toMatchObject({ status: 200, body: { success: true, data: { offers: ['vitrine', 'friendRequest'], locked: ['phone'] } } });
    expect(Object.keys(emis.body.data).sort()).toEqual(['expiresAt', 'locked', 'offers', 'token']);
    expect(lu.status).toBe(200);
    expect(lu.body.data).toEqual({
      issuer: { id: MOI, username: app.users.get(MOI)!.username, displayName: app.users.get(MOI)!.displayName, avatar: null },
      offers: ['vitrine', 'friendRequest'],
      profile: { id: MOI, username: app.users.get(MOI)!.username, bio: 'Programmatrice de festival.' },
      friendRequest: 'sent',
      locked: ['phone'],
    });
    expect(demandes).toEqual([{ emetteurId: MOI, receveurId: AUTRE, clientMutationId: undefined, viewer: AUTRE }]);
    expect(app.emissions).toEqual([
      expect.objectContaining({ room: ROOMS.user(MOI), event: SERVER_EVENTS.CONTACT_EXCHANGE_RECEIVED }),
    ]);
    expect(rejoue).toMatchObject({ status: 404, body: { code: 'CONTACT_EXCHANGE_UNAVAILABLE' } });
  });

  it('l\'idempotence du lecteur ne voyage pas sous le compte de l\'émetteur', async () => {
    const app = await appli({}, 'cmid-du-lecteur');
    const emis = await app.call('POST', '/api/v1/me/contact-exchange', { offers: ['friendRequest'] }, MOI);
    const res = await app.call('POST', `/api/v1/contact-exchange/${emis.body.data.token}/accept`, {}, AUTRE);
    await app.close();

    expect(res.status).toBe(200);
    expect(demandes[0].clientMutationId).toBeUndefined();
  });

  it('un émetteur qui bloque le lecteur : le même 404 générique qu\'un jeton inconnu', async () => {
    const app = await appli({ personnes: { [MOI]: { blockedUserIds: [AUTRE] } } });
    const emis = await app.call('POST', '/api/v1/me/contact-exchange', { offers: ['vitrine'] }, MOI);
    const bloque = await app.call('POST', `/api/v1/contact-exchange/${emis.body.data.token}/accept`, {}, AUTRE);
    const inconnu = await app.call('POST', '/api/v1/contact-exchange/nimporte/accept', {}, AUTRE);
    await app.close();

    expect(bloque).toEqual(inconnu);
    expect(bloque).toMatchObject({ status: 404, body: { code: 'CONTACT_EXCHANGE_UNAVAILABLE' } });
    expect(app.emissions).toEqual([]);
  });

  it('aucune offre ou le numéro : 400', async () => {
    const app = await appli();
    const vide = await app.call('POST', '/api/v1/me/contact-exchange', { offers: [] }, MOI);
    const numero = await app.call('POST', '/api/v1/me/contact-exchange', { offers: ['phone'] }, MOI);
    await app.close();

    expect(vide).toMatchObject({ status: 400, body: { code: 'CONTACT_EXCHANGE_INVALID' } });
    expect(numero).toMatchObject({ status: 400, body: { code: 'CONTACT_EXCHANGE_INVALID' } });
  });

  it('le débit est plafonné par compte : au-delà, 429', async () => {
    const app = await appli();
    const statuts: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuts.push((await app.call('POST', '/api/v1/contact-exchange/nimporte/accept', {}, AUTRE)).status);
    }
    await app.close();

    expect(statuts.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuts.slice(20)).toContain(429);
  });
});
