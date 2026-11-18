/**
 * « Notre histoire » (#19378) : `GET /users/:id/in-common?parts=history` sert la
 * frise d'une paire — premier message, entrée à chaque niveau EFFECTIF, jalons —
 * gardée par son cercle, sans accord unilatéral ni baisse.
 *
 * Le double Prisme APPLIQUE les clauses `where` / `orderBy` / `skip` qu'il reçoit :
 * un faux qui rendrait ses lignes quelle que soit la requête verdirait sur un
 * comptage sans borne de conversation ou d'auteur.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { getUserInCommon } from '../../../../routes/users/in-common';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const V = '65a0000000000000000000a1';
const T = '65a0000000000000000000b2';
const THIRD = '65a0000000000000000000c1';
const DM = '65c0000000000000000000d1';
const GROUP = '65c0000000000000000000d2';

type AnyRow = Record<string, any>;

const matches = (row: AnyRow | null | undefined, where: AnyRow | undefined): boolean => {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as AnyRow[]).every((w) => matches(row, w));
    if (key === 'OR') return (cond as AnyRow[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond === null) return key in row && value === null;
    if (key === 'NOT') return Array.isArray(cond) ? !cond.some((w) => matches(row, w)) : !matches(row, cond);
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond !== 'object') return value === cond;
    const ops = ['in', 'has', 'not', 'isSet'];
    if (!Object.keys(cond).some((op) => ops.includes(op))) return matches(value, cond as AnyRow);
    const c = cond as AnyRow;
    if ('in' in c && !c.in.includes(value)) return false;
    if ('has' in c && !(value ?? []).includes(c.has)) return false;
    if ('isSet' in c && (key in row) !== c.isSet) return false;
    if ('not' in c && (c.not === null ? value == null : value === c.not)) return false;
    return true;
  });
};

const query = (rows: () => AnyRow[]) => (args: AnyRow = {}) => {
  const found = rows().filter((r) => matches(r, args.where));
  const [[field, dir]] = Object.entries(args.orderBy ?? { id: 'asc' });
  const sorted = [...found].sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  return sorted.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? Infinity));
};

const table = (rows: () => AnyRow[]) => ({
  findMany: jest.fn(async (args: AnyRow = {}) => query(rows)(args)),
  findFirst: jest.fn(async (args: AnyRow = {}) => query(rows)({ ...args, take: 1 })[0] ?? null),
  count: jest.fn(async (args: AnyRow = {}) => rows().filter((r) => matches(r, args.where)).length),
});

const user = (id: string, extra: AnyRow = {}): AnyRow => ({
  id, username: `u${id.slice(-2)}`, displayName: null, avatar: null, role: 'USER', birthDate: null,
  isActive: true, deletedAt: null, deactivatedAt: null, blockedUserIds: [], ...extra,
});

const day = (d: string): Date => new Date(`2026-${d}T10:00:00.000Z`);
const step = (actorId: string, from: string, to: string, at: string) => ({ actorId, from, to, at: day(at), cause: 'explicit' });

const relation = (byV: string, byT: string, transitions: AnyRow[]): AnyRow => {
  const [low, high] = V < T ? [V, T] : [T, V];
  return {
    id: 'rel', userLowId: low, userHighId: high,
    grantedByLow: low === V ? byV : byT, grantedByHigh: low === V ? byT : byV,
    transitions, updatedAt: day('01-01'),
  };
};

const RISE_TO_CLOSE = [
  step(T, 'PUBLIC', 'ACQUAINTANCE', '03-06'),
  step(V, 'PUBLIC', 'ACQUAINTANCE', '03-07'),
  step(V, 'ACQUAINTANCE', 'FRIEND', '03-10'),
  step(T, 'ACQUAINTANCE', 'FRIEND', '03-11'),
  step(T, 'FRIEND', 'CLOSE', '03-15'),
  step(V, 'FRIEND', 'CLOSE', '03-19'),
];

let mid = 0;
const participantId = (userId: string, conversationId: string): string => `p-${userId.slice(-2)}-${conversationId.slice(-2)}`;
const msg = (conversationId: string, authorUserId: string, createdAt: Date, extra: AnyRow = {}): AnyRow => {
  mid += 1;
  return {
    id: `m${String(mid).padStart(6, '0')}`,
    conversationId,
    senderId: participantId(authorUserId, conversationId),
    createdAt,
    messageSource: 'user',
    deletedAt: null,
    ...extra,
  };
};

type Store = { users: AnyRow[]; relations: AnyRow[]; members: AnyRow[]; participants: AnyRow[]; conversations: AnyRow[]; messages: AnyRow[] };
let store: Store;

const part = (userId: string, conversationId: string, extra: AnyRow = {}): AnyRow => ({
  id: participantId(userId, conversationId), userId, conversationId, isActive: true, ...extra,
});

const pairStore = (byV: string, byT: string, transitions: AnyRow[] = RISE_TO_CLOSE): Store => ({
  users: [user(V), user(T), user(THIRD)],
  relations: [relation(byV, byT, transitions)],
  members: [],
  participants: [part(V, DM), part(T, DM), part(V, GROUP), part(T, GROUP), part(THIRD, GROUP)],
  conversations: [
    { id: DM, type: 'direct', isActive: true, deletedAt: null },
    { id: GROUP, type: 'group', isActive: true, deletedAt: null },
  ],
  messages: [],
});

let messageTable: ReturnType<typeof table>;

const prisma = () => {
  messageTable = table(() => store.messages);
  return {
    user: { ...table(() => store.users), findUnique: jest.fn(async (a: AnyRow) => store.users.find((u) => u.id === a.where.id) ?? null) },
    userRelation: {
      ...table(() => store.relations),
      findUnique: jest.fn(async (a: AnyRow) => {
        const key = a.where.userLowId_userHighId;
        return store.relations.find((r) => r.userLowId === key.userLowId && r.userHighId === key.userHighId) ?? null;
      }),
    },
    friendRequest: table(() => []),
    communityMember: table(() => store.members),
    community: table(() => []),
    participant: table(() => store.participants),
    conversation: table(() => store.conversations),
    message: messageTable,
    messageAttachment: table(() => []),
    conversationShareLink: table(() => []),
    userConversationPreferences: table(() => []),
    userMessageDeletion: table(() => []),
    userPreferences: table(() => []),
    userPreference: table(() => []),
  } as never;
};

let app: FastifyInstance;

const build = async () => {
  app = Fastify();
  app.decorate('prisma', prisma());
  app.decorate('authenticate', async (request: AnyRow) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: V } };
  });
  await getUserInCommon(app);
  await app.ready();
};

const get = async (q = '?parts=history') => {
  const res = await app.inject({ method: 'GET', url: `/users/${T}/in-common${q}` });
  return { status: res.statusCode, body: res.json() as AnyRow };
};

beforeEach(() => {
  mid = 0;
  clearPrivacyPreferencesCache();
});

afterEach(async () => {
  await app?.close();
});

describe('GET /users/:id/in-common?parts=history — « Notre histoire » (#19378)', () => {
  it('une paire de Proches lit sa frise : premier message, Connaissances, Amis, Proches — dans l’ordre du temps', async () => {
    store = pairStore('CLOSE', 'CLOSE');
    store.messages = [msg(DM, T, day('03-06')), msg(DM, V, day('03-08'))];
    await build();
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.data.parts.history).toEqual({
      state: 'open',
      circle: 'ACQUAINTANCE',
      items: [
        { kind: 'first-message', at: day('03-06').toISOString() },
        { kind: 'level', level: 'ACQUAINTANCE', at: day('03-07').toISOString() },
        { kind: 'level', level: 'FRIEND', at: day('03-11').toISOString() },
        { kind: 'level', level: 'CLOSE', at: day('03-19').toISOString() },
      ],
    });
    expect(body.data.history).toEqual([
      { kind: 'firstMessage', at: day('03-06').toISOString() },
      { kind: 'acquaintance', at: day('03-07').toISOString() },
      { kind: 'friend', at: day('03-11').toISOString() },
      { kind: 'close', at: day('03-19').toISOString() },
    ]);
  });

  it('le Sang que la cible accorde SEULE ne se raconte pas : la frise s’arrête au cercle commun', async () => {
    store = pairStore('CLOSE', 'BLOOD', [...RISE_TO_CLOSE, step(T, 'CLOSE', 'BLOOD', '04-01')]);
    await build();
    const { body } = await get();
    const kinds = (body.data.history as AnyRow[]).map((s) => s.kind);
    expect(kinds).toEqual(['acquaintance', 'friend', 'close']);
    expect(JSON.stringify(body)).not.toContain(day('04-01').toISOString());
  });

  it('une baisse puis une remontée ne datent rien : Amis, et la date de leur première entrée seulement', async () => {
    store = pairStore('FRIEND', 'CLOSE', [...RISE_TO_CLOSE, step(V, 'CLOSE', 'ACQUAINTANCE', '04-02'), step(V, 'ACQUAINTANCE', 'FRIEND', '05-20')]);
    await build();
    const { body } = await get();
    expect((body.data.history as AnyRow[]).map((s) => s.kind)).toEqual(['acquaintance', 'friend']);
    const text = JSON.stringify(body);
    for (const hidden of ['03-19', '04-02', '05-20']) expect(text).not.toContain(day(hidden).toISOString());
  });

  it('le premier message est celui de la conversation DIRECTE : ni un groupe, ni un tiers, ni un supprimé, ni un message système', async () => {
    store = pairStore('ACQUAINTANCE', 'ACQUAINTANCE', []);
    store.messages = [
      msg(GROUP, T, day('01-01')),
      msg(DM, THIRD, day('01-02')),
      msg(DM, V, day('01-03'), { deletedAt: day('01-04') }),
      msg(DM, V, day('01-05'), { messageSource: 'system' }),
      msg(DM, T, day('02-14')),
    ];
    await build();
    const { body } = await get();
    expect(body.data.history).toEqual([{ kind: 'firstMessage', at: day('02-14').toISOString() }]);
  });

  it('le 1 000e message de la paire date le jalon « 1 000 messages », compté sur leurs seuls messages', async () => {
    store = pairStore('ACQUAINTANCE', 'ACQUAINTANCE', []);
    const base = day('03-01').getTime();
    store.messages = Array.from({ length: 1000 }, (_, i) => msg(DM, i % 2 ? V : T, new Date(base + i * 60_000)));
    store.messages.push(msg(GROUP, V, new Date(base - 1000)));
    await build();
    const { body } = await get();
    expect(body.data.history).toEqual([
      { kind: 'firstMessage', at: new Date(base).toISOString() },
      { kind: 'messages1000', at: new Date(base + 999 * 60_000).toISOString() },
    ]);
  });

  it('999 messages : pas de jalon', async () => {
    store = pairStore('ACQUAINTANCE', 'ACQUAINTANCE', []);
    const base = day('03-01').getTime();
    store.messages = Array.from({ length: 999 }, (_, i) => msg(DM, V, new Date(base + i * 60_000)));
    await build();
    const { body } = await get();
    expect((body.data.history as AnyRow[]).map((s) => s.kind)).toEqual(['firstMessage']);
  });

  it('sous la Connaissance (une communauté partagée), la partie est fermée, ne porte que son cercle, et aucun message n’est lu', async () => {
    store = pairStore('PUBLIC', 'PUBLIC', []);
    store.relations = [];
    store.members = [
      { userId: V, communityId: 'c1', isActive: true },
      { userId: T, communityId: 'c1', isActive: true },
    ];
    store.messages = [msg(DM, T, day('03-06'))];
    await build();
    const { body } = await get('?parts=history,communities');
    expect(body.data.parts.history).toEqual({ state: 'locked', circle: 'ACQUAINTANCE' });
    expect(body.data.parts.communities.state).toBe('open');
    expect(body.data).not.toHaveProperty('history');
    expect(messageTable.findFirst).not.toHaveBeenCalled();
    expect(messageTable.count).not.toHaveBeenCalled();
  });

  it('une cible qui a bloqué le lecteur, sur un lien Proche : fermée, comme un inconnu', async () => {
    store = pairStore('CLOSE', 'CLOSE');
    store.users.find((u) => u.id === T)!.blockedUserIds = [V];
    store.messages = [msg(DM, T, day('03-06'))];
    await build();
    const { body } = await get();
    expect(body.data.parts.history).toEqual({ state: 'locked', circle: 'ACQUAINTANCE' });
    expect(body.data).not.toHaveProperty('history');
  });

  it('partie OPTIONNELLE : un client qui ne nomme aucune partie ne la reçoit pas, et ne lit aucun message', async () => {
    store = pairStore('CLOSE', 'CLOSE');
    store.messages = [msg(DM, T, day('03-06'))];
    await build();
    const { body } = await get('');
    expect(Object.keys(body.data.parts).sort()).toEqual(['communities', 'media']);
    expect(body.data).not.toHaveProperty('history');
    expect(messageTable.count).not.toHaveBeenCalled();
  });
});
