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
import { buildPublicProfile, publicProfileSchema } from '../../../routes/users/public-profile';
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
const INDEX = buildPackIndex({
  registries: [[
    entry('avatar-ring', 'contours', { usage: RING_USAGE }),
    entry('avatar-ring', 'contours-rares', { origin: 'official', installedByDefault: false, removable: true, price: 30, usage: RING_USAGE, contract: ref('e', 'json') }),
    entry('banner', 'bannieres'),
    entry('wallpaper', 'essentiels'),
  ]],
  retained: [],
  contractItemKeys: (e) => (e.domain === 'avatar-ring' ? ['filet', 'laurier'] : ['aurore', 'maille']),
});

function build(options: { owns?: readonly string[] } = {}) {
  const user: Record<string, unknown> = { equippedAvatarRing: null, equippedBanner: null };
  const emits: { room: string; event: string; payload: any }[] = [];
  const prisma = {
    userPackOwnership: { findMany: jest.fn(async () => (options.owns ?? []).map((packKey) => ({ packKey }))) },
    user: {
      update: jest.fn(async ({ data }: any) => {
        Object.assign(user, data);
        return { equippedAvatarRing: user.equippedAvatarRing, equippedBanner: user.equippedBanner };
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

  it('refuse un modèle d’un AUTRE domaine ou inexistant (403) : un pack de fonds ne se porte pas en bannière', async () => {
    expect((await put({ banner: { pack: 'essentiels', item: 'aurore' } })).statusCode).toBe(403);
    expect((await put({ avatarRing: { pack: 'bannieres', item: 'aurore' } })).statusCode).toBe(403);
    expect((await put({ avatarRing: { pack: 'contours', item: 'fantome' } })).statusCode).toBe(403);
    expect(env.user.equippedAvatarRing).toBeNull();
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
    expect((await put({ avatarRing: { pack: 'Contours!', item: 'filet' } })).statusCode).toBe(400);
    expect(env.user.equippedAvatarRing).toBeNull();
  });
});

describe('profileDecor servi', () => {
  it('un choix dont le pack a quitté le registre se sert null, jamais une erreur', () => {
    expect(servedProfileDecor(INDEX, { equippedAvatarRing: 'disparu/filet', equippedBanner: 'bannieres/maille' })).toEqual({
      avatarRing: null,
      banner: { pack: 'bannieres', item: 'maille', origin: 'builtin', contract: null },
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
