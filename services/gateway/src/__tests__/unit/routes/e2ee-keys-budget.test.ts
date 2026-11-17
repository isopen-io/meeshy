/**
 * Constat GW-01 de la revue E2EE du 2026-11-17 (#18906) — `GET
 * /e2ee/keys/:userId` réserve une pré-clé UNIQUE par appareil de la cible, et sa
 * limite de route ne bornait que le COUPLE (demandeur, cible) : un seul compte,
 * d'une seule IP, réservait 330 bundles en une minute sur 11 cibles, chacune
 * perdant 30 pré-clés. Deux budgets désormais :
 *
 * - par DEMANDEUR, toutes cibles confondues : au-delà, `429
 *   E2EE_KEYS_BUDGET_EXCEEDED` avec `Retry-After` ;
 * - par CIBLE, tous demandeurs confondus : au-delà, le bundle est de DERNIER
 *   RECOURS (aucune pré-clé unique consommée, comme un stock vide) — jamais un
 *   refus, qui rendrait la cible injoignable, et jamais une pré-clé déjà réservée
 *   resservie.
 *
 * Soi-même n'est compté dans aucun seau. La contre-analyse AFFIRMAIT le défaut
 * (330 réponses 200, 70 pré-clés restantes par cible) ; le témoin est inversé ici.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { registerE2EERoutes } from '../../../routes/e2ee';
import { createE2EEDirectory } from '../../../services/e2ee/E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../../../services/e2ee/E2EEEnvelopeRelay';
import { createKeyReservationBudget, E2EE_KEY_RESERVATION_BUDGET } from '../../../services/e2ee/key-reservation-budget';
import { createFakeE2EEStore, type FakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from '../../../services/e2ee/__tests__/fake-signatures';

const oid = (n: number) => n.toString(16).padStart(24, '0');
const REQUESTER = oid(0xa1);

async function enrolled(store: FakeE2EEStore, userId: string, oneTime: number): Promise<void> {
  const sessionId = oid(0x9000 + parseInt(userId.slice(-4), 16));
  store.collections.UserSession.insert({ id: sessionId, userId, isValid: true, expiresAt: new Date(Date.now() + 86_400_000) });
  const keys = fakeDeviceKeys({ oneTime, kyber: oneTime });
  await createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier }).enrollDevice({
    userId,
    sessionId,
    request: {
      registrationId: keys.registrationId, identityKey: keys.identityKey, signedPreKey: keys.signedPreKey,
      kyberLastResort: keys.kyberLastResort, platform: 'ios', binding: keys.binding(userId),
      oneTimePreKeys: keys.oneTimePreKeys, kyberPreKeys: keys.kyberPreKeys,
    } as never,
  });
}

/** Le demandeur de chaque requête est nommé par l'en-tête `x-test-user` (le banc ne connaît pas les JWT). */
async function appOver(store: FakeE2EEStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  registerE2EERoutes(app, {
    auth: async (request: FastifyRequest) => {
      const userId = String(request.headers['x-test-user'] ?? REQUESTER);
      (request as unknown as { authContext: unknown }).authContext = {
        isAuthenticated: true, isAnonymous: false, userId, sessionId: oid(0x7000 + parseInt(userId.slice(-4), 16)),
      };
    },
    directory: createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier }),
    relay: createE2EEEnvelopeRelay({ prisma: store.prisma as never }),
    mayReadKeysOf: async () => true,
    closeSession: async () => true,
    keyBudget: createKeyReservationBudget(),
  });
  await app.ready();
  return app;
}

const bundle = (app: FastifyInstance, target: string, requester = REQUESTER) =>
  app.inject({ method: 'GET', url: `/e2ee/keys/${target}`, headers: { 'x-test-user': requester } });

const unusedEcOf = (store: FakeE2EEStore, userId: string) =>
  store.collections.E2EEOneTimePreKey.rows.filter((row) => row.userId === userId && row.kind === 'ec' && row.usedAt === null).length;

describe('GW-01 — un demandeur a un budget de bundles, toutes cibles confondues', () => {
  it(`le ${E2EE_KEY_RESERVATION_BUDGET.requesterPerMinute + 1}e bundle de la minute, cibles confondues, rend 429 avec Retry-After`, async () => {
    const store = createFakeE2EEStore();
    const targets = Array.from({ length: 11 }, (_, i) => oid(0x1000 + i));
    for (const target of targets) await enrolled(store, target, 8);
    const app = await appOver(store);

    const statuses: number[] = [];
    for (const target of targets) {
      for (const _attempt of Array.from({ length: 6 })) statuses.push((await bundle(app, target)).statusCode);
    }
    const refused = await bundle(app, targets[0]);

    expect(statuses.slice(0, E2EE_KEY_RESERVATION_BUDGET.requesterPerMinute).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(E2EE_KEY_RESERVATION_BUDGET.requesterPerMinute).every((status) => status === 429)).toBe(true);
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ success: false, code: E2EE_ERROR_CODES.KEYS_BUDGET_EXCEEDED });
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    await app.close();
  });

  it('ses propres appareils ne comptent pas : soixante lectures de soi laissent lire un correspondant', async () => {
    const store = createFakeE2EEStore();
    const correspondent = oid(0x1100);
    await enrolled(store, REQUESTER, 4);
    await enrolled(store, correspondent, 4);
    const app = await appOver(store);

    for (const _attempt of Array.from({ length: E2EE_KEY_RESERVATION_BUDGET.requesterPerMinute })) await bundle(app, REQUESTER);

    expect((await bundle(app, correspondent)).statusCode).toBe(200);
    await app.close();
  });
});

describe('GW-01 — une cible a un budget de pré-clés uniques, tous demandeurs confondus', () => {
  it('au-delà, chacun reçoit un bundle de dernier recours : la cible reste joignable et son stock cesse de fondre', async () => {
    const store = createFakeE2EEStore();
    const target = oid(0x2000);
    const perHour = E2EE_KEY_RESERVATION_BUDGET.targetPerHour;
    await enrolled(store, target, perHour + 10);
    const app = await appOver(store);

    const responses = [];
    for (const index of Array.from({ length: perHour + 5 }, (_, i) => i)) responses.push(await bundle(app, target, oid(0x3000 + index)));
    const bundles = responses.map((res) => res.json().data.devices[0]);

    expect(responses.every((res) => res.statusCode === 200)).toBe(true);
    expect(bundles.slice(0, perHour).every((device) => device.preKey !== null && device.kyberPreKey.lastResort === false)).toBe(true);
    expect(bundles.slice(perHour).every((device) => device.preKey === null && device.kyberPreKey.lastResort === true)).toBe(true);
    expect(unusedEcOf(store, target)).toBe(10);
    const reserved = bundles.flatMap((device) => (device.preKey ? [device.preKey.keyId] : []));
    expect(new Set(reserved).size).toBe(reserved.length);
    await app.close();
  });
});
