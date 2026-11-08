/**
 * #6377 — ce que `PUT /communities/:id` et `DELETE /communities/:id` disent à
 * un client qui règle sa communauté (le web les sert désormais au créateur).
 *
 * Schémas RÉELS (`types.ts`, `api-schemas`) : un double de `UpdateCommunitySchema`
 * ne peut pas témoigner de ce que la validation refuse.
 *
 * - Un brouillon invalide est un 400 nommé (`INVALID_COMMUNITY`), jamais un 500 :
 *   l'identifiant hors alphabet levait une ZodError rattrapée en « Failed to
 *   update community ».
 * - Le refus d'un non-créateur porte `COMMUNITY_CREATOR_ONLY`, le conflit
 *   d'identifiant `COMMUNITY_IDENTIFIER_TAKEN` : un client les DESSINE sans
 *   lire la phrase anglaise.
 * - Une communauté désactivée par l'administration n'existe plus pour son
 *   créateur, à l'écriture comme à la lecture (#8876) : la supprimer effacerait
 *   ce que l'équipe a retenu. 404, et rien n'est effacé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { registerSettingsRoutes } from '../../../routes/communities/settings';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439022';
const ALIVE_ID = '507f1f77bcf86cd799439044';
const DEACTIVATED_ID = '507f1f77bcf86cd799439055';

type Row = { readonly id: string; readonly createdBy: string; readonly identifier: string; readonly isPrivate: boolean; readonly isActive: boolean };

const CORPUS: readonly Row[] = [
  { id: ALIVE_ID, createdBy: CREATOR_ID, identifier: 'mshy_vivante', isPrivate: false, isActive: true },
  { id: DEACTIVATED_ID, createdBy: CREATOR_ID, identifier: 'mshy_retenue', isPrivate: false, isActive: false },
];

const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
  Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value);

function makePrisma({ identifierTaken = false }: { readonly identifierTaken?: boolean } = {}) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: { where?: Record<string, unknown> }) => CORPUS.find((row) => matches(row, args.where)) ?? null),
      findUnique: jest.fn<any>(async () => (identifierTaken ? { id: '507f1f77bcf86cd799439099' } : null)),
      update: jest.fn<any>(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...CORPUS.find((row) => row.id === where.id),
        ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
        name: (data.name as string | undefined) ?? 'Vivante',
        creator: { id: CREATOR_ID, username: 'creatrice', displayName: null, avatar: null },
        _count: { members: 1, Conversation: 0 },
      })),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversation: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    communityMember: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    userCommunityPreferences: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    conversationShare: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn<any>(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

async function build({ viewerId = CREATOR_ID, identifierTaken = false }: { readonly viewerId?: string; readonly identifierTaken?: boolean } = {}) {
  const prisma = makePrisma({ identifierTaken });
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(registerSettingsRoutes);
  await app.ready();
  return { app, prisma };
}

describe('PUT /communities/:id — ce que le client règle se refuse par un code', () => {
  it('rend 400 INVALID_COMMUNITY pour un identifiant hors alphabet, sans rien écrire', async () => {
    const { app, prisma } = await build();
    const res = await app.inject({ method: 'PUT', url: `/communities/${ALIVE_ID}`, payload: { identifier: 'pas valide !' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'INVALID_COMMUNITY' });
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 403 COMMUNITY_CREATOR_ONLY à un autre que le créateur, sans rien écrire', async () => {
    const { app, prisma } = await build({ viewerId: OTHER_ID });
    const res = await app.inject({ method: 'PUT', url: `/communities/${ALIVE_ID}`, payload: { name: 'Prise' } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'COMMUNITY_CREATOR_ONLY' });
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 409 COMMUNITY_IDENTIFIER_TAKEN quand l’identifiant est pris', async () => {
    const { app, prisma } = await build({ identifierTaken: true });
    const res = await app.inject({ method: 'PUT', url: `/communities/${ALIVE_ID}`, payload: { identifier: 'prise' } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'COMMUNITY_IDENTIFIER_TAKEN' });
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('enregistre le nom, la description et la confidentialité du créateur', async () => {
    const { app, prisma } = await build();
    const res = await app.inject({ method: 'PUT', url: `/communities/${ALIVE_ID}`, payload: { name: 'Nouvelle', description: '' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.community.update.mock.calls[0]?.[0]).toMatchObject({ where: { id: ALIVE_ID }, data: { name: 'Nouvelle', description: '' } });
    expect(res.json()).toMatchObject({ success: true, data: { id: ALIVE_ID, name: 'Nouvelle' } });
    await app.close();
  });

  it('ne sert ni l’e-mail ni la présence du créateur dans la réponse', async () => {
    const { app } = await build();
    const res = await app.inject({ method: 'PUT', url: `/communities/${ALIVE_ID}`, payload: { name: 'Nouvelle' } });
    const creator = res.json().data.creator ?? {};
    expect(creator).not.toHaveProperty('email');
    expect(creator).not.toHaveProperty('isOnline');
    expect(creator).not.toHaveProperty('lastActiveAt');
    await app.close();
  });
});

describe('DELETE /communities/:id — une communauté désactivée n’existe plus pour son créateur', () => {
  it('rend 404 et n’efface rien quand l’administration l’a désactivée', async () => {
    const { app, prisma } = await build();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${DEACTIVATED_ID}` });
    expect(res.statusCode).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.community.delete).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 403 COMMUNITY_CREATOR_ONLY à un autre que le créateur, sans rien effacer', async () => {
    const { app, prisma } = await build({ viewerId: OTHER_ID });
    const res = await app.inject({ method: 'DELETE', url: `/communities/${ALIVE_ID}` });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'COMMUNITY_CREATOR_ONLY' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('supprime la communauté vivante de son créateur', async () => {
    const { app, prisma } = await build();
    const res = await app.inject({ method: 'DELETE', url: `/communities/${ALIVE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(prisma.community.delete).toHaveBeenCalledWith({ where: { id: ALIVE_ID } });
    await app.close();
  });
});
