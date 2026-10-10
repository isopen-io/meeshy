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
import type { WorldReservedIdentities } from '../../../services/world/worldReservedMembers';
import { inspectWorldSeed, removeWorldSeed } from '../../../services/world/worldSeedOperations';

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
    updateMany: jest.fn(async (args: { where?: Where; data: Record<string, unknown> }) => {
      await tick();
      const targets = rows.filter((row) => matches(row, args.where));
      targets.forEach((row) => Object.assign(row, args.data));
      return { count: targets.length };
    }),
    deleteMany: jest.fn(async (args: { where?: Where } = {}) => {
      await tick();
      const kept = rows.filter((row) => !matches(row, args.where));
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { count };
    }),
    delete: jest.fn(async (args: { where: { id: string } }) => {
      await tick();
      const index = rows.findIndex((row) => row.id === args.where.id);
      const [removed] = rows.splice(index, 1);
      return removed;
    }),
  };
}

const VERIFIED = new Date('2026-01-01T00:00:00Z');

function account(overrides: Row): Row {
  return { isActive: true, deletedAt: null, emailVerifiedAt: VERIFIED, role: 'USER', displayName: null, systemLanguage: 'fr', ...overrides };
}

const MEESHY = account({ id: 'user-meeshy', username: 'meeshy', email: 'meeshy@meeshy.me', role: 'BIGBOSS', displayName: 'Meeshy Sama', systemLanguage: 'en' });
const ADMIN = account({ id: 'user-admin', username: 'admin', email: 'admin@meeshy.me', role: 'ADMIN' });
const JCNM = account({ id: 'user-jcnm', username: 'jcnm', email: 'porteur@example.org', displayName: 'J-C' });

/** Les identités de configuration — l'unique façon de désigner un administrateur réservé. */
const IDENTITIES: WorldReservedIdentities = {
  creatorEmail: 'meeshy@meeshy.me',
  seedAdminEmail: 'admin@meeshy.me',
  worldAdminEmails: ['porteur@example.org'],
};

function makeDb(options: { users?: readonly Row[]; links?: readonly Row[]; conversations?: readonly Row[]; messages?: readonly Row[] } = {}) {
  const prisma = {
    conversation: table('conversation', [['identifier']], options.conversations),
    user: table('user', [['username'], ['email']], options.users ?? [MEESHY, ADMIN, JCNM]),
    participant: table('participant', [['conversationId', 'userId']]),
    conversationShareLink: table('link', [['identifier'], ['linkId']], options.links),
    message: table('message', [], options.messages),
  };
  return prisma;
}

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function seed(prisma: ReturnType<typeof makeDb>, logger = makeLogger(), identities: WorldReservedIdentities = IDENTITIES) {
  return ensureWorldConversation({ prisma: prisma as never, logger, identities });
}

function writes(prisma: ReturnType<typeof makeDb>): number {
  return Object.values(prisma)
    .flatMap((model) => [model.create, model.update, model.updateMany, model.deleteMany, model.delete])
    .reduce((total, mock) => total + mock.mock.calls.length, 0);
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

  it('ne crée jamais jcnm : absent, il est journalisé SANS son adresse et le seed continue', async () => {
    const prisma = makeDb({ users: [MEESHY, ADMIN] });
    const logger = makeLogger();

    const report = await seed(prisma, logger);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.rows.map((row) => row.username)).toEqual(['meeshy', 'admin']);
    expect(report.members).toContainEqual({ designation: 'world-admin-1', outcome: 'absent' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('world-admin-1'));
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('porteur@example.org');
    expect(roleOf(prisma, ADMIN.id)).toBe('admin');
  });

  it('ne rétrograde jamais un rang réservé tenu PLUS haut : jcnm devenu créateur le reste', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const jcnmRow = prisma.participant.rows.find((row) => row.userId === JCNM.id)!;
    jcnmRow.role = 'creator';

    const report = await seed(prisma);

    expect(roleOf(prisma, JCNM.id)).toBe('creator');
    expect(report.members).toContainEqual({ designation: 'world-admin-1', outcome: 'already-member' });
  });

  it('respecte un départ : une participation inactive n’est ni réveillée ni réécrite', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const adminRow = prisma.participant.rows.find((row) => row.userId === ADMIN.id)!;
    adminRow.isActive = false;
    adminRow.role = 'member';

    const report = await seed(prisma);

    expect(adminRow).toMatchObject({ isActive: false, role: 'member' });
    expect(report.members).toContainEqual({ designation: 'admin', outcome: 'left' });
  });

  it('laisse « Meeshy Global » intacte', async () => {
    const global = { id: 'conv-meeshy', identifier: 'meeshy', title: 'Meeshy Global', type: 'global', isActive: true };
    const prisma = makeDb({ conversations: [global] });

    await seed(prisma);

    expect(prisma.conversation.rows.find((row) => row.identifier === 'meeshy')).toEqual(global);
    expect(prisma.participant.rows.some((row) => row.conversationId === global.id)).toBe(false);
  });
});

