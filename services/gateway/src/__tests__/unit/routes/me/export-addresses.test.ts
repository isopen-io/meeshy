/**
 * L'export RGPD rend les adresses de fiche (#18863) : chacune avec son cercle, sa position, son
 * affichage et ses clics — le droit d'accès et de portabilité (art. 15 et 20) couvre ce que
 * l'utilisateur a déclaré, et le cercle qu'il a choisi pour chacune.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

import { dataExportRoutes } from '../../../../routes/me/export';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd7994390fe';

const user = (profileAddresses: unknown[]) => ({
  id: USER_ID, username: 'aissa', displayName: 'Aissa', firstName: 'A', lastName: 'N', email: 'a@example.com',
  phoneNumber: null, bio: null, avatar: null, banner: null, systemLanguage: 'fr', regionalLanguage: null,
  customDestinationLanguage: null, timezone: 'Europe/Paris', createdAt: new Date('2026-01-01'), lastActiveAt: null,
  profileAddresses,
});

const address = (over: Record<string, unknown>) => ({
  id: 'ad1', title: 'Vidéos', url: 'https://youtube.com/@aissa.snd', glyph: 'videos', circle: 'FRIEND',
  position: 0, isShown: true, trackingToken: null, createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-02'), ...over,
});

type FakeLink = { token: string; createdBy: string; totalClicks: number; addressId?: string; name?: string; originalUrl?: string };

async function exporter(rows: unknown[], links: FakeLink[]) {
  const userFindUnique = jest.fn<any>().mockResolvedValue(user(rows));
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    user: { findUnique: userFindUnique },
    // Les visites du lien de profil (#19206) : aucune.
    profileLinkVisitDay: { findMany: jest.fn<any>().mockResolvedValue([]) },
    trackingLink: {
      findMany: jest.fn<any>(async (a: any) => links
        .filter((l) => (a.where.token?.in === undefined || (a.where.token.in as string[]).includes(l.token))
          && l.createdBy === a.where.createdBy
          && (a.where.addressId?.isSet === undefined || (l.addressId !== undefined) === a.where.addressId.isSet))
        .map((l) => ({ isActive: true, expiresAt: null, originalUrl: null, createdAt: new Date('2026-11-03'), ...l }))),
    },
  } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await app.register(dataExportRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/export?types=profile' });
  await app.close();
  return { res, userFindUnique };
}

describe('GET /export — les adresses de fiche (#18863)', () => {
  it('rend chaque adresse, masquée comprise, avec son cercle, sa position, son affichage et ses clics', async () => {
    const { res } = await exporter(
      [
        address({ id: 'ad1', trackingToken: 'tokA' }),
        address({ id: 'ad2', title: 'Banque', url: 'https://ma-banque.fr/', glyph: 'site', circle: 'BLOOD', position: 1, isShown: false }),
      ],
      [{ token: 'tokA', createdBy: USER_ID, totalClicks: 42, addressId: 'ad1' }],
    );
    expect(res.statusCode).toBe(200);
    const { addresses } = res.json().data.profile;
    expect(addresses).toEqual([
      expect.objectContaining({ id: 'ad1', title: 'Vidéos', url: 'https://youtube.com/@aissa.snd', glyph: 'videos', circle: 'FRIEND', position: 0, isShown: true, countsClicks: true, clicks: 42 }),
      expect.objectContaining({ id: 'ad2', title: 'Banque', url: 'https://ma-banque.fr/', glyph: 'site', circle: 'BLOOD', position: 1, isShown: false, countsClicks: false, clicks: 0 }),
    ]);
    expect(JSON.stringify(res.json().data.profile)).not.toContain('tokA');
  });

  it('un jeton repris par un autre compte, ou un lien qui n’est pas celui de l’adresse, ne prête pas ses clics', async () => {
    const { res } = await exporter(
      [address({ trackingToken: 'repris' }), address({ id: 'ad2', trackingToken: 'post' })],
      [{ token: 'repris', createdBy: OTHER, totalClicks: 999, addressId: 'ad1' }, { token: 'post', createdBy: USER_ID, totalClicks: 5 }],
    );
    expect(res.json().data.profile.addresses).toEqual([
      expect.objectContaining({ countsClicks: false, clicks: 0 }),
      expect.objectContaining({ countsClicks: false, clicks: 0 }),
    ]);
  });

  it('rend TOUTES les adresses, au-delà de douze, et tous ses liens d’adresse, y compris un lien orphelin', async () => {
    const rows = Array.from({ length: 13 }, (_, i) => address({ id: `ad${i}`, position: i }));
    const { res, userFindUnique } = await exporter(rows, [
      { token: 'orphe', createdBy: USER_ID, totalClicks: 3, addressId: 'ad-partie', name: 'Ancienne', originalUrl: 'https://ancienne.example/' },
      { token: 'post', createdBy: USER_ID, totalClicks: 5, name: 'Post', originalUrl: 'https://post.example/' },
    ]);
    const [{ select }] = userFindUnique.mock.calls[0] as [{ select: { profileAddresses: Record<string, unknown> } }];
    expect(select.profileAddresses.take).toBeUndefined();
    const profile = res.json().data.profile;
    expect(profile.addresses).toHaveLength(13);
    expect(profile.addressLinks).toEqual([expect.objectContaining({ title: 'Ancienne', url: 'https://ancienne.example/', clicks: 3 })]);
    expect(JSON.stringify(profile)).not.toContain('orphe');
  });

  it('un jeton repris par un autre compte ne prête pas ses clics (seul)', async () => {
    const { res } = await exporter([address({ trackingToken: 'repris' })], [{ token: 'repris', createdBy: OTHER, totalClicks: 999 }]);
    expect(res.json().data.profile.addresses).toEqual([expect.objectContaining({ countsClicks: false, clicks: 0 })]);
  });

  it('aucune adresse : une liste vide, jamais une section absente', async () => {
    const { res, userFindUnique } = await exporter([], []);
    expect(res.json().data.profile.addresses).toEqual([]);
    const [{ select }] = userFindUnique.mock.calls[0] as [{ select: Record<string, unknown> }];
    expect(select.profileAddresses).toEqual(expect.objectContaining({ orderBy: { position: 'asc' } }));
  });
});
