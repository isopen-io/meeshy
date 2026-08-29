/**
 * Le carnet d'adresses se lit par DELTA, jamais en entier (#4163).
 *
 * Trois routes synchronisaient et lisaient le carnet, et **le répertoire entier
 * était retéléchargé à chaque revalidation** : iOS paginait par 200 jusqu'à 250
 * pages, sans delta ni ETag, et faisait suivre CHAQUE synchronisation d'une
 * relecture complète.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { directoryContactsRoutes, LIMITE_MAX_CONTACTS } from '../../../../routes/directory/contacts';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';

/** Deux lignes, dont une SEULE a bougé après la borne du delta. */
const ANCIENNE = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa', contactKey: 'k1', displayName: 'Ancien',
  phoneNumbers: [], emails: [], usernames: [], matchedBy: null, matchedAt: null,
  lastSyncedAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'), matchedUser: null,
};
const RECENTE = {
  id: 'bbbbbbbbbbbbbbbbbbbbbbbb', contactKey: 'k2', displayName: 'Récent',
  phoneNumbers: [], emails: [], usernames: [], matchedBy: null, matchedAt: null,
  lastSyncedAt: new Date('2026-08-28'), updatedAt: new Date('2026-08-28'), matchedUser: null,
};

function prismaDouble() {
  return {
    userContact: {
      // Le double APPLIQUE le filtre chronologique : sans cela, le témoin de
      // delta passerait au vert sur une requête qui ne filtre rien.
      findMany: jest.fn<any>(async (args: any) => {
        const borne = args?.where?.updatedAt?.gt as Date | undefined;
        const lignes = [ANCIENNE, RECENTE];
        return borne ? lignes.filter((l) => l.updatedAt > borne) : lignes;
      }),
      count: jest.fn<any>(async () => 2),
      deleteMany: jest.fn<any>(async () => ({ count: 2 })),
      upsert: jest.fn<any>(async () => ({})),
    },
    user: {
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
      findMany: jest.fn<any>(async () => []),
    },
    friendRequest: { findMany: jest.fn<any>(async () => []) },
  };
}

async function monter() {
  const prisma = prismaDouble();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true, type: 'user', userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
  });
  await app.register(directoryContactsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, prisma };
}

describe('La lecture est BORNÉE par la route, pas seulement par le service', () => {
  it(`refuse limit=500 — le service rabotait à 200 en SILENCE`, async () => {
    // Subtilité de placement : un témoin posé sur `ContactDirectoryService`
    // passerait au vert sans rien prouver, puisque le service borne déjà. C'est
    // le CONTRAT de la route qui doit rougir — un client qui demandait 500 en
    // recevait 200 sans jamais l'apprendre, et paginait ensuite sur une taille
    // qu'il ne connaissait pas.
    const { app, prisma } = await monter();

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/contacts?limit=500` });

    expect(res.statusCode).toBe(400);
    expect(prisma.userContact.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it(`accepte le plafond exact (${LIMITE_MAX_CONTACTS})`, async () => {
    const { app } = await monter();

    expect((await app.inject({ method: 'GET', url: `${PREFIXE}/contacts?limit=${LIMITE_MAX_CONTACTS}` })).statusCode).toBe(200);
    await app.close();
  });
});

describe('Le DELTA ne rend que ce qui a bougé', () => {
  it('avec `updatedSince`, seules les lignes postérieures reviennent', async () => {
    const { app, prisma } = await monter();

    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/contacts?updatedSince=${encodeURIComponent('2026-08-15T00:00:00.000Z')}`,
    });

    expect(res.statusCode).toBe(200);
    const ids = (res.json().data as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual([RECENTE.id]);

    // Et la BORNE est bien dans la requête : le filtre doit être fait par
    // l'index, pas par un tri en mémoire après un balayage complet — c'est tout
    // l'intérêt du delta.
    const where = (prisma.userContact.findMany as any).mock.calls[0][0].where;
    expect(where.updatedAt.gt).toBeInstanceOf(Date);
    await app.close();
  });

  it('sans `updatedSince`, le carnet entier est parcouru — et ordonné par le produit', async () => {
    const { app, prisma } = await monter();

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/contacts` });

    expect((res.json().data as unknown[]).length).toBe(2);
    const args = (prisma.userContact.findMany as any).mock.calls[0][0];
    expect(args.where.updatedAt).toBeUndefined();
    // Les contacts présents sur Meeshy d'abord : ce sont les seuls sur lesquels
    // l'utilisateur peut agir.
    expect(JSON.stringify(args.orderBy)).toContain('matchedUserId');
    await app.close();
  });

  it('refuse une borne illisible plutôt que de la traiter comme absente', async () => {
    const { app } = await monter();

    expect((await app.inject({ method: 'GET', url: `${PREFIXE}/contacts?updatedSince=pas-une-date` })).statusCode).toBe(400);
    await app.close();
  });

  it('ne demande AUCUN dénombrement — la page par décalage repayait un `count()` par page', async () => {
    const { app, prisma } = await monter();

    await app.inject({ method: 'GET', url: `${PREFIXE}/contacts` });

    expect(prisma.userContact.count).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('Le cache conditionnel', () => {
  it('rend 304 sur un `If-None-Match` inchangé', async () => {
    const { app } = await monter();

    const premier = await app.inject({ method: 'GET', url: `${PREFIXE}/contacts` });
    const etag = premier.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/contacts`,
      headers: { 'if-none-match': etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });
});