describe('ensureWorldConversation — un rang réservé ne se prend pas par un pseudo (audit #10000)', () => {
  it('un compte « jcnm » inscrit par un tiers n’est pas promu : seule l’adresse configurée désigne', async () => {
    const squatter = account({ id: 'user-squat', username: 'jcnm', email: 'squatteur@example.net' });
    const prisma = makeDb({ users: [MEESHY, ADMIN, squatter] });

    const report = await seed(prisma);

    expect(roleOf(prisma, squatter.id)).toBeUndefined();
    expect(report.members).toContainEqual({ designation: 'world-admin-1', outcome: 'absent' });
  });

  it('le porteur désigné par son adresse est administrateur, quel que soit son pseudo du jour', async () => {
    const renamed = { ...JCNM, username: 'jean-charles' };
    const prisma = makeDb({ users: [MEESHY, ADMIN, renamed] });

    await seed(prisma);

    expect(roleOf(prisma, JCNM.id)).toBe('admin');
  });

  it('sans adresse d’administrateur configurée, personne d’autre que meeshy et admin n’est promu', async () => {
    const prisma = makeDb();

    const report = await seed(prisma, makeLogger(), { ...IDENTITIES, worldAdminEmails: [] });

    expect(roleOf(prisma, JCNM.id)).toBeUndefined();
    expect(report.members.map((member) => member.designation)).toEqual(['meeshy', 'admin']);
  });

  it.each([
    ['inactif', { isActive: false }],
    ['supprimé', { deletedAt: new Date('2026-09-01T00:00:00Z') }],
    ['à l’adresse non vérifiée', { emailVerifiedAt: null }],
  ])('écarte un compte désigné %s', async (_label, flaw) => {
    const prisma = makeDb({ users: [MEESHY, ADMIN, { ...JCNM, ...flaw }] });
    const logger = makeLogger();

    const report = await seed(prisma, logger);

    expect(roleOf(prisma, JCNM.id)).toBeUndefined();
    expect(report.members).toContainEqual({ designation: 'world-admin-1', outcome: 'ineligible' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('world-admin-1'));
  });

  it('un « admin » qui porte l’adresse semée sans le rôle plateforme ADMIN n’est pas promu', async () => {
    const squatter = account({ id: 'user-admin-squat', username: 'admin', email: 'admin@meeshy.me', role: 'USER' });
    const prisma = makeDb({ users: [MEESHY, squatter, JCNM] });

    const report = await seed(prisma);

    expect(roleOf(prisma, squatter.id)).toBeUndefined();
    expect(report.members).toContainEqual({ designation: 'admin', outcome: 'ineligible' });
  });

  it('sans un meeshy BIGBOSS légitime, aucun lien n’est créé : la porte publique n’a pas de créateur usurpé', async () => {
    const squatter = account({ id: 'user-meeshy-squat', username: 'meeshy', email: 'meeshy@meeshy.me', role: 'USER' });
    const prisma = makeDb({ users: [squatter, ADMIN, JCNM] });

    const report = await seed(prisma);

    expect(report.shareLink).toBe('skipped-no-creator');
    expect(prisma.conversationShareLink.rows).toHaveLength(0);
    expect(roleOf(prisma, squatter.id)).toBeUndefined();
  });

  it('ne re-promeut JAMAIS un membre réservé rétrogradé depuis : le rang se pose à la création seulement', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const jcnmRow = prisma.participant.rows.find((row) => row.userId === JCNM.id)!;
    jcnmRow.role = 'member';

    const report = await seed(prisma);

    expect(roleOf(prisma, JCNM.id)).toBe('member');
    expect(report.members).toContainEqual({ designation: 'world-admin-1', outcome: 'already-member' });
    expect(prisma.participant.update).not.toHaveBeenCalled();
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

  it('sème la porte des FICHIERS d’invité FERMÉE : seule la garde de signature de #10001 l’ouvrira, par migration (audit #10000)', async () => {
    const prisma = makeDb();

    await seed(prisma);

    expect(prisma.conversationShareLink.rows[0]).toMatchObject({ allowAnonymousFiles: false, allowAnonymousImages: false });
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

describe('inspectWorldSeed — le pré-vol en lecture seule avant la production (audit #10000)', () => {
  it('rend « prêt » sur une base sans World Wide dont les trois désignés sont légitimes, sans rien écrire', async () => {
    const prisma = makeDb();

    const preflight = await inspectWorldSeed(prisma as never, IDENTITIES);

    expect(preflight).toMatchObject({ ready: true, conversation: 'absent', shareLink: 'absent', blockers: [] });
    expect(preflight.members).toEqual([
      { designation: 'meeshy', status: 'eligible', username: 'meeshy' },
      { designation: 'admin', status: 'eligible', username: 'admin' },
      { designation: 'world-admin-1', status: 'eligible', username: 'jcnm' },
    ]);
    expect(writes(prisma)).toBe(0);
  });

  it('bloque quand « world » ou « mshy_world » existent déjà', async () => {
    const prisma = makeDb({
      conversations: [{ id: 'conv-x', identifier: WORLD_CONVERSATION_IDENTIFIER }],
      links: [{ id: 'link-x', identifier: WORLD_SHARE_LINK_IDENTIFIER, linkId: 'mshy_x', conversationId: 'conv-y' }],
    });

    const preflight = await inspectWorldSeed(prisma as never, IDENTITIES);

    expect(preflight.ready).toBe(false);
    expect(preflight.blockers).toEqual(expect.arrayContaining(['conversation-exists', 'share-link-exists']));
  });

  it('bloque quand un désigné est absent, illégitime, ou quand aucun administrateur n’est configuré', async () => {
    const unverified = makeDb({ users: [MEESHY, { ...ADMIN, role: 'USER' }, { ...JCNM, emailVerifiedAt: null }] });
    const unconfigured = makeDb();

    const flawed = await inspectWorldSeed(unverified as never, IDENTITIES);
    const empty = await inspectWorldSeed(unconfigured as never, { ...IDENTITIES, worldAdminEmails: [] });

    expect(flawed.ready).toBe(false);
    expect(flawed.blockers).toEqual(['admin:platform-role', 'world-admin-1:email-unverified']);
    expect(empty.blockers).toEqual(['world-admin-not-configured']);
  });
});

describe('removeWorldSeed — le retrait documenté du seed (audit #10000)', () => {
  async function seeded() {
    const prisma = makeDb();
    await seed(prisma);
    return prisma;
  }

  it('à blanc par défaut : constate, n’écrit rien', async () => {
    const prisma = await seeded();
    const before = writes(prisma);

    const report = await removeWorldSeed(prisma as never, { mode: 'close', apply: false });

    expect(report).toMatchObject({ conversation: 'present', participants: 3, shareLinks: 1, messages: 0, outcome: 'dry-run' });
    expect(writes(prisma)).toBe(before);
  });

  it('« close » ferme la porte et la conversation, réversible, sans rien supprimer', async () => {
    const prisma = await seeded();

    const report = await removeWorldSeed(prisma as never, { mode: 'close', apply: true });

    expect(report.outcome).toBe('closed');
    expect(worldConversation(prisma)[0].isActive).toBe(false);
    expect(prisma.conversationShareLink.rows[0].isActive).toBe(false);
    expect(prisma.participant.rows).toHaveLength(3);
    expect(await loadWorldEntry(prisma as never)).toBeNull();
  });

  it('« purge » supprime le lien, les participations et la conversation d’un World Wide sans message', async () => {
    const prisma = await seeded();

    const report = await removeWorldSeed(prisma as never, { mode: 'purge', apply: true });

    expect(report.outcome).toBe('purged');
    expect(worldConversation(prisma)).toHaveLength(0);
    expect(prisma.conversationShareLink.rows).toHaveLength(0);
    expect(prisma.participant.rows).toHaveLength(0);
  });

  it('« purge » REFUSE dès qu’un message existe : une purge de données ne passe pas par ce script', async () => {
    const prisma = await seeded();
    const [conversation] = worldConversation(prisma);
    prisma.message.rows.push({ id: 'msg-1', conversationId: conversation.id });

    const report = await removeWorldSeed(prisma as never, { mode: 'purge', apply: true });

    expect(report).toMatchObject({ outcome: 'refused-has-messages', messages: 1 });
    expect(worldConversation(prisma)).toHaveLength(1);
    expect(prisma.participant.rows).toHaveLength(3);
  });

  it('ne touche ni « Meeshy Global » ni aucun autre lien', async () => {
    const global = { id: 'conv-meeshy', identifier: 'meeshy', isActive: true };
    const otherLink = { id: 'link-other', identifier: 'mshy_other', linkId: 'mshy_o', conversationId: 'conv-meeshy', isActive: true };
    const prisma = makeDb({ conversations: [global], links: [otherLink] });
    await seed(prisma);

    await removeWorldSeed(prisma as never, { mode: 'purge', apply: true });

    expect(prisma.conversation.rows).toEqual([global]);
    expect(prisma.conversationShareLink.rows).toEqual([otherLink]);
  });

  it('rend « nothing-to-do » quand World Wide n’existe pas', async () => {
    const report = await removeWorldSeed(makeDb() as never, { mode: 'purge', apply: true });

    expect(report.outcome).toBe('nothing-to-do');
  });
});
