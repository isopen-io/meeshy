/**
 * Les stories « à la une » d'une personne (#19394, décision #19393, chantier #18857).
 *
 * Le double Prisma APPLIQUE les clauses `where` qu'il reçoit : un faux qui rendrait ses
 * lignes quelle que soit la requête verdirait sur une lecture sans filtre d'audience. La
 * loi d'audience elle-même est la vraie (`buildPostVisibilityOrFilter`) ; seules les
 * lectures d'amitié, de cercles et de blocage qui l'alimentent sont posées par le témoin.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const OWNER = '65a0000000000000000000a1';
const FRIEND = '65a0000000000000000000b1';
const CLOSE = '65a0000000000000000000b2';
const NAMED = '65a0000000000000000000b3';
const BLOCKED = '65a0000000000000000000b4';
const OTHER_AUTHOR = '65a0000000000000000000b5';
const STRANGER = '65a0000000000000000000b6';
const GUEST = 'guest';

type AnyRow = Record<string, any>;

type World = {
  friends: Record<string, string[]>;
  close: Record<string, string[]>;
  blocked: Record<string, string[]>;
};
const world: World = { friends: {}, close: {}, blocked: {} };

jest.mock('../../../../services/posts/feedVisibility', () => {
  const { buildPostVisibilityOrFilter } = jest.requireActual('../../../../services/posts/postVisibility') as {
    buildPostVisibilityOrFilter: (...args: unknown[]) => unknown;
  };
  return {
    viewerPostAudience: async (_prisma: unknown, viewerId: string) =>
      buildPostVisibilityOrFilter(
        viewerId,
        world.friends[viewerId] ?? [],
        [],
        world.blocked[viewerId] ?? [],
        { acquaintance: world.friends[viewerId] ?? [], close: world.close[viewerId] ?? [], blood: [] },
        [],
      ),
  };
});

import { storyHighlightRoutes } from '../../../../routes/users/story-highlights';

const matches = (row: AnyRow | null | undefined, where: AnyRow | undefined): boolean => {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as AnyRow[]).every((w) => matches(row, w));
    if (key === 'OR') return (cond as AnyRow[]).some((w) => matches(row, w));
    if (key === 'NOT') return Array.isArray(cond) ? !cond.some((w) => matches(row, w)) : !matches(row, cond);
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (typeof cond !== 'object' || Array.isArray(cond)) return value === cond;
    const c = cond as AnyRow;
    const ops = ['in', 'notIn', 'has', 'isSet', 'not'];
    if (!Object.keys(c).some((op) => ops.includes(op))) return matches(value, c);
    if ('in' in c && !c.in.includes(value)) return false;
    if ('notIn' in c && c.notIn.includes(value)) return false;
    if ('has' in c && !(value ?? []).includes(c.has)) return false;
    if ('isSet' in c && (value !== undefined && value !== null) !== c.isSet) return false;
    if ('not' in c && value === c.not) return false;
    return true;
  });
};

type Store = { highlights: AnyRow[]; posts: AnyRow[]; ownerState?: AnyRow };
let store: Store;
let seq = 0;

const story = (id: string, extra: AnyRow = {}): AnyRow => ({
  id,
  authorId: OWNER,
  type: 'STORY',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  content: `story ${id.slice(-2)}`,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  expiresAt: new Date('2026-11-02T06:00:00Z'),
  author: { id: OWNER, username: 'aissa' },
  media: [],
  postMentions: [],
  ...extra,
});

const album = (id: string, title: string, storyIds: string[], extra: AnyRow = {}): AnyRow => ({
  id,
  ownerId: OWNER,
  title,
  glyph: 'map-pin',
  storyIds,
  order: 0,
  createdAt: new Date('2026-11-03T10:00:00Z'),
  updatedAt: new Date('2026-11-03T10:00:00Z'),
  ...extra,
});

const S_PUBLIC = '65a0000000000000000000c1';
const S_ONLY = '65a0000000000000000000c2';
const S_CLOSE = '65a0000000000000000000c3';
const S_DELETED = '65a0000000000000000000c4';
const S_FOREIGN = '65a0000000000000000000c5';
const S_FRIENDS = '65a0000000000000000000c6';
const H1 = '65a0000000000000000000d1';
const H2 = '65a0000000000000000000d2';
const H3 = '65a0000000000000000000d3';

const emptyTable = () => ({ findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) });

const prisma = () => ({
  user: {
    findUnique: jest.fn(async () => store.ownerState ?? { isActive: true, deletedAt: null, deactivatedAt: null }),
  },
  storyHighlight: {
    findMany: jest.fn(async (args: AnyRow = {}) =>
      store.highlights
        .filter((h) => matches(h, args.where))
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
        .slice(0, args.take ?? Infinity),
    ),
    findFirst: jest.fn(async (args: AnyRow = {}) => store.highlights.find((h) => matches(h, args.where)) ?? null),
    count: jest.fn(async (args: AnyRow = {}) => store.highlights.filter((h) => matches(h, args.where)).length),
    create: jest.fn(async (args: AnyRow) => {
      seq += 1;
      const row = { id: `65a00000000000000000e${String(seq).padStart(3, '0')}`, createdAt: new Date(), updatedAt: new Date(), ...args.data };
      store.highlights.push(row);
      return row;
    }),
    update: jest.fn(async (args: AnyRow) => {
      const row = store.highlights.find((h) => h.id === args.where.id)!;
      Object.assign(row, args.data, { updatedAt: new Date() });
      return row;
    }),
    updateMany: jest.fn(async (args: AnyRow) => {
      const rows = store.highlights.filter((h) => matches(h, args.where));
      rows.forEach((row) => Object.assign(row, args.data));
      return { count: rows.length };
    }),
    deleteMany: jest.fn(async (args: AnyRow) => {
      const before = store.highlights.length;
      store.highlights = store.highlights.filter((h) => !matches(h, args.where));
      return { count: before - store.highlights.length };
    }),
  },
  post: {
    findMany: jest.fn(async (args: AnyRow = {}) => store.posts.filter((p) => matches(p, args.where))),
    count: jest.fn(async (args: AnyRow = {}) => store.posts.filter((p) => matches(p, args.where)).length),
  },
  postReaction: emptyTable(),
  postBookmark: emptyTable(),
  engagementPostPoints: emptyTable(),
  engagementQuota: emptyTable(),
});

let app: FastifyInstance;
let viewer: string | null = null;

const build = async (): Promise<FastifyInstance> => {
  const instance = Fastify({ logger: false });
  instance.decorate('prisma', prisma() as never);
  instance.decorate('authenticate', async (request: AnyRow, reply: AnyRow) => {
    if (viewer === GUEST) {
      request.authContext = { isAuthenticated: true, registeredUser: null, userId: 'guest-session' };
      return;
    }
    request.authContext = viewer ? { isAuthenticated: true, registeredUser: { id: viewer }, userId: viewer } : undefined;
    if (!viewer) return reply.code(401).send({ success: false, error: 'Unauthorized' });
  });
  await storyHighlightRoutes(instance);
  await instance.ready();
  return instance;
};

const read = async (target: string, as: string | null) => {
  viewer = as;
  const res = await app.inject({ method: 'GET', url: `/users/${target}/highlights` });
  return { status: res.statusCode, body: res.json() };
};

beforeEach(async () => {
  seq = 0;
  world.friends = { [FRIEND]: [OWNER], [CLOSE]: [OWNER] };
  world.close = { [CLOSE]: [OWNER] };
  world.blocked = { [BLOCKED]: [OWNER] };
  store = {
    posts: [
      story(S_PUBLIC),
      story(S_ONLY, { visibility: 'ONLY', visibilityUserIds: [NAMED] }),
      story(S_CLOSE, { visibility: 'CLOSE' }),
      story(S_DELETED, { deletedAt: new Date('2026-11-04T00:00:00Z') }),
      story(S_FOREIGN, { authorId: OTHER_AUTHOR }),
      story(S_FRIENDS, { visibility: 'FRIENDS' }),
    ],
    highlights: [
      album(H1, 'Lisbonne', [S_CLOSE, S_PUBLIC, S_ONLY, S_DELETED], { order: 0 }),
      album(H2, 'Nuit', [S_ONLY], { order: 1, glyph: 'moon' }),
      album(H3, 'Lyon', [S_FRIENDS, S_FOREIGN], { order: 2, glyph: 'buildings' }),
    ],
  };
  app = await build();
});

afterEach(async () => {
  await app.close();
});

describe('GET /users/:id/highlights — chaque story sous SA propre audience', () => {
  it('comme toute la fiche (#10205), un compte est requis : 401 sans identité, 403 pour un invité', async () => {
    expect((await read(OWNER, null)).status).toBe(401);
    const guest = await read(OWNER, GUEST);
    expect(guest.status).toBe(403);
    expect(JSON.stringify(guest.body)).not.toContain('Lisbonne');
  });

  it('un inconnu ne lit que les stories publiques, et un album sans story publique n’existe pas pour lui', async () => {
    const { status, body } = await read(OWNER, STRANGER);
    expect(status).toBe(200);
    expect(body.data.highlights.map((h: AnyRow) => h.title)).toEqual(['Lisbonne']);
    expect(body.data.highlights[0]).toMatchObject({ glyph: 'map-pin', storyIds: [S_PUBLIC], storyCount: 1 });
    expect(body.data.highlights[0].stories.map((s: AnyRow) => s.id)).toEqual([S_PUBLIC]);
  });

  it('un Ami lit ce que FRIENDS lui ouvre mais pas une story réservée aux Proches', async () => {
    const { body } = await read(OWNER, FRIEND);
    expect(body.data.highlights.map((h: AnyRow) => [h.title, h.storyIds])).toEqual([
      ['Lisbonne', [S_PUBLIC]],
      ['Lyon', [S_FRIENDS]],
    ]);
  });

  it('un Proche lit la story CLOSE, dans l’ordre de l’album', async () => {
    const { body } = await read(OWNER, CLOSE);
    expect(body.data.highlights[0].storyIds).toEqual([S_CLOSE, S_PUBLIC]);
    expect(body.data.highlights[0].stories.map((s: AnyRow) => s.id)).toEqual([S_CLOSE, S_PUBLIC]);
  });

  it('la personne nommée par ONLY lit sa story, et l’album « Nuit » n’existe que pour elle', async () => {
    const { body } = await read(OWNER, NAMED);
    expect(body.data.highlights.map((h: AnyRow) => [h.title, h.storyIds])).toEqual([
      ['Lisbonne', [S_PUBLIC, S_ONLY]],
      ['Nuit', [S_ONLY]],
    ]);
  });

  it('ce qui part À CÔTÉ : ni la liste des personnes nommées, ni une story supprimée, ni celle d’un autre auteur', async () => {
    const { body } = await read(OWNER, NAMED);
    const served = body.data.highlights.flatMap((h: AnyRow) => h.stories);
    expect(served.every((s: AnyRow) => !('visibilityUserIds' in s))).toBe(true);
    const ids = body.data.highlights.flatMap((h: AnyRow) => h.storyIds);
    expect(ids).not.toContain(S_DELETED);
    expect(ids).not.toContain(S_FOREIGN);
    expect(JSON.stringify(body)).not.toContain(S_CLOSE);
  });

  it('une story expirée à la une reste servie à qui son audience l’ouvre', async () => {
    const { body } = await read(OWNER, STRANGER);
    expect(new Date(body.data.highlights[0].stories[0].expiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('un lecteur bloqué ne lit rien, pas même un titre', async () => {
    const { status, body } = await read(OWNER, BLOCKED);
    expect(status).toBe(200);
    expect(body.data.highlights).toEqual([]);
  });

  it('un compte DÉSACTIVÉ ne sert plus ses albums à un autre lecteur, même à un Proche ; la même liste vide qu’un absent', async () => {
    store.ownerState = { isActive: true, deletedAt: null, deactivatedAt: new Date('2026-11-10T00:00:00Z') };
    const { status, body } = await read(OWNER, CLOSE);
    expect(status).toBe(200);
    expect(body.data.highlights).toEqual([]);
  });

  it('le propriétaire désactivé lit toujours les siens', async () => {
    store.ownerState = { isActive: true, deletedAt: null, deactivatedAt: new Date('2026-11-10T00:00:00Z') };
    const { body } = await read(OWNER, OWNER);
    expect(body.data.highlights.length).toBeGreaterThan(0);
  });

  it('un identifiant illisible rend une liste vide, jamais un 404 qui distinguerait l’absent du privé', async () => {
    const { status, body } = await read('nope', FRIEND);
    expect(status).toBe(200);
    expect(body.data.highlights).toEqual([]);
  });
});

describe('/users/me/highlights — l’auteur compose ses albums', () => {
  const as = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, payload?: AnyRow) => {
    viewer = OWNER;
    const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    return { status: res.statusCode, body: res.json() };
  };

  it('lit tous ses albums, même vides, avec chacune de ses stories non supprimées', async () => {
    store.highlights.push(album('65a0000000000000000000d4', 'Vide', [], { order: 3 }));
    const { status, body } = await as('GET', '/users/me/highlights');
    expect(status).toBe(200);
    expect(body.data.highlights.map((h: AnyRow) => [h.title, h.storyIds])).toEqual([
      ['Lisbonne', [S_CLOSE, S_PUBLIC, S_ONLY]],
      ['Nuit', [S_ONLY]],
      ['Lyon', [S_FRIENDS]],
      ['Vide', []],
    ]);
  });

  it('crée un album à la suite des autres, avec ses seules stories', async () => {
    const { status, body } = await as('POST', '/users/me/highlights', { title: ' Marchés ', glyph: 'storefront', storyIds: [S_PUBLIC] });
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ title: 'Marchés', glyph: 'storefront', order: 3, storyIds: [S_PUBLIC] });
  });

  it('refuse d’y ranger la story d’un autre auteur ou une story supprimée', async () => {
    const foreign = await as('POST', '/users/me/highlights', { title: 'Vol', glyph: 'moon', storyIds: [S_FOREIGN] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('STORY_NOT_OWNED');
    const deleted = await as('PATCH', `/users/me/highlights/${H2}`, { storyIds: [S_DELETED] });
    expect(deleted.status).toBe(400);
    expect(store.highlights.find((h) => h.id === H2)!.storyIds).toEqual([S_ONLY]);
  });

  it('refuse un corps illisible', async () => {
    const res = await as('POST', '/users/me/highlights', { title: '', glyph: 'moon', storyIds: [] });
    expect(res.status).toBe(400);
  });

  it('n’en crée pas au-delà de la limite', async () => {
    store.highlights = Array.from({ length: 50 }, (_, i) => album(`65a00000000000000000f${String(i).padStart(3, '0')}`, `A${i}`, [], { order: i }));
    const res = await as('POST', '/users/me/highlights', { title: 'Trop', glyph: 'moon', storyIds: [] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HIGHLIGHT_LIMIT');
  });

  it('modifie et supprime son album ; l’album d’un autre est un 404', async () => {
    const renamed = await as('PATCH', `/users/me/highlights/${H2}`, { title: 'Nuits' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.title).toBe('Nuits');
    store.highlights.push(album('65a0000000000000000000d9', 'Autre', [], { ownerId: OTHER_AUTHOR }));
    expect((await as('PATCH', '/users/me/highlights/65a0000000000000000000d9', { title: 'x' })).status).toBe(404);
    expect((await as('DELETE', '/users/me/highlights/65a0000000000000000000d9')).status).toBe(404);
    expect((await as('DELETE', `/users/me/highlights/${H3}`)).status).toBe(200);
    expect(store.highlights.map((h) => h.id)).not.toContain(H3);
    expect(store.highlights.map((h) => h.id)).toContain('65a0000000000000000000d9');
  });

  it('réordonne ses albums ; un ordre qui ne nomme pas chacun d’eux une fois est refusé', async () => {
    expect((await as('PUT', '/users/me/highlights/order', { ids: [H3, H1] })).status).toBe(400);
    const res = await as('PUT', '/users/me/highlights/order', { ids: [H3, H1, H2] });
    expect(res.status).toBe(200);
    expect(res.body.data.highlights.map((h: AnyRow) => h.id)).toEqual([H3, H1, H2]);
  });

  it('un anonyme ne compose rien', async () => {
    viewer = null;
    const res = await app.inject({ method: 'POST', url: '/users/me/highlights', payload: { title: 'x', glyph: 'moon', storyIds: [] } });
    expect(res.statusCode).toBe(401);
  });
});
