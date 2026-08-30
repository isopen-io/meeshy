/**
 * L'annuaire public ne dit plus si une adresse a un compte (#4158).
 *
 * `GET /auth/check-availability` confirmait **sans compte** qu'un pseudo, une
 * adresse e-mail **ou un numéro** appartient à un utilisateur Meeshy — alors
 * que `/forgot-password` et `/magic-link/request` répondent délibérément
 * « succès » dans tous les cas pour ne rien révéler. La même plateforme
 * appliquait deux doctrines opposées à la même question.
 *
 * Elle coûtait par ailleurs jusqu'à TREIZE requêtes Prisma par appel, dont
 * quatre `findFirst` **sans `select`** : chacun chargeait la ligne `User`
 * entière — hash de mot de passe et secrets 2FA compris — pour répondre à une
 * question binaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: async () => ({ geoData: { country: 'FR' } }),
}));

import { directoryAvailabilityRoutes, candidatsDePseudo } from '../../../routes/directory/availability';

const PREFIXE = '/api/v1/directory';

function buildApp(options: { pseudoPris?: boolean; candidatsPris?: string[] } = {}) {
  const findFirst = jest.fn<any>(async () => (options.pseudoPris ? { id: 'u-1' } : null));
  const findMany = jest.fn<any>(async () => (options.candidatsPris ?? []).map((username) => ({ username })));
  return {
    prisma: { user: { findFirst, findMany } },
    findFirst,
    findMany,
  };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  await app.register(directoryAvailabilityRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const appeler = (app: FastifyInstance, q: string) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/availability?${q}` });

describe('L’adresse et le numéro ne répondent QUE sur la forme', () => {
  it('ne dit jamais « taken » pour une adresse, fût-elle celle d’un compte existant', async () => {
    const { prisma, findFirst } = buildApp({ pseudoPris: true });
    const app = await monter(prisma);

    const res = await appeler(app, 'email=deja.inscrit%40exemple.test');

    expect(res.statusCode).toBe(200);
    const { email } = res.json().data;
    // L'affirmation centrale : `valid`, jamais `taken`.
    expect(email.status).toBe('valid');
    expect(JSON.stringify(email)).not.toContain('taken');
    // Et la base n'est pas même interrogée sur l'adresse : ce qui n'est pas
    // demandé ne peut pas fuir.
    expect(findFirst).not.toHaveBeenCalled();

    await app.close();
  });

  it('ne dit jamais « taken » pour un numéro, et rend sa forme E.164', async () => {
    const { prisma, findFirst } = buildApp({ pseudoPris: true });
    const app = await monter(prisma);

    const res = await appeler(app, 'phoneNumber=%2B33612345678');

    const { phoneNumber } = res.json().data;
    expect(phoneNumber.status).toBe('valid');
    expect(phoneNumber.e164).toBe('+33612345678');
    expect(JSON.stringify(phoneNumber)).not.toContain('taken');
    expect(findFirst).not.toHaveBeenCalled();

    await app.close();
  });

  it('distingue une adresse MAL FORMÉE, sans rien dire de son existence', async () => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await appeler(app, 'email=pas-une-adresse');

    expect(res.json().data.email.status).toBe('invalid');

    await app.close();
  });
});

describe('Le pseudo, lui, répond bien sur l’existence', () => {
  it('dit « available » quand personne ne le porte', async () => {
    const { prisma } = buildApp({ pseudoPris: false });
    const app = await monter(prisma);

    const res = await appeler(app, 'username=libre');

    expect(res.json().data.username.status).toBe('available');

    await app.close();
  });

  it('dit « taken » et propose des rechanges LIBRES', async () => {
    const candidats = candidatsDePseudo('pris');
    const { prisma } = buildApp({ pseudoPris: true, candidatsPris: [candidats[0]] });
    const app = await monter(prisma);

    const res = await appeler(app, 'username=pris');

    const { status, suggestions } = res.json().data.username;
    expect(status).toBe('taken');
    expect(suggestions).not.toContain(candidats[0]);
    expect(suggestions.length).toBeGreaterThan(0);

    await app.close();
  });
});

describe('Le coût par appel', () => {
  it('teste l’existence SANS charger la ligne — le hash de mot de passe ne quitte pas la base', async () => {
    const { prisma, findFirst } = buildApp({ pseudoPris: false });
    const app = await monter(prisma);

    await appeler(app, 'username=quelconque');

    const args = findFirst.mock.calls[0][0] as { select?: Record<string, unknown> };
    // Sans `select`, Prisma rend la ligne ENTIÈRE : `password`,
    // `twoFactorSecret`, `twoFactorBackupCodes`. Pour une question binaire.
    expect(args.select).toEqual({ id: true });

    await app.close();
  });

  it('teste les six rechanges en UNE requête, pas dix tirages', async () => {
    const { prisma, findMany } = buildApp({ pseudoPris: true });
    const app = await monter(prisma);

    await appeler(app, 'username=pris');

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0] as { where: any; select: unknown };
    expect(args.where.username.in).toHaveLength(6);
    expect(args.select).toEqual({ username: true });

    await app.close();
  });

  it('ne coûte RIEN à la base quand seule la forme est demandée', async () => {
    const { prisma, findFirst, findMany } = buildApp();
    const app = await monter(prisma);

    await appeler(app, 'email=a%40b.co&phoneNumber=%2B33612345678');

    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('Le contrat', () => {
  it('refuse un appel sans aucun identifiant', async () => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await appeler(app, '');

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('rend les trois verdicts en UN appel — iOS en faisait trois', async () => {
    const { prisma } = buildApp({ pseudoPris: false });
    const app = await monter(prisma);

    const res = await appeler(app, 'username=x&email=a%40b.co&phoneNumber=%2B33612345678');

    const data = res.json().data;
    expect(data.username.status).toBe('available');
    expect(data.email.status).toBe('valid');
    expect(data.phoneNumber.status).toBe('valid');

    await app.close();
  });
});
