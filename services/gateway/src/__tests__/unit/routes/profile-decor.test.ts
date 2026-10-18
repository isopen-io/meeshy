/**
 * Le DÉCOR de profil (#10632, § 10.2) : `PUT /me/profile-decor` (domaine,
 * possession, loi des cadres, diffusion `profile:decor-updated` sur `user:<id>`)
 * et la lecture additive `profileDecor` — profil public, composé depuis les
 * colonnes brutes qui, elles, ne sortent pas.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import profileDecorRoutes from '../../../routes/me/profile-decor';
import { buildPublicProfile, publicProfilePlan, publicProfileSchema, publicUserSelect } from '../../../routes/users/public-profile';
import { servedProfileDecor } from '../../../services/appearance/profileDecor';
import { buildPackIndex } from '../../../services/packs/PackIndex';

const USER = '507f1f77bcf86cd799439011';
const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 10, sha256: sha(seed) });
const entry = (domain: string, slug: string, over: Record<string, unknown> = {}) => ({
  slug, domain, origin: 'builtin', version: 1, order: 0, installedByDefault: true, removable: false, hidden: false,
  contractSchema: 1, cover: ref('a'), preview: null, contract: ref('c', 'json'), strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 1, square: null }, names: { fr: { name: slug, description: slug } }, ...over,
});
const RING_USAGE = { kind: 'free', surfaces: ['avatar'] };
const FRAME_USAGE = { kind: 'free', surfaces: ['banner'] };
const ITEM_KEYS: Readonly<Record<string, readonly string[]>> = {
  'avatar-ring': ['filet', 'laurier'],
  'banner-frame': ['haussmannien', 'celte'],
};
const INDEX = buildPackIndex({
  registries: [[
    entry('avatar-ring', 'contours', { usage: RING_USAGE }),
    entry('avatar-ring', 'contours-rares', { origin: 'official', installedByDefault: false, removable: true, price: 30, usage: RING_USAGE, contract: ref('e', 'json') }),
    entry('banner', 'bannieres'),
    entry('wallpaper', 'essentiels'),
    entry('banner-frame', 'cadres', { usage: FRAME_USAGE }),
    entry('banner-frame', 'cadres-rares', { origin: 'official', installedByDefault: false, removable: true, price: 40, usage: FRAME_USAGE, contract: ref('f', 'json') }),
  ]],
  retained: [],
  contractItemKeys: (e) => ITEM_KEYS[e.domain] ?? ['aurore', 'maille'],
});

function build(options: { owns?: readonly string[] } = {}) {
  const user: Record<string, unknown> = { equippedAvatarRing: null, equippedBanner: null, equippedBannerFrame: null };
  const emits: { room: string; event: string; payload: any }[] = [];
  const prisma = {
    userPackOwnership: { findMany: jest.fn(async () => (options.owns ?? []).map((packKey) => ({ packKey }))) },
    user: {
      update: jest.fn(async ({ data }: any) => {
        Object.assign(user, data);
        return { equippedAvatarRing: user.equippedAvatarRing, equippedBanner: user.equippedBanner, equippedBannerFrame: user.equippedBannerFrame };
      }),
    },
  };
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emits.push({ room, event, payload }) }) };
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', { getManager: () => ({ io }) } as never);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: USER, role: 'USER' }, userId: USER };
  });
  return { app, user, emits };
}

describe('PUT /me/profile-decor', () => {
  let env: ReturnType<typeof build>;
  const boot = async (options: { owns?: readonly string[] } = {}) => {
    env = build(options);
    await env.app.register(profileDecorRoutes, { index: INDEX });
    await env.app.ready();
  };
  const put = (payload: unknown) => env.app.inject({ method: 'PUT', url: '/profile-decor', payload: payload as object });

  beforeEach(() => boot());
  afterEach(() => env.app.close());

  it('équipe un contour et une bannière d’un pack gratuit, les sert et les diffuse à mes autres appareils', async () => {
    const response = await put({ avatarRing: { pack: 'contours', item: 'filet' }, banner: { pack: 'bannieres', item: 'aurore' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      avatarRing: { pack: 'contours', item: 'filet', origin: 'builtin', contract: null },
      banner: { pack: 'bannieres', item: 'aurore', origin: 'builtin', contract: null },
      bannerFrame: null,
    });
    expect(env.user).toMatchObject({ equippedAvatarRing: 'contours/filet', equippedBanner: 'bannieres/aurore' });
    expect(env.emits).toHaveLength(1);
    expect(env.emits[0]).toMatchObject({ room: `user:${USER}`, event: 'profile:decor-updated' });
    expect(env.emits[0].payload).toMatchObject({ userId: USER, decor: { avatarRing: { item: 'filet' } } });
  });

  it('un champ absent est inchangé, null le retire', async () => {
    await put({ avatarRing: { pack: 'contours', item: 'filet' }, banner: { pack: 'bannieres', item: 'aurore' } });
    await put({ banner: null });

    expect(env.user).toMatchObject({ equippedAvatarRing: 'contours/filet', equippedBanner: null });
  });

  it('refuse un contour payant non possédé (403 PACK_NOT_OWNED), l’accepte une fois possédé et sert l’adresse de son contrat', async () => {
    const refused = await put({ avatarRing: { pack: 'contours-rares', item: 'filet' } });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('PACK_NOT_OWNED');
    expect(env.user.equippedAvatarRing).toBeNull();

    await env.app.close();
    await boot({ owns: ['avatar-ring.contours-rares'] });
    const accepted = await put({ avatarRing: { pack: 'contours-rares', item: 'laurier' } });
    expect(accepted.json().data.avatarRing).toMatchObject({ origin: 'official', contract: ref('e', 'json').src });
  });

  it('refuse un modèle d’un AUTRE domaine (403) : un pack de fonds ne se porte pas en bannière', async () => {
    expect((await put({ banner: { pack: 'essentiels', item: 'aurore' } })).statusCode).toBe(403);
    expect((await put({ avatarRing: { pack: 'bannieres', item: 'aurore' } })).statusCode).toBe(403);
    expect(env.user.equippedAvatarRing).toBeNull();
  });

  it('un élément absent d’un pack POSSÉDÉ répond 404 DECOR_ITEM_NOT_FOUND, jamais PACK_NOT_OWNED (#10763)', async () => {
    const free = await put({ avatarRing: { pack: 'contours', item: 'fantome' } });
    expect([free.statusCode, free.json().code]).toEqual([404, 'DECOR_ITEM_NOT_FOUND']);

    await env.app.close();
    await boot({ owns: ['avatar-ring.contours-rares'] });
    const paid = await put({ avatarRing: { pack: 'contours-rares', item: 'fantome' } });
    expect([paid.statusCode, paid.json().code]).toEqual([404, 'DECOR_ITEM_NOT_FOUND']);
    expect(env.user.equippedAvatarRing).toBeNull();
  });

  it('un pack NON possédé répond PACK_NOT_OWNED que l’élément existe ou non : aucun oracle sur son contenu (#10763)', async () => {
    const existing = await put({ avatarRing: { pack: 'contours-rares', item: 'laurier' } });
    const missing = await put({ avatarRing: { pack: 'contours-rares', item: 'fantome' } });

    expect([existing.statusCode, existing.json().code]).toEqual([403, 'PACK_NOT_OWNED']);
    expect([missing.statusCode, missing.json().code]).toEqual([403, 'PACK_NOT_OWNED']);
    expect(missing.json().error).toBe(existing.json().error);
  });

  it('un pack inconnu reste 403 PACK_NOT_OWNED', async () => {
    const response = await put({ avatarRing: { pack: 'inconnu', item: 'filet' } });
    expect([response.statusCode, response.json().code]).toEqual([403, 'PACK_NOT_OWNED']);
  });

  it('applique la loi des cadres : un contour dont l’usage ne couvre pas l’avatar est refusé (403 FRAME_USAGE_MISMATCH)', async () => {
    // Le schéma du registre refuse déjà un contour sans la seule surface `avatar` : la loi des
    // cadres est la seconde garde, éprouvée ici sur un registre que la lecture n'aurait pas laissé passer.
    const callOnly = {
      ...INDEX,
      entries: () => [entry('avatar-ring', 'appel', { usage: { kind: 'free', surfaces: ['call'] } }) as never],
      itemKeys: () => ['filet'],
    };
    await env.app.close();
    env = build();
    await env.app.register(profileDecorRoutes, { index: callOnly });
    await env.app.ready();

    const response = await put({ avatarRing: { pack: 'appel', item: 'filet' } });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FRAME_USAGE_MISMATCH');
  });

  it('un pack MASQUÉ ne s’équipe plus, même possédé (403) : il reste servi à qui le porte déjà', async () => {
    const delisted = buildPackIndex({
      registries: [[entry('banner', 'bannieres-retirees', { origin: 'official', installedByDefault: false, removable: true, hidden: true, price: 10 })]],
      retained: [],
      contractItemKeys: () => ['aurore'],
    });
    await env.app.close();
    env = build({ owns: ['banner.bannieres-retirees'] });
    await env.app.register(profileDecorRoutes, { index: delisted });
    await env.app.ready();

    expect((await put({ banner: { pack: 'bannieres-retirees', item: 'aurore' } })).statusCode).toBe(403);
    expect(env.user.equippedBanner).toBeNull();
  });

  it('refuse un corps mal formé (400) sans écrire', async () => {
    expect((await put({ bannerFrame: { pack: 'cadres', item: 'Haussmann ien' } })).statusCode).toBe(400);
    expect((await put({ bannerFrame: 'cadres/haussmannien' })).statusCode).toBe(400);
    expect(env.user.equippedBannerFrame).toBeNull();
    expect((await put({ avatarRing: { pack: 'Contours!', item: 'filet' } })).statusCode).toBe(400);
    expect(env.user.equippedAvatarRing).toBeNull();
  });
});

describe('PUT /me/profile-decor — le cadre de bannière, troisième côté (#10932)', () => {
  let env: ReturnType<typeof build>;
  const boot = async (options: { owns?: readonly string[]; index?: typeof INDEX } = {}) => {
    env = build(options);
    await env.app.register(profileDecorRoutes, { index: options.index ?? INDEX });
    await env.app.ready();
  };
  const put = (payload: unknown) => env.app.inject({ method: 'PUT', url: '/profile-decor', payload: payload as object });

  beforeEach(() => boot());
  afterEach(() => env.app.close());

  it('équipe un cadre gratuit À CÔTÉ du fond : les deux côtés coexistent, et le cadre se diffuse', async () => {
    const response = await put({ banner: { pack: 'bannieres', item: 'aurore' }, bannerFrame: { pack: 'cadres', item: 'haussmannien' } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      avatarRing: null,
      banner: { pack: 'bannieres', item: 'aurore', origin: 'builtin', contract: null },
      bannerFrame: { pack: 'cadres', item: 'haussmannien', origin: 'builtin', contract: null },
    });
    expect(env.user).toMatchObject({ equippedBanner: 'bannieres/aurore', equippedBannerFrame: 'cadres/haussmannien' });
    expect(env.emits[0].payload).toMatchObject({ decor: { bannerFrame: { item: 'haussmannien' } } });
  });

  it('un champ absent laisse le cadre inchangé, null le retire sans toucher au fond', async () => {
    await put({ banner: { pack: 'bannieres', item: 'aurore' }, bannerFrame: { pack: 'cadres', item: 'celte' } });
    await put({ avatarRing: { pack: 'contours', item: 'filet' } });
    expect(env.user).toMatchObject({ equippedBannerFrame: 'cadres/celte' });

    await put({ bannerFrame: null });
    expect(env.user).toMatchObject({ equippedBanner: 'bannieres/aurore', equippedBannerFrame: null });
  });

  it('POSSESSION : un cadre payant non possédé est refusé (403 PACK_NOT_OWNED), accepté une fois possédé', async () => {
    const refused = await put({ bannerFrame: { pack: 'cadres-rares', item: 'celte' } });
    expect([refused.statusCode, refused.json().code]).toEqual([403, 'PACK_NOT_OWNED']);
    expect(env.user.equippedBannerFrame).toBeNull();

    await env.app.close();
    await boot({ owns: ['banner-frame.cadres-rares'] });
    const accepted = await put({ bannerFrame: { pack: 'cadres-rares', item: 'celte' } });
    expect(accepted.json().data.bannerFrame).toMatchObject({ origin: 'official', contract: ref('f', 'json').src });
  });

  it('la possession d’un pack d’un AUTRE domaine au même slug ne vaut rien', async () => {
    await env.app.close();
    await boot({ owns: ['banner.cadres-rares', 'avatar-ring.cadres-rares', 'cadres-rares'] });
    expect((await put({ bannerFrame: { pack: 'cadres-rares', item: 'celte' } })).statusCode).toBe(403);
  });

  it('DOMAINE : un fond ne se porte pas en cadre, un cadre ne se porte ni en fond ni en contour', async () => {
    expect((await put({ bannerFrame: { pack: 'bannieres', item: 'aurore' } })).statusCode).toBe(403);
    expect((await put({ banner: { pack: 'cadres', item: 'haussmannien' } })).statusCode).toBe(403);
    expect((await put({ avatarRing: { pack: 'cadres', item: 'haussmannien' } })).statusCode).toBe(403);
    expect(env.user).toMatchObject({ equippedBanner: null, equippedBannerFrame: null, equippedAvatarRing: null });
  });

  it('un élément absent d’un pack possédé répond 404, un pack non possédé 403 sans oracle', async () => {
    const missing = await put({ bannerFrame: { pack: 'cadres', item: 'fantome' } });
    expect([missing.statusCode, missing.json().code]).toEqual([404, 'DECOR_ITEM_NOT_FOUND']);
    const hidden = await put({ bannerFrame: { pack: 'cadres-rares', item: 'fantome' } });
    expect([hidden.statusCode, hidden.json().code]).toEqual([403, 'PACK_NOT_OWNED']);
  });

  it('USAGE : un cadre dont l’usage ne couvre pas la bannière est refusé (403 FRAME_USAGE_MISMATCH), et une écriture refusée n’écrit RIEN', async () => {
    // Le registre refuse déjà un pack de cadres sans la seule surface `banner` : la loi
    // des cadres est la seconde garde, éprouvée sur un index que la lecture n'aurait pas produit.
    const avatarOnly = {
      ...INDEX,
      entries: (domain: string) => (domain === 'banner-frame' ? [entry('banner-frame', 'detourne', { usage: RING_USAGE }) as never] : INDEX.entries(domain as never)),
      itemKeys: (e: { domain: string }) => (e.domain === 'banner-frame' ? ['haussmannien'] : INDEX.itemKeys(e as never)),
    };
    await env.app.close();
    await boot({ index: avatarOnly as never });

    const response = await put({ avatarRing: { pack: 'contours', item: 'filet' }, bannerFrame: { pack: 'detourne', item: 'haussmannien' } });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FRAME_USAGE_MISMATCH']);
    expect(env.user).toMatchObject({ equippedAvatarRing: null, equippedBannerFrame: null });
  });

  it('un cadre SANS usage lisible ne s’équipe pas', async () => {
    const noUsage = {
      ...INDEX,
      entries: (domain: string) => (domain === 'banner-frame' ? [entry('banner-frame', 'muet') as never] : INDEX.entries(domain as never)),
      itemKeys: () => ['haussmannien'],
    };
    await env.app.close();
    await boot({ index: noUsage as never });
    expect((await put({ bannerFrame: { pack: 'muet', item: 'haussmannien' } })).json().code).toBe('FRAME_USAGE_MISMATCH');
  });
});

describe('profileDecor servi', () => {
  it('un ancien profil sans colonne de cadre se sert avec un cadre null (#10932)', () => {
    expect(servedProfileDecor(INDEX, { equippedAvatarRing: null, equippedBanner: null })).toEqual({ avatarRing: null, banner: null, bannerFrame: null });
    expect(servedProfileDecor(INDEX, { equippedBannerFrame: 'cadres/celte' }).bannerFrame).toEqual({ pack: 'cadres', item: 'celte', origin: 'builtin', contract: null });
    expect(servedProfileDecor(INDEX, { equippedBannerFrame: 'bannieres/aurore' }).bannerFrame).toBeNull();
  });

  it('les trois colonnes du décor sont CHARGÉES par le profil public et par l’écriture, ensemble', async () => {
    expect(publicUserSelect).toMatchObject({ equippedAvatarRing: true, equippedBanner: true, equippedBannerFrame: true });
    expect(publicProfilePlan.columns.profileDecor).toEqual(['equippedAvatarRing', 'equippedBanner', 'equippedBannerFrame']);

    const env = build();
    await env.app.register(profileDecorRoutes, { index: INDEX });
    await env.app.ready();
    await env.app.inject({ method: 'PUT', url: '/profile-decor', payload: { bannerFrame: null } });
    const update = (env.app as unknown as { prisma: { user: { update: jest.Mock } } }).prisma.user.update;
    await env.app.close();
    expect((update.mock.calls[0]?.[0] as { select: unknown }).select).toEqual({ equippedAvatarRing: true, equippedBanner: true, equippedBannerFrame: true });
  });

  it('le profil public sert le cadre À TRAVERS son schéma de réponse, sans la colonne brute', async () => {
    const profile = buildPublicProfile({ id: 'u1', username: 'ada', equippedAvatarRing: null, equippedBanner: null, equippedBannerFrame: 'cadres/haussmannien' });
    expect(profile).not.toHaveProperty('equippedBannerFrame');

    const app = Fastify({ logger: false });
    app.get('/p', { schema: { response: { 200: publicProfileSchema } } }, async () => ({ ...profile, profileDecor: servedProfileDecor(INDEX, { equippedBannerFrame: 'cadres/haussmannien' }) }));
    const served = (await app.inject({ method: 'GET', url: '/p' })).json();
    await app.close();
    expect(served.profileDecor.bannerFrame).toEqual({ pack: 'cadres', item: 'haussmannien', origin: 'builtin', contract: null });
    expect(served).not.toHaveProperty('equippedBannerFrame');
  });

  it('un choix dont le pack a quitté le registre se sert null, jamais une erreur', () => {
    expect(servedProfileDecor(INDEX, { equippedAvatarRing: 'disparu/filet', equippedBanner: 'bannieres/maille', equippedBannerFrame: 'disparu/celte' })).toEqual({
      avatarRing: null,
      banner: { pack: 'bannieres', item: 'maille', origin: 'builtin', contract: null },
      bannerFrame: null,
    });
  });

  it('un contour ACHETÉ dont le pack est ensuite MASQUÉ reste servi : masquer retire de la boutique, jamais de ce qu’un compte a payé (#10632)', () => {
    const delisted = buildPackIndex({
      registries: [[
        entry('avatar-ring', 'contours-retires', { origin: 'official', installedByDefault: false, removable: true, hidden: true, price: 30, usage: RING_USAGE, contract: ref('e', 'json') }),
      ]],
      retained: [],
      contractItemKeys: () => ['filet'],
    });

    expect(servedProfileDecor(delisted, { equippedAvatarRing: 'contours-retires/filet', equippedBanner: null }).avatarRing).toEqual({
      pack: 'contours-retires', item: 'filet', origin: 'official', contract: ref('e', 'json').src,
    });
  });

  it('le profil public compose profileDecor et ne laisse sortir AUCUNE colonne brute', () => {
    const profile = buildPublicProfile({ id: 'u1', username: 'ada', equippedAvatarRing: 'contours/filet', equippedBanner: null });

    expect(profile).toHaveProperty('profileDecor');
    expect(profile).not.toHaveProperty('equippedAvatarRing');
    expect(profile).not.toHaveProperty('equippedBanner');
    expect(publicProfileSchema.properties).toHaveProperty('profileDecor');
  });
});
