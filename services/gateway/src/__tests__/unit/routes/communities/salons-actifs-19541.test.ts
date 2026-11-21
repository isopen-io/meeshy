/**
 * #19541 — les salons d'une communauté ne listent que ce que le membre peut
 * OUVRIR, avec leur vrai nombre de membres.
 *
 * `GET /communities/:id/conversations` servait les salons quittés, bannis,
 * fermés ou rendus obsolètes (le `where` ne demandait `isActive` ni à la
 * participation ni à la conversation, quand `GET /conversations` exige les
 * deux), et son `memberCount` était la colonne MORTE `Conversation.memberCount`
 * (`@default(0)`, écrite nulle part) : « 0 membre » sur chaque salon web.
 *
 * Le double Prisma ci-dessous FILTRE vraiment sur le `where` reçu et COMPTE
 * vraiment selon le `_count.select` reçu : un double qui rendrait ce qu'on lui
 * dicte attesterait un résultat, pas une requête.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../../helpers/mongo-where';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));
jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

import { registerCoreRoutes } from '../../../../routes/communities/core';
import { COMMUNITY_ACTIVE_COUNTS } from '../../../../routes/communities/serialization';

const READER = '507f1f77bcf86cd799439011';
const COMMUNITY = '507f1f77bcf86cd799439021';
const userId = (n: number) => `507f1f77bcf86cd7994390${String(30 + n)}`;

type ParticipantRow = {
  readonly id: string; readonly userId: string; readonly isActive: boolean;
  readonly role: string; readonly joinedAt: Date;
  /** #20209 — ABSENT par défaut, comme dans la base : une ligne jamais bannie ne porte pas la colonne. */
  readonly bannedAt?: Date;
};
type ConversationRow = {
  readonly id: string;
  readonly communityId: string;
  readonly isActive: boolean;
  readonly memberCount: number;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly participants: readonly ParticipantRow[];
};

const participant = (uid: string, isActive: boolean, n: number): ParticipantRow => ({
  id: `507f1f77bcf86cd7994391${String(10 + n)}`,
  userId: uid,
  isActive,
  role: 'member',
  joinedAt: new Date(2026, 0, n + 1),
});

const salon = (id: string, rows: readonly ParticipantRow[], isActive = true): ConversationRow => ({
  id,
  communityId: COMMUNITY,
  isActive,
  memberCount: 0,
  title: id,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  participants: rows,
});

const OPEN = '507f1f77bcf86cd799439101';
const LEFT = '507f1f77bcf86cd799439102';
const OBSOLETE = '507f1f77bcf86cd799439103';
const BANNED = '507f1f77bcf86cd799439104';

const fixtures = (): readonly ConversationRow[] => [
  // 3 actifs (dont le lecteur) et 2 partis
  salon(OPEN, [
    participant(READER, true, 0),
    participant(userId(1), true, 1),
    participant(userId(2), true, 2),
    participant(userId(3), false, 3),
    participant(userId(4), false, 4),
  ]),
  // le lecteur l'a QUITTÉ — `isActive: false`
  salon(LEFT, [participant(READER, false, 0), participant(userId(1), true, 1)]),
  // #20209 — le lecteur en est BANNI, et sa ligne est restée ACTIVE.
  //
  // Le commentaire d'origine de la fixture ci-dessus disait « ou en a été banni :
  // même écriture, `isActive: false` ». C'est vrai du chemin NOMINAL depuis
  // #19688, et FAUX des lignes héritées d'avant #10436 — celles que ce milestone
  // entier vise, et dont le dépôt dit qu'elles existent en base sans qu'aucune
  // migration les ait reprises. Le témoin qui s'appelle « ne sert ni le salon
  // quitté ou BANNI » ne modélisait donc que le salon QUITTÉ : il ne pouvait pas
  // voir le seul état pour lequel la loi existe.
  salon(BANNED, [
    { ...participant(READER, true, 0), bannedAt: new Date('2026-11-01T00:00:00Z') },
    participant(userId(1), true, 1),
  ]),
  // fermé ou rendu obsolète : `isActive: false` sur la conversation
  salon(OBSOLETE, [participant(READER, true, 0)], false),
];

