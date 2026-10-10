/**
 * #10000 — la conversation World Wide existe à chaque déploiement, avec son
 * lien de partage.
 *
 * Le double de Prisma ici est une petite base EN MÉMOIRE qui tient les index
 * uniques que la vraie base tient (`Conversation.identifier`,
 * `ConversationShareLink.identifier`/`linkId`, `Participant(conversationId,
 * userId)`) : l'idempotence ne s'observe que sur des lignes, jamais sur des
 * appels de mock comptés.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  WORLD_CONVERSATION_IDENTIFIER,
  WORLD_CONVERSATION_TITLE,
  WORLD_SHARE_LINK_IDENTIFIER,
} from '@meeshy/shared/types/world';
import { ensureWorldConversation, loadWorldEntry } from '../../../services/world/worldConversation';

type Row = Record<string, unknown> & { id: string };

type Where = Record<string, unknown>;

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Where[]).some((clause) => matches(row, clause));
    if (key === 'AND') return (expected as Where[]).every((clause) => matches(row, clause));
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const operator = expected as { in?: unknown[] };
      if (operator.in) return operator.in.includes(row[key]);
    }
    return row[key] === expected;
  });
}

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

/** Une table en mémoire qui REFUSE un doublon sur ses clés uniques, comme Mongo. */
function table(name: string, uniqueKeys: readonly (readonly string[])[], seed: readonly Row[] = []) {
  const rows: Row[] = seed.map((row) => ({ ...row }));
  let sequence = 0;
  const pick = (row: Row, select?: Record<string, unknown>) =>
    select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k] ?? null])) : { ...row };
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    rows,
    findFirst: jest.fn(async (args: { where?: Where; select?: Record<string, unknown> } = {}) => {
      await tick();
      const row = rows.find((candidate) => matches(candidate, args.where));
      return row ? pick(row, args.select) : null;
    }),
    findUnique: jest.fn(async (args: { where: Where; select?: Record<string, unknown> }) => {
      await tick();
      const row = rows.find((candidate) => matches(candidate, args.where));
      return row ? pick(row, args.select) : null;
    }),
    findMany: jest.fn(async (args: { where?: Where; select?: Record<string, unknown> } = {}) => {
      await tick();
      return rows.filter((candidate) => matches(candidate, args.where)).map((row) => pick(row, args.select));
    }),
    count: jest.fn(async (args: { where?: Where } = {}) => {
      await tick();
      return rows.filter((candidate) => matches(candidate, args.where)).length;
    }),
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      await tick();
      const candidate: Row = { ...args.data, id: `${name}-${++sequence}` };
      const clash = uniqueKeys.some((keys) =>
        rows.some((row) => keys.every((key) => row[key] !== undefined && row[key] === candidate[key])),
      );
      if (clash) throw uniqueViolation();
      rows.push(candidate);
      return { ...candidate };
    }),
    update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      await tick();
      const index = rows.findIndex((row) => row.id === args.where.id);
      rows[index] = { ...rows[index], ...args.data };
      return { ...rows[index] };
    }),
  };
}

const MEESHY = { id: 'user-meeshy', username: 'meeshy', displayName: 'Meeshy Sama', systemLanguage: 'en' };
const ADMIN = { id: 'user-admin', username: 'admin', displayName: null, systemLanguage: 'fr' };
const JCNM = { id: 'user-jcnm', username: 'jcnm', displayName: 'J-C', systemLanguage: 'fr' };

function makeDb(options: { users?: readonly Row[]; links?: readonly Row[]; conversations?: readonly Row[] } = {}) {
  const prisma = {
    conversation: table('conversation', [['identifier']], options.conversations),
    user: table('user', [['username']], options.users ?? [MEESHY, ADMIN, JCNM]),
    participant: table('participant', [['conversationId', 'userId']]),
    conversationShareLink: table('link', [['identifier'], ['linkId']], options.links),
  };
  return prisma;
}

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function seed(prisma: ReturnType<typeof makeDb>, logger = makeLogger()) {
  return ensureWorldConversation({ prisma: prisma as never, logger });
}

function worldConversation(prisma: ReturnType<typeof makeDb>) {
  return prisma.conversation.rows.filter((row) => row.identifier === WORLD_CONVERSATION_IDENTIFIER);
}

