/**
 * Effacer son carnet d'adresses efface VRAIMENT — et n'efface que le SIEN (#8167).
 *
 * `DELETE /directory/contacts` retirait les fiches `UserContact` du demandeur,
 * mais laissait derrière elles les `ContactJoinNotice` qui en DÉRIVENT : une
 * ligne par personne du carnet déjà annoncée (« Marie a rejoint Meeshy »). Après
 * un effacement, le serveur savait donc encore QUI figurait dans ce carnet.
 *
 * Le double est une petite base EN MÉMOIRE qui applique le filtre `where` :
 * un double qui répondrait `{ count: n }` à toute requête passerait au vert sur
 * un `deleteMany({})` qui viderait les carnets de tout le monde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: jest.fn(),
}));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined, consume: async () => null }),
}));

import { directoryContactsRoutes } from '../../../../routes/directory/contacts';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const MARIE = '507f1f77bcf86cd799439033';

type Ligne = Record<string, string>;

function correspond(ligne: Ligne, where: Record<string, unknown> | undefined): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  return Object.entries(where).every(([champ, valeur]) => ligne[champ] === valeur);
}

function table(lignes: Ligne[]) {
  const etat = { lignes: [...lignes] };
  return {
    etat,
    deleteMany: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      const avant = etat.lignes.length;
      etat.lignes = etat.lignes.filter((ligne) => !correspond(ligne, args?.where));
      return { count: avant - etat.lignes.length };
    }),
  };
}

const CONNECTE = {
  isAuthenticated: true, type: 'user', userId: MOI,
  registeredUser: { id: MOI, role: 'USER' },
};
const ANONYME = { isAuthenticated: false, type: 'anonymous' };

async function monter(authContext: Record<string, unknown> = CONNECTE) {
  const userContact = table([
    { id: 'c1', ownerId: MOI },
    { id: 'c2', ownerId: MOI },
    { id: 'c3', ownerId: AUTRE },
  ]);
  const contactJoinNotice = table([
    { id: 'n1', recipientId: MOI, joinerId: MARIE },
    { id: 'n2', recipientId: AUTRE, joinerId: MARIE },
    { id: 'n3', recipientId: AUTRE, joinerId: MOI },
  ]);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { userContact, contactJoinNotice } as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext;
  });
  await app.register(directoryContactsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, userContact, contactJoinNotice };
}

describe('Effacer mon carnet (#8167)', () => {
  it("retire mes fiches ET les annonces qui en dérivent, et rend le nombre de fiches retirées", async () => {
    const { app, userContact, contactJoinNotice } = await monter();

    const res = await app.inject({ method: 'DELETE', url: `${PREFIXE}/contacts` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { removedCount: 2 } });
    expect(userContact.etat.lignes.filter((l) => l.ownerId === MOI)).toEqual([]);
    expect(contactJoinNotice.etat.lignes.filter((l) => l.recipientId === MOI)).toEqual([]);
    await app.close();
  });

  it("n'efface rien chez un autre, même quand la requête nomme son identifiant", async () => {
    const { app, userContact, contactJoinNotice } = await monter();

    const res = await app.inject({
      method: 'DELETE',
      url: `${PREFIXE}/contacts?ownerId=${AUTRE}&recipientId=${AUTRE}`,
    });

    expect(res.statusCode).toBe(200);
    expect(userContact.etat.lignes).toEqual([{ id: 'c3', ownerId: AUTRE }]);
    // L'annonce faite à l'AUTRE reste, et celle qui dit à l'autre que J'AI
    // rejoint n'appartient pas à mon carnet : elle reste aussi.
    expect(contactJoinNotice.etat.lignes).toEqual([
      { id: 'n2', recipientId: AUTRE, joinerId: MARIE },
      { id: 'n3', recipientId: AUTRE, joinerId: MOI },
    ]);
    await app.close();
  });

  it('refuse un demandeur non authentifié sans rien effacer', async () => {
    const { app, userContact, contactJoinNotice } = await monter(ANONYME);

    const res = await app.inject({ method: 'DELETE', url: `${PREFIXE}/contacts` });

    expect(res.statusCode).toBe(401);
    expect(userContact.deleteMany).not.toHaveBeenCalled();
    expect(contactJoinNotice.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });
});