/**
 * #20209 — LA SÉMANTIQUE MONGO DU DÉPÔT, et non plus une égalité écrite à la
 * main.
 *
 * Le matcheur précédent était `Object.entries(filter).every(([k, v]) => row[k] === v)` :
 * une égalité STRICTE, clé par clé. Il ne savait exprimer **aucune** des formes
 * de la loi — ni `OR`, ni `{ isSet: false }`, ni `AND` — si bien qu'il rendait
 * `false` sur toute clause qui en porte une, et que resserrer la production
 * faisait disparaître TOUTES les lignes.
 *
 * Pire, dans l'autre sens : un filtre dont il ne comprend pas une clé
 * l'évalue `undefined === valeur`, donc refuse — **il mentait par ce qu'il
 * REFUSE**, le jumeau du « double qui ment par ce qu'il ACCEPTE ».
 *
 * `matchesMongoWhere` est la seule sémantique du dépôt, elle traverse les
 * filtres de relation (`some`/`every`/`none`) et elle sait qu'un champ ABSENT
 * n'est pas un champ à `null` — ce dont la garde `bannedAt` dépend
 * entièrement.
 */
const matchesRow = (row: ParticipantRow, filter: unknown) =>
  matchesMongoWhere(row as unknown as MongoDocument, filter as MongoDocument);

const matches = (c: ConversationRow, where: unknown) =>
  matchesMongoWhere(c as unknown as MongoDocument, where as MongoDocument);

type CountSelect = Record<string, true | { where?: Partial<ParticipantRow> }>;

function project(c: ConversationRow, include: { participants?: { where?: Partial<ParticipantRow>; take?: number }; _count?: { select: CountSelect } }) {
  const shown = c.participants
    .filter(p => include.participants?.where === undefined || matchesRow(p, include.participants.where))
    .slice(0, include.participants?.take ?? Infinity)
    .map(p => ({ ...p, user: { id: p.userId, username: `u${p.userId.slice(-2)}`, displayName: null, avatar: null, isOnline: false } }));
  const select = include._count?.select ?? {};
  const counted = Object.fromEntries(
    Object.entries(select).map(([key, spec]) => {
      if (key !== 'participants') return [key, 0];
      const filter = spec === true ? undefined : spec.where;
      return [key, c.participants.filter(p => filter === undefined || matchesRow(p, filter)).length];
    }),
  );
  return { ...c, participants: shown, _count: counted };
}

function makePrisma() {
  const rows = fixtures();
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({ createdBy: READER, isPrivate: false, members: [{ userId: READER }] }),
    },
    conversation: {
      findMany: jest.fn<any>(async (args: any) => rows.filter(c => matches(c, args.where)).map(c => project(c, args.include))),
      count: jest.fn<any>(async (args: any) => rows.filter(c => matches(c, args.where)).length),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: READER, registeredUser: { id: READER, role: 'USER' } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(registerCoreRoutes);
  await app.ready();
  return app;
}

async function listSalons() {
  const prisma = makePrisma();
  const app = await buildApp(prisma);
  try {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY}/conversations` });
    return { res, body: res.json() as { data: Array<Record<string, any>>; pagination: { total: number } }, prisma };
  } finally {
    await app.close();
  }
}

describe('GET /communities/:id/conversations — ce que le membre peut ouvrir (#19541)', () => {
  it('ne sert ni le salon quitté ou banni, ni le salon fermé ou obsolète', async () => {
    const { res, body } = await listSalons();
    expect(res.statusCode).toBe(200);
    expect(body.data.map(c => c.id)).toEqual([OPEN]);
  });

  it('le total paginé suit le même filtre que la page', async () => {
    const { body, prisma } = await listSalons();
    expect(body.pagination.total).toBe(1);
    expect(prisma.conversation.count.mock.calls[0]?.[0]).toEqual({ where: prisma.conversation.findMany.mock.calls[0]?.[0].where });
  });

  it('sert l\'effectif ACTIF (3 actifs, 2 partis ⇒ 3), jamais la colonne morte', async () => {
    const { body } = await listSalons();
    expect(body.data[0]?.memberCount).toBe(3);
    expect(body.data[0]?._count?.participants).toBe(3);
  });

  it('ne nomme que les participants actifs du salon, pas ceux qui en sont partis', async () => {
    const { body } = await listSalons();
    const shown = (body.data[0]?.participants ?? []).map((p: any) => p.userId);
    expect(shown).toEqual([READER, userId(1), userId(2)]);
  });
});

describe('le compteur « salons » d\'une communauté (#19541)', () => {
  it('ne compte que les salons actifs', () => {
    expect(COMMUNITY_ACTIVE_COUNTS.Conversation).toEqual({ where: { isActive: true } });
  });
});
