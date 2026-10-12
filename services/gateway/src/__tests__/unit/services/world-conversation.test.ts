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
import { classifyAnonymousAttachment, type AnonymousAttachmentVerdict } from '../../../services/attachments/ContentSignature';
import { PLAIN_TEXT, JPEG_PHOTO, PDF_DOCUMENT, m4aVoice, webmVoice } from '../../../services/attachments/__tests__/guest-attachment-fixtures';

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

/** Les contenus qu'un invité de World Wide tenterait de faire passer pour de l'audio (audit #10000, #10029). */
const MPEG_SYNC_THEN_HTML = Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.from('<html><script>alert(1)</script></html>', 'latin1')]);
const ADTS_SYNC_THEN_ZIP = Buffer.concat([Buffer.from([0xff, 0xf1]), Buffer.from('PK\x03\x04\x14\x00\x00\x00', 'latin1')]);
const MP4_VIDEO = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from('isomiso2avc1mp41', 'latin1'),
  Buffer.from([0x00, 0x00, 0x00, 0x08]),
  Buffer.from('moov', 'latin1'),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** Ce que les chemins d'upload lisent du lien d'un invité : ses drapeaux et la conversation qu'il ouvre. */
function guestDoorOf(prisma: ReturnType<typeof makeDb>) {
  const [link] = prisma.conversationShareLink.rows;
  const conversation = prisma.conversation.rows.find((row) => row.id === link.conversationId);
  return {
    allowAnonymousFiles: link.allowAnonymousFiles as boolean,
    allowAnonymousImages: link.allowAnonymousImages as boolean,
    allowedAttachmentKinds: link.allowedAttachmentKinds as string[] | undefined,
    conversation: { identifier: conversation?.identifier as string },
  };
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

  it('descend le Prisme jusqu’à la locale appareil : un compte sans langue applicative entre dans la sienne', async () => {
    const localeOnly = { ...JCNM, systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null, deviceLocale: 'es' };
    const prisma = makeDb({ users: [MEESHY, ADMIN, localeOnly] });

    await seed(prisma);

    expect(prisma.participant.rows.find((row) => row.userId === JCNM.id)?.language).toBe('es');
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

  it('un invité du lien semé ne joint RIEN : ni deux octets de synchro MPEG suivis de HTML, ni un MP4 vidéo déclaré audio (audit #10000, #10029)', async () => {
    const prisma = makeDb();

    await seed(prisma);

    const door = guestDoorOf(prisma);
    expect(classifyAnonymousAttachment('audio/mpeg', MPEG_SYNC_THEN_HTML, door)).toMatchObject({ allowed: false });
    expect(classifyAnonymousAttachment('audio/aac', ADTS_SYNC_THEN_ZIP, door)).toMatchObject({ allowed: false });
    expect(classifyAnonymousAttachment('audio/mp4', MP4_VIDEO, door)).toMatchObject({ allowed: false });
    expect(classifyAnonymousAttachment('application/octet-stream', JPEG, door)).toMatchObject({ allowed: false });
  });

  it('la même charge reste refusée à un invité entré quand le lien portait la porte des fichiers OUVERTE : la garde ne lit pas le drapeau (#10029)', async () => {
    const prisma = makeDb();

    await seed(prisma);

    const door = { ...guestDoorOf(prisma), allowAnonymousFiles: true, allowAnonymousImages: true };
    expect(classifyAnonymousAttachment('audio/mpeg', MPEG_SYNC_THEN_HTML, door)).toMatchObject({ allowed: false });
    expect(classifyAnonymousAttachment('audio/mp4', MP4_VIDEO, door)).toMatchObject({ allowed: false });
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

describe('ensureWorldConversation — le lien semé dit ce qu’un invité peut joindre (#10001)', () => {
  it('le lien créé liste texte et audio, et rien d’autre', async () => {
    const prisma = makeDb();

    await seed(prisma);

    expect(prisma.conversationShareLink.rows[0].allowedAttachmentKinds).toEqual(['text', 'audio']);
  });

  it('un invité du lien semé joint un .txt et un vocal ; un PDF et une photo sont refusés', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const door = guestDoorOf(prisma);

    expect(classifyAnonymousAttachment('text/plain', PLAIN_TEXT, door, { fileName: 'notes.txt' })).toEqual({ allowed: true });
    expect(classifyAnonymousAttachment('audio/webm', webmVoice(), door, { fileName: 'voice.webm' })).toEqual({ allowed: true });
    expect(classifyAnonymousAttachment('audio/mp4', m4aVoice(), door, { fileName: 'voice.m4a' })).toEqual({ allowed: true });
    expect(classifyAnonymousAttachment('application/pdf', PDF_DOCUMENT, door, { fileName: 'doc.pdf' })).toMatchObject({ allowed: false });
    expect(classifyAnonymousAttachment('image/jpeg', JPEG_PHOTO, door, { fileName: 'photo.jpg' })).toMatchObject({ allowed: false });
  });

  it('un lien semé AVANT la colonne la reçoit au démarrage suivant, sans que rien d’autre ne change', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const legacy = prisma.conversationShareLink.rows[0];
    delete legacy.allowedAttachmentKinds;
    legacy.isActive = false;

    const report = await seed(prisma);

    expect(report.shareLink).toBe('existing');
    expect(prisma.conversationShareLink.rows[0]).toMatchObject({ allowedAttachmentKinds: ['text', 'audio'], isActive: false });
  });

  it('un lien dont un administrateur a choisi les familles n’est pas réécrit', async () => {
    const prisma = makeDb();
    await seed(prisma);
    prisma.conversationShareLink.rows[0].allowedAttachmentKinds = ['audio'];

    await seed(prisma);

    expect(prisma.conversationShareLink.rows[0].allowedAttachmentKinds).toEqual(['audio']);
  });

  it('une fois posées, un démarrage suivant n’écrit plus rien sur le lien', async () => {
    const prisma = makeDb();
    await seed(prisma);
    const before = prisma.conversationShareLink.update.mock.calls.length + prisma.conversationShareLink.updateMany.mock.calls.length;

    await seed(prisma);

    expect(prisma.conversationShareLink.update.mock.calls.length + prisma.conversationShareLink.updateMany.mock.calls.length).toBe(before);
  });
});

describe('ensureWorldConversation — un entrant lit l’historique du salon (#10099, décision porteur 2026-10-11)', () => {
  const GUEST_PERMISSIONS = {
    canSendMessages: true,
    canSendFiles: false,
    canSendImages: false,
    canSendVideos: false,
    canSendAudios: true,
    canSendLocations: false,
    canSendLinks: false,
  };

  function enterWorld(prisma: ReturnType<typeof makeDb>, id: string, permissions: Record<string, boolean>) {
    const [conversation] = worldConversation(prisma);
    prisma.participant.rows.push({ id, conversationId: conversation.id, type: 'anonymous', role: 'member', isActive: true, permissions });
  }

  it('le lien créé ouvre l’historique aux entrants', async () => {
    const prisma = makeDb();

    await seed(prisma);

    expect(prisma.conversationShareLink.rows[0].allowViewHistory).toBe(true);
  });

  it('un historique qu’un administrateur a coupé sur le lien n’est pas rouvert par un démarrage suivant', async () => {
    const prisma = makeDb();
    await seed(prisma);
    prisma.conversationShareLink.rows[0].allowViewHistory = false;

    const report = await seed(prisma);

    expect(report.shareLink).toBe('existing');
    expect(prisma.conversationShareLink.rows[0].allowViewHistory).toBe(false);
  });

  it('un entrant à qui l’historique a été coupé ne le retrouve pas au démarrage suivant', async () => {
    const prisma = makeDb();
    await seed(prisma);
    enterWorld(prisma, 'guest-closed', { ...GUEST_PERMISSIONS, canViewHistory: false });

    await seed(prisma);

    expect(prisma.participant.rows.find((row) => row.id === 'guest-closed')?.permissions).toEqual({ ...GUEST_PERMISSIONS, canViewHistory: false });
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
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
  it('sert l’identifiant du lien, l’effectif, l’avatar et la bannière (#10204), sans aucun id', async () => {
    const prisma = makeDb();
    await ensureWorldConversation({ prisma: prisma as never, logger: makeLogger(), identities: IDENTITIES, appOrigin: 'https://meeshy.me' });

    const entry = await loadWorldEntry(prisma as never);

    expect(entry).toEqual({
      identifier: WORLD_CONVERSATION_IDENTIFIER,
      title: WORLD_CONVERSATION_TITLE,
      shareLinkIdentifier: WORLD_SHARE_LINK_IDENTIFIER,
      memberCount: 3,
      avatar: 'https://meeshy.me/brand/world-wide/avatar.png',
      banner: 'https://meeshy.me/brand/world-wide/banner.png',
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
  const RESIDUAL_RISKS = ['id3v2-arbitrary-payload', 'mpeg-frame-pdf-header', 'mp4-free-box-payload', 'mp4-without-samples'];
  it('rend « prêt » sur une base sans World Wide dont les trois désignés sont légitimes, sans rien écrire', async () => {
    const prisma = makeDb();

    const preflight = await inspectWorldSeed(prisma as never, IDENTITIES, { acceptedResidualRisks: RESIDUAL_RISKS });

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

    const flawed = await inspectWorldSeed(unverified as never, IDENTITIES, { acceptedResidualRisks: RESIDUAL_RISKS });
    const empty = await inspectWorldSeed(unconfigured as never, { ...IDENTITIES, worldAdminEmails: [] }, { acceptedResidualRisks: RESIDUAL_RISKS });

    expect(flawed.ready).toBe(false);
    expect(flawed.blockers).toEqual(['admin:platform-role', 'world-admin-1:email-unverified']);
    expect(empty.blockers).toEqual(['world-admin-not-configured']);
  });

  it('bloque tant que la garde des pièces jointes d’invité laisse passer un contenu déguisé en audio (audit #10000, #10029)', async () => {
    const prisma = makeDb();
    const audioOpenGuard = (mimeType: string): AnonymousAttachmentVerdict =>
      mimeType.startsWith('audio/') ? { allowed: true } : { allowed: false, reason: 'closed' };

    const preflight = await inspectWorldSeed(prisma as never, IDENTITIES, { guestAttachmentGuard: audioOpenGuard, acceptedResidualRisks: RESIDUAL_RISKS });

    expect(preflight.ready).toBe(false);
    expect(preflight.blockers).toEqual(['guest-attachments-open:mpeg-sync-html,adts-sync-zip,mp4-video-as-audio,mp3-frames-then-zip']);
    expect(writes(prisma)).toBe(0);
  });

  it('bloque tant que le porteur n’a pas accepté, un par un, les risques résiduels que la garde laisse passer (audit #10001, #10057)', async () => {
    const prisma = makeDb();

    const unaccepted = await inspectWorldSeed(prisma as never, IDENTITIES);
    const partly = await inspectWorldSeed(prisma as never, IDENTITIES, { acceptedResidualRisks: ['mp4-without-samples'] });
    const accepted = await inspectWorldSeed(prisma as never, IDENTITIES, { acceptedResidualRisks: RESIDUAL_RISKS });

    expect(unaccepted.ready).toBe(false);
    expect(unaccepted.residualRisks).toEqual(RESIDUAL_RISKS);
    expect(unaccepted.blockers).toEqual([`guest-attachments-residual-unaccepted:${RESIDUAL_RISKS.join(',')}`]);
    expect(partly.blockers).toEqual(['guest-attachments-residual-unaccepted:id3v2-arbitrary-payload,mpeg-frame-pdf-header,mp4-free-box-payload']);
    expect(accepted).toMatchObject({ ready: true, residualRisks: RESIDUAL_RISKS, blockers: [] });
    expect(writes(prisma)).toBe(0);
  });

  it('ne demande plus rien au porteur quand la garde resserrée refuse les risques résiduels', async () => {
    const prisma = makeDb();
    const closedGuard = (): AnonymousAttachmentVerdict => ({ allowed: false, reason: 'closed' });

    const preflight = await inspectWorldSeed(prisma as never, IDENTITIES, { guestAttachmentGuard: closedGuard });

    expect(preflight).toMatchObject({ ready: true, residualRisks: [], blockers: [] });
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

/**
 * #10204 — World Wide a un avatar et une bannière, servis par l'application web
 * à `/brand/world-wide/{avatar,banner}.png`. La conversation porte leurs adresses
 * ABSOLUES, composées depuis l'origine publique du frontend (`FRONTEND_URL`).
 * Le seed pose ce qui MANQUE et ne remplace jamais une image posée à la main.
 */
describe('World Wide porte son avatar et sa bannière (#10204)', () => {
  const ORIGIN = 'https://staging.meeshy.me';
  const AVATAR = `${ORIGIN}/brand/world-wide/avatar.png`;
  const BANNER = `${ORIGIN}/brand/world-wide/banner.png`;

  const seedAt = (prisma: ReturnType<typeof makeDb>, appOrigin = ORIGIN) =>
    ensureWorldConversation({ prisma: prisma as never, logger: makeLogger(), identities: IDENTITIES, appOrigin });

  it('une conversation semée naît avec les deux adresses absolues', async () => {
    const prisma = makeDb();

    await seedAt(prisma);

    expect(worldConversation(prisma)[0]).toMatchObject({ avatar: AVATAR, banner: BANNER });
  });

  it('une conversation existante sans image reçoit les deux', async () => {
    const prisma = makeDb({
      conversations: [{ id: 'conv-world', identifier: WORLD_CONVERSATION_IDENTIFIER, type: 'global', title: 'World Wide', isActive: true }],
    });

    await seedAt(prisma);

    expect(worldConversation(prisma)[0]).toMatchObject({ avatar: AVATAR, banner: BANNER });
  });

  it('une image posée à la main n’est jamais remplacée — seule la manquante est posée', async () => {
    const prisma = makeDb({
      conversations: [{
        id: 'conv-world', identifier: WORLD_CONVERSATION_IDENTIFIER, type: 'global', title: 'World Wide', isActive: true,
        avatar: 'https://static.meeshy.me/choisi-a-la-main.png', banner: null,
      }],
    });

    await seedAt(prisma);

    expect(worldConversation(prisma)[0]).toMatchObject({
      avatar: 'https://static.meeshy.me/choisi-a-la-main.png',
      banner: BANNER,
    });
  });

  it('un second démarrage n’écrit plus rien sur la conversation', async () => {
    const prisma = makeDb();
    await seedAt(prisma);
    prisma.conversation.update.mockClear();
    prisma.conversation.create.mockClear();

    await seedAt(prisma);

    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('sans origine configurée (ni appOrigin, ni FRONTEND_URL), ne pose AUCUNE image — jamais une adresse localhost gravée', async () => {
    const saved = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    try {
      const prisma = makeDb();

      await ensureWorldConversation({ prisma: prisma as never, logger: makeLogger(), identities: IDENTITIES });

      expect(worldConversation(prisma)[0].avatar).toBeUndefined();
      expect(worldConversation(prisma)[0].banner).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.FRONTEND_URL = saved;
    }
  });

  it('l’origine se lit sans chemin ni barre finale', async () => {
    const prisma = makeDb();

    await seedAt(prisma, 'https://meeshy.me/');

    expect(worldConversation(prisma)[0]).toMatchObject({
      avatar: 'https://meeshy.me/brand/world-wide/avatar.png',
      banner: 'https://meeshy.me/brand/world-wide/banner.png',
    });
  });
});