function roleOf(prisma: ReturnType<typeof makeDb>, userId: string): unknown {
  return prisma.participant.rows.find((row) => row.userId === userId)?.role;
}

describe('ensureWorldConversation — la conversation World Wide (#10000)', () => {
  it('crée la conversation « world », type global, titre « World Wide »', async () => {
    const prisma = makeDb();

    await seed(prisma);

    const [conversation] = worldConversation(prisma);
    expect(conversation).toMatchObject({
      identifier: WORLD_CONVERSATION_IDENTIFIER,
      type: 'global',
      title: WORLD_CONVERSATION_TITLE,
      isActive: true,
    });
  });

  it('pose meeshy en créateur, admin et jcnm en administrateurs', async () => {
    const prisma = makeDb();

    await seed(prisma);

    expect(roleOf(prisma, MEESHY.id)).toBe('creator');
    expect(roleOf(prisma, ADMIN.id)).toBe('admin');
    expect(roleOf(prisma, JCNM.id)).toBe('admin');
    expect(prisma.participant.rows.every((row) => row.isActive === true && row.type === 'user')).toBe(true);
  });

  it('écrit la langue du compte sur la participation, jamais le défaut du schéma', async () => {
    const prisma = makeDb();

    await seed(prisma);

    expect(prisma.participant.rows.find((row) => row.userId === ADMIN.id)?.language).toBe('fr');
  });

  it('ne crée jamais jcnm : absent, il est journalisé et le seed continue', async () => {
    const prisma = makeDb({ users: [MEESHY, ADMIN] });
    const logger = makeLogger();

    const report = await seed(prisma, logger);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.rows.map((row) => row.username)).toEqual(['meeshy', 'admin']);
    expect(report.members).toContainEqual({ username: 'jcnm', outcome: 'absent' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('jcnm'));
    expect(roleOf(prisma, ADMIN.id)).toBe('admin');
  });

  it('promeut jcnm quand il est déjà membre ordinaire', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const jcnmRow = prisma.participant.rows.find((row) => row.userId === JCNM.id)!;
    jcnmRow.role = 'member';

    const report = await seed(prisma);

    expect(roleOf(prisma, JCNM.id)).toBe('admin');
    expect(report.members).toContainEqual({ username: 'jcnm', outcome: 'promoted' });
  });

  it('respecte un départ : une participation inactive n’est ni réveillée ni réécrite', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const adminRow = prisma.participant.rows.find((row) => row.userId === ADMIN.id)!;
    adminRow.isActive = false;
    adminRow.role = 'member';

    const report = await seed(prisma);

    expect(adminRow).toMatchObject({ isActive: false, role: 'member' });
    expect(report.members).toContainEqual({ username: 'admin', outcome: 'left' });
  });

  it('laisse « Meeshy Global » intacte', async () => {
    const global = { id: 'conv-meeshy', identifier: 'meeshy', title: 'Meeshy Global', type: 'global', isActive: true };
    const prisma = makeDb({ conversations: [global] });

    await seed(prisma);

    expect(prisma.conversation.rows.find((row) => row.identifier === 'meeshy')).toEqual(global);
    expect(prisma.participant.rows.some((row) => row.conversationId === global.id)).toBe(false);
  });
});