describe('Le mode est le VERBE', () => {
  const corps = (extra: Record<string, unknown> = {}) => ({
    contacts: [{ displayName: 'A', phoneNumbers: ['+33600000000'], emails: [], usernames: [] }],
    ...extra,
  });

  it('`PUT` remplace, `PATCH` fusionne — et aucun ne lit un `mode` dans le corps', async () => {
    const { app } = await monter();

    const remplace = await app.inject({
      method: 'PUT', url: `${PREFIXE}/contacts`,
      headers: { 'content-type': 'application/json' },
      // Un `mode` dans le corps est IGNORÉ : c'est le verbe qui décide.
      body: JSON.stringify(corps({ mode: 'merge' })),
    });
    const fusionne = await app.inject({
      method: 'PATCH', url: `${PREFIXE}/contacts`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps({ mode: 'replace' })),
    });

    expect(remplace.statusCode).toBe(200);
    expect(fusionne.statusCode).toBe(200);
    await app.close();
  });

  it("la réponse d'écriture porte `appliedAt` — la relecture complète devient inutile", async () => {
    // Une synchronisation était TOUJOURS suivie d'une relecture entière du
    // carnet. Ce filigrane est ce qu'on repasse en `updatedSince` pour ne
    // relire que ce qui a bougé.
    const { app } = await monter();

    const res = await app.inject({
      method: 'PATCH', url: `${PREFIXE}/contacts`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps()),
    });

    const data = res.json().data as { appliedAt?: string; syncStartedAt?: string };
    expect(data.appliedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(data.appliedAt!))).toBe(false);
    await app.close();
  });

  it("refuse un `syncStartedAt` dans le FUTUR — une horloge cliente en avance purgerait le carnet", async () => {
    const { app } = await monter();

    const res = await app.inject({
      method: 'PUT', url: `${PREFIXE}/contacts`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps({ syncStartedAt: new Date(Date.now() + 3_600_000).toISOString() })),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("Un lot TRONQUÉ ne peut jamais être final", () => {
  it('un envoi au-delà de la borne ne purge pas, même marqué `isFinalBatch`', async () => {
    // `normalizeContacts` jette des fiches en silence au-delà de la borne :
    // aucun lot ne les a touchées, donc purger sur ce lot amputerait le carnet
    // de données qu'aucun envoi n'a reçues.
    const { app, prisma } = await monter();
    const trop = Array.from({ length: 2_500 }, (_, i) => ({
      displayName: `C${i}`, phoneNumbers: [`+3360000${String(i).padStart(4, '0')}`], emails: [], usernames: [],
    }));

    const res = await app.inject({
      method: 'PUT', url: `${PREFIXE}/contacts`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contacts: trop, isFinalBatch: true, syncStartedAt: new Date().toISOString() }),
    });

    expect(res.statusCode).toBe(200);
    // Aucune purge : `deleteMany` n'est appelé que par un lot FINAL non tronqué.
    expect(prisma.userContact.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });
});
