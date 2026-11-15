/**
 * Les packs de stickers INCLUS (Mee, Meo, Mee & Meo) à travers la vitrine et la
 * route de retrait (#10738) : jamais retirables (409 `PACK_NOT_REMOVABLE`), et
 * nommés dans les sept langues pour que la description suive l'interface.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { packsShopRoutes } from '../../../routes/packs-shop';
import { builtinStickerPackNames } from '../../../services/packs/stickerPackNames';

const catalog = { catalogue: async () => [{ slug: 'mee', name: 'Mee', description: 'fr', builtin: true, installed: true }, { slug: 'tiers', name: 'T', description: '', builtin: false, installed: false }] };

async function shop() {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: 'u1', registeredUser: { id: 'u1', role: 'USER' } };
  });
  await app.register(packsShopRoutes, { prefix: '/packs/shop', catalogs: { sticker: catalog }, balance: async () => 0 });
  await app.ready();
  return app;
}

describe('la vitrine des stickers inclus (#10738)', () => {
  it('un intégré est servi non retirable et nommé en sept langues ; un pack tiers reste inchangé', async () => {
    const app = await shop();
    const res = await app.inject({ method: 'GET', url: '/packs/shop' });
    const [mee, tiers] = res.json().data.domains[0].packs;
    expect(mee.removable).toBe(false);
    expect(Object.keys(mee.names).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
    expect(mee.names.en.description).not.toBe(mee.names.fr.description);
    expect(tiers.removable).toBeUndefined();
    expect(tiers.names).toBeUndefined();
    await app.close();
  });

  it('chaque intégré a ses sept descriptions', () => {
    for (const slug of ['mee', 'meo', 'mee-et-meo']) {
      const names = builtinStickerPackNames(slug)!;
      expect(Object.values(names).every((text) => text.description !== '' && text.name !== '')).toBe(true);
    }
    expect(builtinStickerPackNames('inconnu')).toBeNull();
  });
});