describe('ensureWorldConversation — le lien de partage stable', () => {
  it('crée UN lien « mshy_world » sur World Wide, ouvert aux invités sans compte, créé par meeshy', async () => {
    const prisma = makeDb();

    await seed(prisma);

    const [conversation] = worldConversation(prisma);
    expect(prisma.conversationShareLink.rows).toHaveLength(1);
    expect(prisma.conversationShareLink.rows[0]).toMatchObject({
      identifier: WORLD_SHARE_LINK_IDENTIFIER,
      conversationId: conversation.id,
      createdBy: MEESHY.id,
      isActive: true,
      requireAccount: false,
      requireNickname: true,
      allowAnonymousMessages: true,
      allowAnonymousImages: false,
    });
    expect(prisma.conversationShareLink.rows[0].linkId).toMatch(/^mshy_[A-Za-z0-9]+$/);
    expect(prisma.conversationShareLink.rows[0].linkId).not.toBe(WORLD_SHARE_LINK_IDENTIFIER);
  });

  it('ne recrée pas le lien qu’un administrateur a fermé', async () => {
    const prisma = makeDb();
    await seed(prisma);
    prisma.conversationShareLink.rows[0].isActive = false;

    const report = await seed(prisma);

    expect(prisma.conversationShareLink.rows).toHaveLength(1);
    expect(prisma.conversationShareLink.rows[0].isActive).toBe(false);
    expect(report.shareLink).toBe('existing');
  });

  it('refuse de détourner « mshy_world » quand il désigne une AUTRE conversation', async () => {
    const foreign = { id: 'link-foreign', identifier: WORLD_SHARE_LINK_IDENTIFIER, linkId: 'mshy_abc', conversationId: 'conv-other', isActive: true };
    const prisma = makeDb({ links: [foreign] });
    const logger = makeLogger();

    const report = await seed(prisma, logger);

    expect(report.shareLink).toBe('identifier-taken');
    expect(prisma.conversationShareLink.rows).toEqual([foreign]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(WORLD_SHARE_LINK_IDENTIFIER));
  });

  it('sans le compte meeshy, crée la conversation mais aucun lien sans créateur', async () => {
    const prisma = makeDb({ users: [ADMIN] });

    const report = await seed(prisma);

    expect(worldConversation(prisma)).toHaveLength(1);
    expect(prisma.conversationShareLink.rows).toHaveLength(0);
    expect(report.shareLink).toBe('skipped-no-creator');
  });
});

describe('ensureWorldConversation — idempotence', () => {
  it('un double appel ne duplique rien : une conversation, un lien, une participation par compte', async () => {
    const prisma = makeDb();

    const first = await seed(prisma);
    const second = await seed(prisma);

    expect(worldConversation(prisma)).toHaveLength(1);
    expect(prisma.conversationShareLink.rows).toHaveLength(1);
    expect(prisma.participant.rows).toHaveLength(3);
    expect(first).toMatchObject({ conversation: 'created', shareLink: 'created' });
    expect(second).toMatchObject({ conversation: 'existing', shareLink: 'existing' });
    expect(second.members.every((member) => member.outcome === 'already-member')).toBe(true);
  });

  it('deux instances qui démarrent EN MÊME TEMPS convergent sur les mêmes lignes', async () => {
    const prisma = makeDb();

    await Promise.all([seed(prisma), seed(prisma)]);

    expect(worldConversation(prisma)).toHaveLength(1);
    expect(prisma.conversationShareLink.rows).toHaveLength(1);
    expect(prisma.participant.rows).toHaveLength(3);
  });
});

describe('loadWorldEntry — ce que la landing reçoit', () => {
  it('sert l’identifiant du lien et l’effectif, sans aucun id', async () => {
    const prisma = makeDb();
    await seed(prisma);

    const entry = await loadWorldEntry(prisma as never);

    expect(entry).toEqual({
      identifier: WORLD_CONVERSATION_IDENTIFIER,
      title: WORLD_CONVERSATION_TITLE,
      shareLinkIdentifier: WORLD_SHARE_LINK_IDENTIFIER,
      memberCount: 3,
    });
  });

  it('plafonne l’effectif à « 199+ » comme pour tout lecteur anonyme', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const [conversation] = worldConversation(prisma);
    for (let index = 0; index < 250; index += 1) {
      prisma.participant.rows.push({ id: `guest-${index}`, conversationId: conversation.id, userId: undefined, isActive: true, type: 'anonymous' });
    }

    const entry = await loadWorldEntry(prisma as never);

    expect(entry).toMatchObject({ memberCount: 199, memberCountCapped: true });
  });

  it('ne compte pas les participations inactives', async () => {
    const prisma = makeDb();
    await seed(prisma);
    prisma.participant.rows[0].isActive = false;

    const entry = await loadWorldEntry(prisma as never);

    expect(entry?.memberCount).toBe(2);
  });

  it('rend null quand le lien est fermé — la landing ne propose pas une porte murée', async () => {
    const prisma = makeDb();
    await seed(prisma);
    prisma.conversationShareLink.rows[0].isActive = false;

    expect(await loadWorldEntry(prisma as never)).toBeNull();
  });

  it('rend null avant tout seed', async () => {
    expect(await loadWorldEntry(makeDb() as never)).toBeNull();
  });
});
