/**
 * @jest-environment node
 *
 * LE LIEN D'UNE ADRESSE DE FICHE NE S'OUVRE PAS HORS DE SON CERCLE PAR LA PORTE
 * D'APERÇU DES ROBOTS (#19196, audit de #18863).
 *
 * `GET /tracking-links/:token/og` est publique et sans compte : un robot y est un
 * lecteur ANONYME. Un lien d'adresse (`addressId` posé) n'y redirige que sous la loi
 * des autres portes (`addressLinkOpensTo`, lecteur absent) ; sinon l'aperçu générique,
 * en 200, sans rien de l'adresse. La garde se relit à CHAQUE requête : aucun cache ne
 * prolonge une redirection après qu'une adresse a été masquée, resserrée ou tournée.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerLinkUnfurlRoute } from '../../../../routes/links/unfurl';

const TOKEN = 'abcDEF12';
const OWNER = '507f1f77bcf86cd799439011';
const ADDRESS = '65a0000000000000000000a1';
const URL_PRIVEE = 'https://prive.example.org/agenda';

type Adresse = { url: string; circle: string; isShown: boolean; trackingToken: string | null };
type Proprietaire = { isActive: boolean; deletedAt: Date | null; deactivatedAt: Date | null };
type Monde = { adresse: Adresse | null; proprietaire: Proprietaire | null };

const adresse = (o: Partial<Adresse> = {}): Adresse => ({ url: URL_PRIVEE, circle: 'CLOSE', isShown: true, trackingToken: TOKEN, ...o });
const actif = (): Proprietaire => ({ isActive: true, deletedAt: null, deactivatedAt: null });

const monter = async (monde: Monde) => {
  const lien = { token: TOKEN, targetType: 'EXTERNAL', originalUrl: URL_PRIVEE, isActive: true, expiresAt: null, createdBy: OWNER, addressId: ADDRESS };
  const prisma = {
    trackingLink: { findUnique: jest.fn(async () => lien) },
    profileAddress: { findFirst: jest.fn(async () => monde.adresse) },
    user: { findUnique: jest.fn(async () => monde.proprietaire) },
    conversationShareLink: { findFirst: jest.fn(async () => null) },
  };
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false });
  registerLinkUnfurlRoute(app, { prisma: prisma as never, origin: 'https://meeshy.me' });
  await app.ready();
  return { app, prisma };
};

const deplier = async (app: Awaited<ReturnType<typeof monter>>['app']) =>
  app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/og` });

describe('un lien d’adresse non publique rend l’aperçu générique, jamais la cible', () => {
  it.each<[string, Monde]>([
    ['adresse réservée aux Proches', { adresse: adresse(), proprietaire: actif() }],
    ['adresse masquée', { adresse: adresse({ circle: 'PUBLIC', isShown: false }), proprietaire: actif() }],
    ['jeton tourné', { adresse: adresse({ circle: 'PUBLIC', trackingToken: 'autreJeton' }), proprietaire: actif() }],
    ['URL déviée', { adresse: adresse({ circle: 'PUBLIC', url: 'https://ailleurs.example.org/' }), proprietaire: actif() }],
    ['adresse supprimée', { adresse: null, proprietaire: actif() }],
    ['propriétaire désactivé', { adresse: adresse({ circle: 'PUBLIC' }), proprietaire: { isActive: true, deletedAt: null, deactivatedAt: new Date('2026-11-01') } }],
    ['propriétaire supprimé', { adresse: adresse({ circle: 'PUBLIC' }), proprietaire: null }],
  ])('%s : 200 générique, aucune redirection', async (_cas, monde) => {
    const { app } = await monter(monde);
    const res = await deplier(app);
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.body).not.toContain('prive.example.org');
  });
});

describe('un lien d’adresse PUBLIQUE redirige toujours le robot', () => {
  it('302 vers l’URL de l’adresse, sans cache partagé', async () => {
    const { app } = await monter({ adresse: adresse({ circle: 'PUBLIC' }), proprietaire: actif() });
    const res = await deplier(app);
    await app.close();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(URL_PRIVEE);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('aucun cache ne prolonge la redirection d’un lien d’adresse', () => {
  it('adresse masquée après un premier aperçu : le suivant est générique', async () => {
    const monde: Monde = { adresse: adresse({ circle: 'PUBLIC' }), proprietaire: actif() };
    const { app, prisma } = await monter(monde);
    expect((await deplier(app)).statusCode).toBe(302);
    monde.adresse = adresse({ circle: 'PUBLIC', isShown: false });
    const apres = await deplier(app);
    await app.close();
    expect(apres.statusCode).toBe(200);
    expect(apres.headers.location).toBeUndefined();
    expect(prisma.trackingLink.findUnique).toHaveBeenCalledTimes(2);
  });

  it('une lecture de la garde qui échoue ferme : aperçu générique', async () => {
    const { app, prisma } = await monter({ adresse: adresse({ circle: 'PUBLIC' }), proprietaire: actif() });
    prisma.profileAddress.findFirst.mockRejectedValueOnce(new Error('mongo down') as never);
    const res = await deplier(app);
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.headers.location).toBeUndefined();
  });
});
