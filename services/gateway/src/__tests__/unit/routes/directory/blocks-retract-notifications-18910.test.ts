/**
 * #18910 (serveur-notifications-5) — bloquer retire les notifications de l'autre
 * des deux listes, et le fait aussi au REJEU.
 *
 * Côté bloqueur (acteur = la cible) : tous les types, annoncés. Côté bloqué
 * (acteur = moi) : seulement le contenu de l'acteur, et l'appel dit qu'il ne
 * doit RIEN annoncer — une disparition en direct apprendrait le blocage au
 * bloqué, que cette route veut taire.
 *
 * Best-effort : une panne du retrait ne fait jamais échouer un blocage déjà écrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

import { ritualSharesStore } from '../../../helpers/ritual-shares-store';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn(async () => undefined) }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: any) => args.op()),
}));
jest.mock('../../../../services/together/togetherDeps', () => ({
  rejudgeTogetherAfter: jest.fn(async () => undefined),
}));

import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439099';
const CIBLE = '507f1f77bcf86cd799439011';

async function monter(options: { bloques?: string[]; retraitEnPanne?: boolean; sansService?: boolean; retraitSansFin?: boolean } = {}) {
  const etat = { bloques: [...(options.bloques ?? [])] };
  const prisma = {
    user: {
      findUnique: jest.fn<any>(async (args: any) =>
        args?.where?.id === MOI ? { blockedUserIds: etat.bloques } : { id: args?.where?.id }
      ),
      update: jest.fn<any>(async (args: any) => {
        if (args?.data?.blockedUserIds?.push) etat.bloques = [...etat.bloques, args.data.blockedUserIds.push];
        return {};
      }),
    },
    relationFeatureSetting: ritualSharesStore([]).relationFeatureSetting,
  };
  const retractNotificationsFromActor = jest.fn<any>(async () => {
    if (options.retraitEnPanne) throw new Error('mongo down');
    if (options.retraitSansFin) await new Promise(() => undefined);
    return 1;
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  if (!options.sansService) app.decorate('notificationService', { retractNotificationsFromActor } as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryBlocksRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, retractNotificationsFromActor };
}

const bloquer = (app: Awaited<ReturnType<typeof monter>>['app']) =>
  app.inject({ method: 'PUT', url: `${PREFIXE}/blocks/${CIBLE}` });

describe('PUT /directory/blocks/:userId retire les notifications de la paire (#18910)', () => {
  it('côté bloqueur : tous les types de la cible, annoncés', async () => {
    const { app, retractNotificationsFromActor } = await monter();

    expect((await bloquer(app)).statusCode).toBe(200);

    expect(retractNotificationsFromActor).toHaveBeenCalledWith(MOI, CIBLE);
    await app.close();
  });

  it('côté bloqué : seulement le contenu de l’acteur, sans rien annoncer au bloqué', async () => {
    const { app, retractNotificationsFromActor } = await monter();

    await bloquer(app);

    expect(retractNotificationsFromActor).toHaveBeenCalledWith(CIBLE, MOI, 'actor-content');
    await app.close();
  });

  it('au REJEU d’un blocage déjà posé : le retrait repasse, il solde une panne passée', async () => {
    const { app, retractNotificationsFromActor } = await monter({ bloques: [CIBLE] });

    expect((await bloquer(app)).statusCode).toBe(200);

    expect(retractNotificationsFromActor).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('une panne du retrait ne fait pas échouer le blocage déjà écrit', async () => {
    const { app } = await monter({ retraitEnPanne: true });

    const res = await bloquer(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.blocked).toBe(true);
    await app.close();
  });

  it('la réponse n’attend pas le retrait : des années de notifications ne retiennent pas le geste de blocage', async () => {
    const { app, retractNotificationsFromActor } = await monter({ retraitSansFin: true });

    const res = await bloquer(app);

    expect(res.statusCode).toBe(200);
    expect(retractNotificationsFromActor).toHaveBeenCalledWith(MOI, CIBLE);
    await app.close();
  });

  it('sans service de notifications câblé, le blocage réussit', async () => {
    const { app } = await monter({ sansService: true });

    expect((await bloquer(app)).statusCode).toBe(200);
    await app.close();
  });
});
