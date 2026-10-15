/**
 * LES VENDEURS TIERS d'apparence (#10709) à travers les VRAIES routes : un tiers
 * propose un pack de fonds, de contours ou de bannières (données validées par le
 * Zod des packs officiels), la modération le publie et FIXE son prix, la
 * possession et l'achat suivent la loi des packs officiels, et le contrat se
 * sert depuis le magasin adressé par contenu — jamais avant `approved`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { packAssetsRoutes } from '../../../routes/pack-assets';
import { avatarRingPacksRoutes, bannerPacksRoutes, wallpaperPacksRoutes } from '../../../routes/packs-appearance';
import { packsShopRoutes } from '../../../routes/packs-shop';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { CommunityAppearancePacks } from '../../../services/packs/CommunityAppearancePacks';
import { appearancePrisma } from './appearance-packs.harness';

const AUTHOR = '68b0000000000000000000a1';
const BUYER = '68b0000000000000000000b2';
const MODERATOR = '68b0000000000000000000c3';

const ref = (seed: string, ext: string) => ({ src: `${seed.repeat(16)}.${ext}`, bytes: 10, sha256: seed.repeat(64) });
const OFFICIAL = {
  slug: 'essentiels',
  domain: 'wallpaper',
  origin: 'builtin',
  version: 1,
  order: 0,
  installedByDefault: true,
  removable: false,
  hidden: false,
  contractSchema: 1,
  cover: ref('a', 'webp'),
  preview: null,
  contract: ref('c', 'json'),
  strings: {},
  downloadBytes: { story: 1, square: null },
  names: { fr: { name: 'Essentiels', description: 'Les essentiels.' } },
};

const palette = { base: '#FFFFFF', ink: '#111111', soft: '#EEEEEE' };
const design = (key = 'dunes') => ({
  key,
  style: 'pattern',
  palettes: { light: palette, dark: { base: '#000000', ink: '#EEEEEE', soft: '#222222' } },
  tile: { width: 64, height: 64, scale: 1, rotation: 0, paths: [{ d: 'M0 0 L10 10', role: 'ink', opacity: 0.08, width: 1 }] },
  fit: 'fill',
});
const wallpaperPack = (slug = 'dunes-pack', extra: Record<string, unknown> = {}) => ({
  slug,
  name: 'Dunes',
  description: 'Des dunes',
  author: 'Awa',
  contract: { domain: 'wallpaper', designs: [design()] },
  ...extra,
});

async function app() {
  const db = appearancePrisma();
  const server: FastifyInstance = Fastify({ logger: false });
  server.decorate('prisma', db.prisma as never);
  server.decorate('socketIOHandler', { io: { to: () => ({ emit: () => undefined }) } } as never);
  server.decorate('authenticate', async (request: FastifyRequest) => {
    const userId = typeof request.headers['x-user'] === 'string' ? request.headers['x-user'] : AUTHOR;
    const role = userId === MODERATOR ? 'ADMIN' : 'USER';
    (request as unknown as Record<string, unknown>).authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role } };
  });
  const index = buildPackIndex({ registries: [[OFFICIAL]], retained: [] });
  await server.register(wallpaperPacksRoutes, { prefix: '/packs/wallpaper', index });
  await server.register(avatarRingPacksRoutes, { prefix: '/packs/avatar-ring', index });
  await server.register(bannerPacksRoutes, { prefix: '/packs/banner', index });
  await server.register(packsShopRoutes, { prefix: '/packs/shop', index });
  await server.register(packAssetsRoutes, { prefix: '/pack-assets', index, assetsDir: '/nonexistent', community: new CommunityAppearancePacks({ prisma: db.prisma, index }) });
  await server.ready();
  return { server, db };
}

type Server = FastifyInstance;
const as = (user: string) => ({ 'x-user': user });
const submit = (server: Server, body: unknown, domain = 'wallpaper', user = AUTHOR) => server.inject({ method: 'POST', url: `/packs/${domain}/submissions`, headers: as(user), payload: body as object });
const review = (server: Server, slug: string, body: object, domain = 'wallpaper', user = MODERATOR) =>
  server.inject({ method: 'POST', url: `/packs/${domain}/${slug}/review`, headers: as(user), payload: body });
const get = (server: Server, url: string, user = BUYER) => server.inject({ method: 'GET', url, headers: as(user) });

describe('proposer un pack d’apparence (#10709)', () => {
  it('naît en attente : ni dans la boutique, ni dans la vitrine, ni installable, ni lisible par un tiers', async () => {
    const { server } = await app();
    const created = await submit(server, wallpaperPack());
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({ slug: 'dunes-pack', status: 'pending', origin: 'community', domain: 'wallpaper', author: 'Awa' });

    const shop = (await get(server, '/packs/wallpaper')).json().data as { slug: string }[];
    expect(shop.map((pack) => pack.slug)).toEqual(['essentiels']);
    const vitrine = (await get(server, '/packs/shop')).json().data.domains as { packs: { slug: string }[] }[];
    expect(vitrine.flatMap((entry) => entry.packs.map((pack) => pack.slug))).not.toContain('dunes-pack');
    expect((await get(server, '/packs/wallpaper/dunes-pack')).statusCode).toBe(404);
    expect((await server.inject({ method: 'PUT', url: '/packs/wallpaper/dunes-pack/install', headers: as(BUYER) })).statusCode).toBe(404);
    expect((await get(server, '/packs/wallpaper/dunes-pack', AUTHOR)).json().data.status).toBe('pending');
  });

  it('ignore un prix proposé par le vendeur : le prix est fixé par la modération', async () => {
    const { server, db } = await app();
    await submit(server, wallpaperPack('dunes-pack', { price: 1 }));
    expect(db.communityRows[0].price).toBeNull();
  });

  it('refuse un contrat hors schéma, une couche animée, un chemin non SVG, un autre domaine — en 422 avec les problèmes', async () => {
    const { server } = await app();
    const lottie = { src: 'aaaaaaaaaaaaaaaa.json', bytes: 1, sha256: 'a'.repeat(64) };
    const cases: [unknown, string][] = [
      [wallpaperPack('a1', { contract: { domain: 'wallpaper', designs: [{ ...design(), lottie }] } }), 'lottie-forbidden'],
      [wallpaperPack('a2', { contract: { domain: 'wallpaper', designs: [{ ...design(), tile: { ...design().tile, paths: [{ d: '<script>1</script>', role: 'ink', opacity: 0.05 }] } }] } }), 'contract'],
      [wallpaperPack('a3', { contract: { domain: 'banner', designs: [design()] } }), 'domain-mismatch'],
      [wallpaperPack('a4', { contract: 'x' }), 'contract'],
    ];
    for (const [body, code] of cases) {
      const res = await submit(server, body);
      expect([res.statusCode, res.json().code, res.json().problems.map((problem: { code: string }) => problem.code)]).toEqual([422, 'APPEARANCE_PACK_INVALID', [code]]);
    }
  });

  it('refuse un slug d’un pack officiel du domaine, un slug pris, et plus de trois en attente', async () => {
    const { server } = await app();
    expect((await submit(server, wallpaperPack('essentiels'))).statusCode).toBe(409);
    expect((await submit(server, wallpaperPack('un'))).statusCode).toBe(201);
    expect((await submit(server, wallpaperPack('un'), 'wallpaper', BUYER)).statusCode).toBe(409);
    expect((await submit(server, wallpaperPack('deux'))).statusCode).toBe(201);
    expect((await submit(server, wallpaperPack('trois'))).statusCode).toBe(201);
    const fourth = await submit(server, wallpaperPack('quatre'));
    expect([fourth.statusCode, fourth.json().code]).toEqual([409, 'APPEARANCE_PACK_TOO_MANY_PENDING']);
  });

  it('accepte aussi des contours et des bannières', async () => {
    const { server } = await app();
    const ring = { slug: 'orbe-pack', name: 'Orbe', author: 'Awa', contract: { domain: 'avatar-ring', rings: [{ key: 'orbe', stroke: { style: 'solid', width: 0.05, colors: ['#FF8800'] } }] } };
    expect((await submit(server, ring, 'avatar-ring')).statusCode).toBe(201);
    const banner = { ...wallpaperPack('bandeau'), contract: { domain: 'banner', designs: [design()] } };
    expect((await submit(server, banner, 'banner')).statusCode).toBe(201);
    expect((await submit(server, ring, 'banner', BUYER)).statusCode).toBe(422);
  });
});

describe('modérer : pending → approved', () => {
  it('réserve la file et la décision aux modérateurs', async () => {
    const { server } = await app();
    await submit(server, wallpaperPack());
    expect((await get(server, '/packs/wallpaper/pending', AUTHOR)).statusCode).toBe(403);
    expect((await review(server, 'dunes-pack', { decision: 'approve' }, 'wallpaper', AUTHOR)).statusCode).toBe(403);
    const queue = (await get(server, '/packs/wallpaper/pending', MODERATOR)).json().data as { slug: string }[];
    expect(queue.map((pack) => pack.slug)).toEqual(['dunes-pack']);
  });

  it('publie avec le prix du modérateur, sert le pack dans la boutique et la vitrine, une seule décision', async () => {
    const { server } = await app();
    await submit(server, wallpaperPack());
    const approved = await review(server, 'dunes-pack', { decision: 'approve', price: 40 });
    expect(approved.json().data).toMatchObject({ status: 'approved', price: 40 });
    expect((await review(server, 'dunes-pack', { decision: 'reject' })).statusCode).toBe(404);

    const shop = (await get(server, '/packs/wallpaper')).json().data as { slug: string; price: number | null; owned: boolean; origin: string }[];
    expect(shop.find((pack) => pack.slug === 'dunes-pack')).toMatchObject({ price: 40, owned: false, origin: 'community' });
    const vitrine = (await get(server, '/packs/shop?domains=wallpaper')).json().data.domains as { packs: { slug: string }[] }[];
    expect(vitrine.flatMap((entry) => entry.packs.map((pack) => pack.slug))).toContain('dunes-pack');
  });

  it('refuse avec un mot que seul l’auteur lit, et permet de reproposer sous le même slug', async () => {
    const { server } = await app();
    await submit(server, wallpaperPack());
    await review(server, 'dunes-pack', { decision: 'reject', note: 'Trop chargé' });
    expect((await get(server, '/packs/wallpaper/dunes-pack', AUTHOR)).json().data).toMatchObject({ status: 'rejected', reviewNote: 'Trop chargé' });
    expect((await get(server, '/packs/wallpaper/dunes-pack', BUYER)).statusCode).toBe(404);
    expect((await submit(server, wallpaperPack())).statusCode).toBe(201);
    expect((await submit(server, wallpaperPack(), 'wallpaper', BUYER)).statusCode).toBe(409);
  });
});

describe('possession et prix comme les packs officiels', () => {
  it('un pack payant exige l’achat : 403 PACK_NOT_OWNED, puis achat idempotent, puis installation', async () => {
    const { server, db } = await app();
    await submit(server, wallpaperPack());
    await review(server, 'dunes-pack', { decision: 'approve', price: 40 });
    const install = () => server.inject({ method: 'PUT', url: '/packs/wallpaper/dunes-pack/install', headers: as(BUYER) });
    const refused = await install();
    expect([refused.statusCode, refused.json().code]).toEqual([403, 'PACK_NOT_OWNED']);

    db.grant(BUYER, 100);
    const buy = (requestId: string) => server.inject({ method: 'POST', url: '/packs/wallpaper/dunes-pack/purchase', headers: as(BUYER), payload: { requestId } });
    const first = await buy('req-0000001');
    expect(first.json().data).toMatchObject({ balance: 60, pack: { slug: 'dunes-pack', owned: true, installed: true, price: 40 } });
    expect((await buy('req-0000001')).json().data.balance).toBe(60);
    expect((await buy('req-0000002')).json().code).toBe('PACK_ALREADY_OWNED');
    expect((await install()).statusCode).toBe(200);
    expect(db.communityRows[0].installCount).toBe(1);
    expect((await get(server, '/packs/wallpaper/installed')).json().data.map((pack: { slug: string }) => pack.slug)).toContain('dunes-pack');
  });

  it('solde insuffisant : aucun effet', async () => {
    const { server, db } = await app();
    await submit(server, wallpaperPack());
    await review(server, 'dunes-pack', { decision: 'approve', price: 40 });
    db.grant(BUYER, 10);
    const res = await server.inject({ method: 'POST', url: '/packs/wallpaper/dunes-pack/purchase', headers: as(BUYER), payload: { requestId: 'req-0000009' } });
    expect([res.statusCode, res.json().code]).toEqual([409, 'INSUFFICIENT_MEESHES']);
    expect(db.ownerships).toHaveLength(0);
  });

  it('un pack publié gratuit s’achète : 409 PACK_IS_FREE, et s’installe sans possession', async () => {
    const { server } = await app();
    await submit(server, wallpaperPack());
    await review(server, 'dunes-pack', { decision: 'approve' });
    const res = await server.inject({ method: 'POST', url: '/packs/wallpaper/dunes-pack/purchase', headers: as(BUYER), payload: { requestId: 'req-0000003' } });
    expect(res.json().code).toBe('PACK_IS_FREE');
    expect((await server.inject({ method: 'PUT', url: '/packs/wallpaper/dunes-pack/install', headers: as(BUYER) })).statusCode).toBe(200);
  });

  it('un pack non publié ne s’achète pas', async () => {
    const { server } = await app();
    await submit(server, wallpaperPack());
    const res = await server.inject({ method: 'POST', url: '/packs/wallpaper/dunes-pack/purchase', headers: as(BUYER), payload: { requestId: 'req-0000004' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('le contrat se sert depuis le magasin adressé par contenu, après publication seulement', () => {
  it('404 tant que le pack est en attente ; ensuite les octets exacts, à l’empreinte annoncée', async () => {
    const { server } = await app();
    const created = (await submit(server, wallpaperPack())).json().data as { contract: { src: string; sha256: string; bytes: number } };
    const url = `/pack-assets/${created.contract.src}`;
    expect((await server.inject({ method: 'GET', url })).statusCode).toBe(404);

    await review(server, 'dunes-pack', { decision: 'approve' });
    const served = await server.inject({ method: 'GET', url });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toContain('application/json');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(createHash('sha256').update(served.rawPayload).digest('hex')).toBe(created.contract.sha256);
    expect(served.rawPayload.length).toBe(created.contract.bytes);
  });

  it('un pack refusé ne sert plus son contrat', async () => {
    const { server } = await app();
    const created = (await submit(server, wallpaperPack())).json().data as { contract: { src: string } };
    await review(server, 'dunes-pack', { decision: 'reject' });
    expect((await server.inject({ method: 'GET', url: `/pack-assets/${created.contract.src}` })).statusCode).toBe(404);
  });
});

describe('relecture du lot (#10709) : ce que la boutique et la modération voient', () => {
  it('compte les éléments du contrat : un pack de deux fonds en annonce deux, partout', async () => {
    const { server } = await app();
    const created = await submit(server, wallpaperPack('duo', { contract: { domain: 'wallpaper', designs: [design('dunes'), design('vagues')] } }));
    expect(created.json().data.itemCount).toBe(2);
    await review(server, 'duo', { decision: 'approve' });
    const shop = (await get(server, '/packs/wallpaper')).json().data as { slug: string; itemCount: number }[];
    expect(shop.find((pack) => pack.slug === 'duo')?.itemCount).toBe(2);
    expect((await get(server, '/packs/wallpaper/duo')).json().data.itemCount).toBe(2);
  });

  it('ne charge jamais le contrat (jusqu’à 256 Ko par pack) pour lister, détailler, installer ou acheter', async () => {
    const { server, db } = await app();
    await submit(server, wallpaperPack());
    await review(server, 'dunes-pack', { decision: 'approve', price: 40 });
    db.grant(BUYER, 100);
    const before = db.contractReads();
    await get(server, '/packs/wallpaper');
    await get(server, '/packs/shop');
    await get(server, '/packs/wallpaper/dunes-pack');
    await server.inject({ method: 'POST', url: '/packs/wallpaper/dunes-pack/purchase', headers: as(BUYER), payload: { requestId: 'req-0000010' } });
    await server.inject({ method: 'PUT', url: '/packs/wallpaper/dunes-pack/install', headers: as(BUYER) });
    await get(server, '/packs/wallpaper/installed');
    await get(server, '/packs/wallpaper/pending', MODERATOR);
    await get(server, '/packs/wallpaper/submissions', AUTHOR);
    expect(db.contractReads() - before).toBe(0);
  });

  it('le modérateur et l’auteur lisent le contrat d’un pack EN ATTENTE ; un tiers, jamais', async () => {
    const { server } = await app();
    await submit(server, wallpaperPack());
    const asModerator = await get(server, '/packs/wallpaper/dunes-pack/contract', MODERATOR);
    expect(asModerator.statusCode).toBe(200);
    const served = asModerator.json().data as { contractSchema: number; contractJson: string; sha256: string };
    expect(served.contractSchema).toBe(1);
    expect(JSON.parse(served.contractJson)).toMatchObject({ domain: 'wallpaper', designs: [{ key: 'dunes' }] });
    expect(createHash('sha256').update(served.contractJson, 'utf8').digest('hex')).toBe(served.sha256);
    expect((await get(server, '/packs/wallpaper/dunes-pack/contract', AUTHOR)).statusCode).toBe(200);
    const asStranger = await get(server, '/packs/wallpaper/dunes-pack/contract', BUYER);
    expect([asStranger.statusCode, asStranger.json().code]).toEqual([404, 'APPEARANCE_PACK_NOT_FOUND']);
    expect((await get(server, '/packs/wallpaper/essentiels/contract', MODERATOR)).statusCode).toBe(404);
  });

  it('un modérateur ne publie ni ne refuse sa propre proposition, et ne fixe pas son propre prix', async () => {
    const { server, db } = await app();
    await submit(server, wallpaperPack(), 'wallpaper', MODERATOR);
    const self = await review(server, 'dunes-pack', { decision: 'approve', price: 999 });
    expect([self.statusCode, self.json().code]).toEqual([403, 'APPEARANCE_PACK_SELF_REVIEW']);
    expect(db.communityRows[0]).toMatchObject({ status: 'pending', price: null });
  });

  it('le contrat publié répond 304 à un client qui l’a déjà (If-None-Match)', async () => {
    const { server } = await app();
    const created = (await submit(server, wallpaperPack())).json().data as { contract: { src: string } };
    await review(server, 'dunes-pack', { decision: 'approve' });
    const url = `/pack-assets/${created.contract.src}`;
    const etag = (await server.inject({ method: 'GET', url })).headers.etag as string;
    const again = await server.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
  });
});
