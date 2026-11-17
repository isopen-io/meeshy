/**
 * « En commun » (#19200) : la fiche d'un autre sert nos communautés, nos amis et
 * nos médias en commun, chacun gardé par son cercle.
 *
 * Le double Prisme APPLIQUE les clauses `where` qu'il reçoit (un petit
 * évaluateur) : un faux qui rendrait ses lignes quelle que soit la requête
 * verdirait sur une lecture sans borne ou sans filtre de protection.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { getUserInCommon } from '../../../../routes/users/in-common';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const V = '65a0000000000000000000a1'; // le lecteur
const T = '65a0000000000000000000b2'; // la cible
const F1 = '65a0000000000000000000c1';
const F2 = '65a0000000000000000000c2';
const F3 = '65a0000000000000000000c3';
const F4 = '65a0000000000000000000c4';
const F5 = '65a0000000000000000000c5';
const ONLY_T = '65a0000000000000000000c6';
const OUTSIDER = '65a0000000000000000000ff';

type AnyRow = Record<string, any>;

const matches = (row: AnyRow | null | undefined, where: AnyRow | undefined): boolean => {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as AnyRow[]).every((w) => matches(row, w));
    if (key === 'OR') return (cond as AnyRow[]).some((w) => matches(row, w));
    if (key === 'NOT') return Array.isArray(cond) ? !cond.some((w) => matches(row, w)) : !matches(row, cond);
    const value = row[key];
    if (cond === null) return key in row && value === null;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond !== 'object') return value === cond;
    const ops = ['in', 'has', 'startsWith', 'lt', 'gte', 'isSet', 'not'];
    if (Object.keys(cond).some((op) => ops.includes(op))) {
      const c = cond as AnyRow;
      if ('in' in c && !c.in.includes(value)) return false;
      if ('has' in c && !(value ?? []).includes(c.has)) return false;
      if ('startsWith' in c && !(typeof value === 'string' && value.startsWith(c.startsWith))) return false;
      if ('lt' in c && !(value < c.lt)) return false;
      if ('gte' in c && !(value >= c.gte)) return false;
      if ('isSet' in c && (key in row) !== c.isSet) return false;
      if ('not' in c && (c.not === null ? value == null : value === c.not)) return false;
      return true;
    }
    return matches(value, cond as AnyRow);
  });
};

const ordered = (rows: AnyRow[], orderBy?: AnyRow): AnyRow[] => {
  if (!orderBy) return rows;
  const [[field, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
};

const table = (rows: () => AnyRow[]) => ({
  findMany: jest.fn(async (args: AnyRow = {}) => ordered(rows().filter((r) => matches(r, args.where)), args.orderBy).slice(0, args.take ?? Infinity)),
  findFirst: jest.fn(async (args: AnyRow = {}) => rows().find((r) => matches(r, args.where)) ?? null),
});

type Store = {
  users: AnyRow[];
  relations: AnyRow[];
  members: AnyRow[];
  communities: AnyRow[];
  participants: AnyRow[];
  conversations: AnyRow[];
  attachments: AnyRow[];
  deletions: AnyRow[];
  preferences: AnyRow[];
};

let store: Store;

const user = (id: string, extra: AnyRow = {}): AnyRow => ({
  id,
  username: `u${id.slice(-2)}`,
  displayName: `User ${id.slice(-2)}`,
  avatar: null,
  role: 'USER',
  birthDate: null,
  isActive: true,
  deletedAt: null,
  deactivatedAt: null,
  blockedUserIds: [],
  ...extra,
});

const link = (a: string, b: string, grantedByA: string, grantedByB = grantedByA): AnyRow => {
  const [low, high] = a < b ? [a, b] : [b, a];
  return {
    id: `${low}${high}`,
    userLowId: low,
    userHighId: high,
    grantedByLow: low === a ? grantedByA : grantedByB,
    grantedByHigh: low === a ? grantedByB : grantedByA,
    transitions: [],
    updatedAt: new Date('2026-01-01'),
  };
};

const message = (conversationId: string, extra: AnyRow = {}): AnyRow => ({
  conversationId,
  createdAt: new Date('2026-06-01'),
  deletedAt: null,
  isEncrypted: false,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  ...extra,
});

let seq = 0;
const attachment = (conversationId: string, mimeType: string, extra: AnyRow = {}, messageExtra: AnyRow = {}): AnyRow => {
  seq += 1;
  const id = `65b0000000000000000000${String(seq).padStart(2, '0')}`;
  return {
    id,
    messageId: `msg-${id}`,
    originalName: `file-${seq}`,
    mimeType,
    fileSize: 100,
    fileUrl: `https://cdn/${id}`,
    thumbnailUrl: null,
    thumbHash: null,
    duration: null,
    width: null,
    height: null,
    uploadedBy: T,
    createdAt: new Date(Date.UTC(2026, 5, 1, 0, seq)),
    isEncrypted: false,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    message: message(conversationId, messageExtra),
    ...extra,
  };
};

const participant = (userId: string, conversationId: string): AnyRow => ({
  userId,
  conversationId,
  isActive: true,
  role: 'member',
  joinedAt: new Date('2020-01-01'),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
});

const baseStore = (pairLevel: string): Store => ({
  users: [user(V), user(T), user(F1), user(F2), user(F3), user(F4), user(F5), user(ONLY_T)],
  relations: pairLevel === 'PUBLIC' ? [] : [link(V, T, pairLevel)],
  members: [],
  communities: [],
  participants: [],
  conversations: [],
  attachments: [],
  deletions: [],
  preferences: [],
});

const prisma = () =>
  ({
    user: {
      ...table(() => store.users),
      findUnique: jest.fn(async (args: AnyRow) => store.users.find((u) => u.id === args.where.id) ?? null),
    },
    userRelation: {
      ...table(() => store.relations),
      findUnique: jest.fn(async (args: AnyRow) => {
        const key = args.where.userLowId_userHighId;
        return store.relations.find((r) => r.userLowId === key.userLowId && r.userHighId === key.userHighId) ?? null;
      }),
    },
    friendRequest: table(() => []),
    communityMember: table(() => store.members),
    community: table(() => store.communities),
    participant: table(() => store.participants),
    conversation: table(() => store.conversations),
    conversationShareLink: table(() => []),
    messageAttachment: table(() => store.attachments),
    userConversationPreferences: table(() => []),
    userMessageDeletion: table(() => store.deletions),
    userPreferences: table(() => store.preferences),
    userPreference: table(() => []),
  }) as never;

let app: FastifyInstance;

const build = async (viewer: string | null = V) => {
  app = Fastify();
  app.decorate('prisma', prisma());
  app.decorate('authenticate', async (request: AnyRow) => {
    request.authContext = viewer
      ? { isAuthenticated: true, registeredUser: { id: viewer } }
      : { isAuthenticated: false, registeredUser: null };
  });
  await getUserInCommon(app);
  await app.ready();
};

const get = async (target: string, query = '') => {
  const res = await app.inject({ method: 'GET', url: `/users/${target}/in-common${query}` });
  return { status: res.statusCode, body: res.json() as AnyRow };
};

beforeEach(() => {
  seq = 0;
  clearPrivacyPreferencesCache();
  process.env.IN_COMMON_FRIENDS_ENABLED = 'true';
});

afterEach(async () => {
  delete process.env.IN_COMMON_FRIENDS_ENABLED;
  await app?.close();
});

const LOCKED = {
  communities: { state: 'locked', circle: 'COMMUNITY' },
  friends: { state: 'locked', circle: 'FRIEND' },
  media: { state: 'locked', circle: 'ACQUAINTANCE' },
};

describe('GET /users/:id/in-common — chaque partie gardée par son cercle', () => {
  it('un inconnu sans communauté ne lit rien, aucun nombre', async () => {
    store = baseStore('PUBLIC');
    await build();
    const { status, body } = await get(T);
    expect(status).toBe(200);
    expect(body.data.parts).toEqual(LOCKED);
  });

  it('une Connaissance lit les médias, pas les amis', async () => {
    store = baseStore('ACQUAINTANCE');
    await build();
    const { body } = await get(T);
    expect(body.data.parts.media.state).toBe('open');
    expect(body.data.parts.friends).toEqual(LOCKED.friends);
  });

  it.each([
    ['bloquée par la cible', () => (store.users.find((u) => u.id === T)!.blockedUserIds = [V])],
    ['bloquée par le lecteur', () => (store.users.find((u) => u.id === V)!.blockedUserIds = [T])],
    ['désactivée', () => (store.users.find((u) => u.id === T)!.deactivatedAt = new Date())],
    ['supprimée', () => (store.users.find((u) => u.id === T)!.deletedAt = new Date())],
  ])('cible %s, sur un lien Sang : la réponse d’un inconnu', async (_label, mutate) => {
    store = baseStore('BLOOD');
    mutate();
    await build();
    expect((await get(T)).body.data.parts).toEqual(LOCKED);
  });

  it('introuvable, mal formée ou soi-même : la réponse d’un inconnu, jamais un 404', async () => {
    store = baseStore('BLOOD');
    await build();
    for (const target of [OUTSIDER, 'not-an-id', V]) {
      const { status, body } = await get(target);
      expect(status).toBe(200);
      expect(body.data.parts).toEqual(LOCKED);
    }
  });

  it('un anonyme est refusé', async () => {
    store = baseStore('BLOOD');
    await build(null);
    expect((await get(T)).status).toBe(403);
  });
});

describe('les communautés en commun', () => {
  it('seulement celles des deux, actives et non supprimées, comptées et listées', async () => {
    store = baseStore('PUBLIC');
    store.communities = [
      { id: 'c1', identifier: 'mshy_a', name: 'Alpha', avatar: null, isPrivate: true, isActive: true, deletedAt: null, createdBy: OUTSIDER },
      { id: 'c2', identifier: 'mshy_b', name: 'Bravo', avatar: null, isPrivate: false, isActive: true, deletedAt: null },
      { id: 'c3', identifier: 'mshy_c', name: 'Charlie', avatar: null, isPrivate: false, isActive: true, deletedAt: new Date() },
      { id: 'c4', identifier: 'mshy_d', name: 'Delta', avatar: null, isPrivate: false, isActive: true, deletedAt: null },
    ];
    store.members = [
      ...['c1', 'c2', 'c3'].map((communityId) => ({ userId: V, communityId, isActive: true })),
      ...['c1', 'c3', 'c4'].map((communityId) => ({ userId: T, communityId, isActive: true })),
      { userId: T, communityId: 'c2', isActive: false },
    ];
    await build();
    const { body } = await get(T, '?parts=communities');
    expect(Object.keys(body.data.parts)).toEqual(['communities']);
    expect(body.data.parts.communities).toEqual({
      state: 'open',
      circle: 'COMMUNITY',
      total: 1,
      items: [{ id: 'c1', identifier: 'mshy_a', name: 'Alpha', avatar: null, isPrivate: true }],
    });
  });
});

describe('les amis en commun', () => {
  const friendsStore = () => {
    store = baseStore('FRIEND');
    store.relations.push(
      link(V, F1, 'CLOSE', 'FRIEND'),
      link(T, F1, 'BLOOD'),
      link(V, F2, 'FRIEND'),
      link(T, F2, 'FRIEND'),
      link(V, F3, 'FRIEND'),
      link(T, F3, 'FRIEND'),
      link(V, F4, 'FRIEND'),
      link(T, F4, 'FRIEND'),
      link(V, F5, 'FRIEND'),
      link(T, F5, 'FRIEND'),
      link(T, ONLY_T, 'FRIEND'),
      link(V, ONLY_T, 'ACQUAINTANCE'),
    );
  };

  it('le cercle servi est celui que le LECTEUR accorde, jamais celui de la cible', async () => {
    friendsStore();
    await build();
    const { body } = await get(T, '?parts=friends');
    const items = body.data.parts.friends.items as AnyRow[];
    expect(items[0]).toEqual({ id: F1, username: 'uc1', displayName: 'User c1', avatar: null, circle: 'CLOSE' });
    expect(Object.keys(items[0]).sort()).toEqual(['avatar', 'circle', 'displayName', 'id', 'username']);
  });

  it('n’en sortent ni le bloqué, ni celui qui a bloqué la cible, ni le désactivé, ni le caché, ni l’ami d’un seul', async () => {
    friendsStore();
    store.users.find((u) => u.id === F2)!.blockedUserIds = [V];
    store.users.find((u) => u.id === F3)!.blockedUserIds = [T];
    store.users.find((u) => u.id === F4)!.deactivatedAt = new Date();
    store.preferences = [{ userId: F5, privacy: { hideProfileFromSearch: true } }];
    await build();
    const { body } = await get(T, '?parts=friends');
    expect(body.data.parts.friends.total).toBe(1);
    expect((body.data.parts.friends.items as AnyRow[]).map((f) => f.id)).toEqual([F1]);
  });

  it('un lecteur Connaissance de la cible ne lit pas ses amis', async () => {
    friendsStore();
    store.relations[0] = link(V, T, 'ACQUAINTANCE');
    await build();
    expect((await get(T, '?parts=friends')).body.data.parts).toEqual({ friends: LOCKED.friends });
  });

  it('drapeau serveur éteint par défaut : la partie ne part pas', async () => {
    friendsStore();
    delete process.env.IN_COMMON_FRIENDS_ENABLED;
    await build();
    const { body } = await get(T);
    expect(Object.keys(body.data.parts)).toEqual(['communities', 'media']);
  });
});

describe('les médias des conversations partagées', () => {
  const mediaStore = () => {
    store = baseStore('ACQUAINTANCE');
    store.conversations = [
      { id: 'k1', encryptionMode: null },
      { id: 'k2', encryptionMode: 'e2ee' },
      { id: 'k3', encryptionMode: null },
    ];
    store.participants = [
      participant(V, 'k1'),
      participant(T, 'k1'),
      participant(V, 'k2'),
      participant(T, 'k2'),
      participant(V, 'k3'),
    ];
  };

  it('compte et liste par type ; rien d’une conversation où la cible n’est pas, ni chiffrée de bout en bout', async () => {
    mediaStore();
    store.attachments = [
      attachment('k1', 'image/jpeg'),
      attachment('k1', 'image/png'),
      attachment('k1', 'video/mp4'),
      attachment('k1', 'audio/ogg'),
      attachment('k1', 'application/pdf'),
      attachment('k2', 'image/jpeg'),
      attachment('k3', 'image/jpeg'),
    ];
    await build();
    const { body } = await get(T, '?parts=media');
    const media = body.data.parts.media;
    expect(media.counts).toEqual({ image: 2, video: 1, audio: 1, file: 1 });
    expect(media.countsCapped).toBe(false);
    expect((media.items as AnyRow[]).every((item) => item.conversationId === 'k1')).toBe(true);
    expect(media.items).toHaveLength(5);
  });

  it('filtre par type et pagine', async () => {
    mediaStore();
    store.attachments = [attachment('k1', 'image/jpeg'), attachment('k1', 'image/png'), attachment('k1', 'application/zip')];
    await build();
    const first = (await get(T, '?parts=media&mediaKind=image&limit=1')).body.data.parts.media;
    expect(first.items.map((i: AnyRow) => i.kind)).toEqual(['image']);
    expect(first.pagination).toEqual({ limit: 1, hasMore: true, nextCursor: first.items[0].id });
    const second = (await get(T, `?parts=media&mediaKind=image&limit=1&cursor=${first.pagination.nextCursor}`)).body.data.parts.media;
    expect(second.items[0].id).not.toBe(first.items[0].id);
    const files = (await get(T, '?parts=media&mediaKind=file')).body.data.parts.media;
    expect(files.items.map((i: AnyRow) => i.mimeType)).toEqual(['application/zip']);
  });

  it('exclut vue unique, éphémère, flouté, chiffré et l’effet posé par son seul bit — ni listés ni comptés', async () => {
    mediaStore();
    store.attachments = [
      attachment('k1', 'image/jpeg'),
      attachment('k1', 'image/jpeg', { isViewOnce: true }),
      attachment('k1', 'image/jpeg', { isBlurred: true }),
      attachment('k1', 'image/jpeg', { isEncrypted: true }),
      attachment('k1', 'image/jpeg', {}, { expiresAt: new Date('2099-01-01') }),
      attachment('k1', 'image/jpeg', {}, { isEncrypted: true }),
      attachment('k1', 'image/jpeg', {}, { isViewOnce: true }),
      attachment('k1', 'image/jpeg', { effectFlags: 0xffff }),
      attachment('k1', 'image/jpeg', {}, { deletedAt: new Date() }),
    ];
    await build();
    const media = (await get(T, '?parts=media')).body.data.parts.media;
    expect(media.items).toHaveLength(1);
    expect(media.counts.image).toBe(1);
  });

  it('un message supprimé pour moi ne sort pas', async () => {
    mediaStore();
    const hidden = attachment('k1', 'image/jpeg');
    store.attachments = [attachment('k1', 'image/jpeg'), hidden];
    store.deletions = [{ userId: V, messageId: hidden.messageId, message: { conversationId: 'k1' } }];
    await build();
    const media = (await get(T, '?parts=media')).body.data.parts.media;
    expect(media.items.map((i: AnyRow) => i.id)).not.toContain(hidden.id);
    expect(media.counts.image).toBe(1);
  });
});
