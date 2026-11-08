/**
 * #14643 — la purge des conversations obsolètes, 48 h après leur obsolescence.
 * Désarmée sans `OBSOLETE_CONVERSATION_PURGE_ENABLED=true`, idempotente, et
 * qui ne peut viser QUE ce qu'une obsolescence a marqué.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  OBSOLETE_PURGE_RETRY_DELAY_MS,
  obsoletePurgeArmed,
  obsoletePurgeWhere,
  purgeObsoleteConversations,
} from '../../../jobs/obsolete-conversation-purge';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const CONV = '507f1f77bcf86cd799439011';
const H48 = 48 * 60 * 60 * 1000;

const MESSAGE_SCOPED = [
  'attachmentReaction', 'attachmentStatusEntry', 'reaction', 'mention', 'messageStatusEntry',
  'userMessageDeletion', 'messageStar', 'sharedTranslation', 'messageEnvelope', 'notification',
] as const;
const CONVERSATION_SCOPED = [
  'messageStatusEntry', 'attachmentStatusEntry', 'conversationReadCursor', 'messageEnvelope', 'sharedTranslation',
  'messageStar', 'callSession', 'conversationPreference', 'userConversationPreferences', 'conversationPublicKey',
  'conversationShare', 'agentConfig', 'agentUserRole', 'agentConversationSummary', 'agentAnalysisSnapshot',
  'conversationMessageStats', 'agentAnalytic', 'agentScanLog', 'agentTopicUsageLog', 'conversationShareLink', 'participant',
] as const;

type Candidate = { id: string; type: string; identifier: string; isActive: boolean; deletedAt: Date; purgeAfter: Date };

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: CONV,
    type: 'group',
    identifier: 'mshy_equipe',
    isActive: false,
    deletedAt: new Date(NOW.getTime() - H48 - 1000),
    purgeAfter: new Date(NOW.getTime() - 1000),
    ...overrides,
  };
}

type OpenReport = { reportedType: string; reportedEntityId: string; status?: string };

function prismaDouble(candidates: Candidate[], messagePages: string[][] = [['m1', 'm2']], reports: OpenReport[] = [], reportedMessagesInConversation = 0) {
  const log: string[] = [];
  const pages = [...messagePages];
  const deleteManyOf = (model: string) => jest.fn<any>(async (args: any) => {
    log.push(`${model}.deleteMany`);
    return { count: 1, args };
  });
  const prisma: any = {
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue(candidates),
      count: jest.fn<any>().mockResolvedValue(candidates.length),
      update: jest.fn<any>(async () => { log.push('conversation.update'); return {}; }),
    },
    message: {
      findMany: jest.fn<any>(async () => (pages.shift() ?? []).map((id) => ({ id }))),
      updateMany: jest.fn<any>(async () => { log.push('message.updateMany'); return { count: 0 }; }),
      deleteMany: deleteManyOf('message'),
      count: jest.fn<any>().mockResolvedValue(reportedMessagesInConversation),
    },
    report: { findMany: jest.fn<any>().mockResolvedValue(reports) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'a1' }]) },
    attachmentFileAtRest: { deleteMany: deleteManyOf('attachmentFileAtRest') },
    trackingLink: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: 't1' }]),
      deleteMany: deleteManyOf('trackingLink'),
    },
    trackingLinkClick: { deleteMany: deleteManyOf('trackingLinkClick') },
    callRecording: { deleteMany: deleteManyOf('callRecording') },
    serverEncryptionKey: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: deleteManyOf('serverEncryptionKey'),
    },
  };
  prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ serverEncryptionKeyId: null });
  prisma.callSession = { findMany: jest.fn<any>().mockResolvedValue([{ id: 'call-1' }]) };
  for (const model of new Set([...MESSAGE_SCOPED, ...CONVERSATION_SCOPED])) {
    prisma[model] = { ...(prisma[model] ?? {}), deleteMany: deleteManyOf(model) };
  }
  return { prisma, log };
}

function remover(fail = false) {
  return {
    deleteAttachment: jest.fn<any>(async () => {
      if (fail) throw new Error('disk');
    }),
  };
}

describe('#14643 — interrupteur de la purge', () => {
  it('ne s\'arme que sur la valeur exacte « true »', () => {
    expect(obsoletePurgeArmed({})).toBe(false);
    expect(obsoletePurgeArmed({ OBSOLETE_CONVERSATION_PURGE_ENABLED: '1' })).toBe(false);
    expect(obsoletePurgeArmed({ OBSOLETE_CONVERSATION_PURGE_ENABLED: 'TRUE' })).toBe(false);
    expect(obsoletePurgeArmed({ RETENTION_PURGE_ENABLED: 'true' })).toBe(false);
    expect(obsoletePurgeArmed({ OBSOLETE_CONVERSATION_PURGE_ENABLED: 'true' })).toBe(true);
  });
});

describe('#14643 — ce que la purge peut viser', () => {
  it('exige les trois marques de l\'obsolescence : purgeAfter échu, deletedAt vieux de 48 h, conversation fermée', () => {
    expect(obsoletePurgeWhere(NOW)).toEqual({
      purgeAfter: { lte: NOW },
      deletedAt: { lte: new Date(NOW.getTime() - H48) },
      isActive: false,
    });
  });

  it('désarmée, elle COMPTE et n\'écrit rien', async () => {
    const { prisma, log } = prismaDouble([candidate()]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: false, attachmentRemover: remover() });
    expect(report).toEqual({ applied: false, candidates: 1, purged: 0, failed: 0, truncated: false });
    expect(log).toEqual([]);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('ne touche jamais la conversation globale, même marquée', async () => {
    const { prisma, log } = prismaDouble([candidate({ type: 'global', identifier: 'meeshy' })]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(report.purged).toBe(0);
    expect(log).toEqual([]);
  });

  it('écarte une ligne rendue par la requête mais dont les marques ne tiennent pas (double garde)', async () => {
    const { prisma, log } = prismaDouble([candidate({ purgeAfter: new Date(NOW.getTime() + 1000) }), candidate({ deletedAt: new Date(NOW.getTime() - 1000) })]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(report.purged).toBe(0);
    expect(log).toEqual([]);
  });
});

describe('#14643 — une conversation rouverte n\'est plus une cible', () => {
  it('écarte une ligne marquée mais ACTIVE, même si la requête l\'a rendue', async () => {
    const { prisma, log } = prismaDouble([candidate({ isActive: true })]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(report.purged).toBe(0);
    expect(log).toEqual([]);
  });

  it('relit isActive avec les autres marques', async () => {
    const { prisma } = prismaDouble([candidate()]);
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    const args = prisma.conversation.findMany.mock.calls[0][0];
    expect(args.select).toMatchObject({ isActive: true, deletedAt: true, purgeAfter: true });
  });
});

describe('#14643 — la cascade', () => {
  it('efface fichiers, pièces, réactions, enveloppes, messages, liens, participants, puis désarme la ligne', async () => {
    const { prisma, log } = prismaDouble([candidate()]);
    const attachmentRemover = remover();
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover });

    expect(report).toEqual({ applied: true, candidates: 1, purged: 1, failed: 0, truncated: false });
    expect(attachmentRemover.deleteAttachment).toHaveBeenCalledWith('a1');
    expect(prisma.attachmentFileAtRest.deleteMany).toHaveBeenCalledWith({ where: { attachmentId: { in: ['a1'] } } });
    for (const model of MESSAGE_SCOPED) {
      expect(prisma[model].deleteMany).toHaveBeenCalledWith({ where: { messageId: { in: ['m1', 'm2'] } } });
    }
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { conversationId: CONV, id: { in: ['m1', 'm2'] } } });
    for (const model of CONVERSATION_SCOPED) {
      expect(prisma[model].deleteMany).toHaveBeenCalledWith({ where: { conversationId: CONV } });
    }
    expect(prisma.trackingLinkClick.deleteMany).toHaveBeenCalledWith({ where: { trackingLinkId: { in: ['t1'] } } });
    expect(prisma.trackingLink.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1'] } } });

    expect(log.indexOf('message.deleteMany')).toBeGreaterThan(log.indexOf('reaction.deleteMany'));
    expect(log.indexOf('participant.deleteMany')).toBeGreaterThan(log.indexOf('message.deleteMany'));
    expect(log.indexOf('participant.deleteMany')).toBeGreaterThan(log.indexOf('callSession.deleteMany'));
    expect(log[log.length - 1]).toBe('conversation.update');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: CONV },
      data: { purgeAfter: null, title: null, description: null, avatar: null, banner: null, serverEncryptionKeyId: null },
    });
  });

  it('une pièce dont le fichier résiste arrête la conversation : rien n\'est désarmé, la passe suivante reprend', async () => {
    const { prisma, log } = prismaDouble([candidate()]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover(true) });
    expect(report).toEqual({ applied: true, candidates: 1, purged: 0, failed: 1, truncated: false });
    expect(log).not.toContain('message.deleteMany');
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purgeAfter: null }) }),
    );
  });

  it('une pièce déjà partie n\'est pas un échec (idempotence)', async () => {
    const { prisma } = prismaDouble([candidate()]);
    const attachmentRemover = { deleteAttachment: jest.fn<any>().mockRejectedValue(new Error('Attachment not found')) };
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover });
    expect(report.purged).toBe(1);
  });

  it('les messages se balaient par pages jusqu\'à épuisement', async () => {
    const { prisma } = prismaDouble([candidate()], [['m1'], ['m2'], []]);
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(prisma.message.deleteMany).toHaveBeenCalledTimes(2);
    for (const call of prisma.message.findMany.mock.calls as any[]) {
      expect(call[0].where).toEqual({ conversationId: CONV });
    }
  });
});

describe('#14643 — un échec ne bloque pas la file', () => {
  it('un candidat qui échoue voit sa purge reculer, sans toucher aux autres marques', async () => {
    const { prisma, log } = prismaDouble([candidate()]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover(true) });
    expect(report.failed).toBe(1);
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: CONV },
      data: { purgeAfter: new Date(NOW.getTime() + OBSOLETE_PURGE_RETRY_DELAY_MS) },
    });
    expect(log).not.toContain('message.deleteMany');
  });

  it('vingt têtes de file qui échouent à chaque passe ne bloquent pas la suivante : elle est purgée à la passe d\'après', async () => {
    const failing = Array.from({ length: 20 }, (_, i) =>
      candidate({ id: `bad${String(i).padStart(21, '0')}`, purgeAfter: new Date(NOW.getTime() - 10_000 + i) }),
    );
    const healthy = candidate({ id: 'good00000000000000000000', purgeAfter: new Date(NOW.getTime() - 1000) });
    const store = [...failing, healthy].map((row) => ({ ...row }));
    const { prisma } = prismaDouble([], [[], [], [], []]);
    prisma.conversation.findMany = jest.fn<any>(async (args: any) =>
      store
        .filter((row) => row.purgeAfter !== null && row.purgeAfter.getTime() <= args.where.purgeAfter.lte.getTime())
        .sort((a, b) => a.purgeAfter.getTime() - b.purgeAfter.getTime())
        .slice(0, args.take)
        .map((row) => ({ ...row })),
    );
    prisma.conversation.update = jest.fn<any>(async (args: any) => {
      const row = store.find((r) => r.id === args.where.id);
      if (row && 'purgeAfter' in args.data) row.purgeAfter = args.data.purgeAfter;
      return {};
    });
    const failingIds = new Set(failing.map((row) => row.id));
    prisma.message.findMany = jest.fn<any>(async (args: any) => (failingIds.has(args.where.conversationId) ? [{ id: 'm' }] : []));
    const attachmentRemover = { deleteAttachment: jest.fn<any>().mockRejectedValue(new Error('disk')) };

    const first = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover });
    expect(first).toMatchObject({ purged: 0, failed: 20 });

    const second = await purgeObsoleteConversations(prisma, { now: new Date(NOW.getTime() + 60_000), apply: true, attachmentRemover });
    expect(second).toMatchObject({ purged: 1, failed: 0 });
    expect(store.find((row) => row.id === healthy.id)?.purgeAfter).toBeNull();
  });

  it('le recul revient en tête une fois son délai écoulé', async () => {
    expect(OBSOLETE_PURGE_RETRY_DELAY_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    const { prisma } = prismaDouble([candidate({ purgeAfter: new Date(NOW.getTime() + OBSOLETE_PURGE_RETRY_DELAY_MS) })]);
    const later = new Date(NOW.getTime() + OBSOLETE_PURGE_RETRY_DELAY_MS);
    const report = await purgeObsoleteConversations(prisma, { now: later, apply: true, attachmentRemover: remover() });
    expect(report.purged).toBe(1);
  });
});

describe('#14643 — les restes sans relation Prisma', () => {
  it('efface les enregistrements des appels de la conversation, avant leurs appels', async () => {
    const { prisma, log } = prismaDouble([candidate()]);
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(prisma.callSession.findMany).toHaveBeenCalledWith({ where: { conversationId: CONV }, select: { id: true } });
    expect(prisma.callRecording.deleteMany).toHaveBeenCalledWith({ where: { callSessionId: { in: ['call-1'] } } });
    expect(log.indexOf('callRecording.deleteMany')).toBeLessThan(log.indexOf('callSession.deleteMany'));
  });

  function keysDouble(otherUsers: Record<string, number>, otherFiles: Record<string, number> = {}) {
    const { prisma, log } = prismaDouble([candidate()]);
    prisma.attachmentFileAtRest.count = jest.fn<any>(async (args: any) => otherFiles[args.where.keyId] ?? 0);
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ serverEncryptionKeyId: 'key-linked' });
    prisma.serverEncryptionKey.findMany = jest.fn<any>().mockResolvedValue([{ id: 'key-own' }, { id: 'key-linked' }]);
    prisma.conversation.count = jest.fn<any>(async (args: any) => otherUsers[args.where.serverEncryptionKeyId] ?? 0);
    return { prisma, log };
  }

  it('efface les clés serveur de la conversation qu\'aucune autre conversation n\'utilise', async () => {
    const { prisma } = keysDouble({});
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(report.purged).toBe(1);
    expect(prisma.serverEncryptionKey.findMany).toHaveBeenCalledWith({ where: { conversationId: CONV }, select: { id: true } });
    expect(prisma.serverEncryptionKey.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['key-own', 'key-linked'] } } });
  });

  it('garde une clé qu\'une autre conversation utilise encore', async () => {
    const { prisma } = keysDouble({ 'key-linked': 1 });
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(prisma.conversation.count).toHaveBeenCalledWith({ where: { serverEncryptionKeyId: 'key-linked', id: { not: CONV } } });
    expect(prisma.serverEncryptionKey.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['key-own'] } } });
  });

  it('garde une clé qui scelle encore un fichier d\'une autre conversation', async () => {
    const { prisma } = keysDouble({}, { 'key-own': 1 });
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(prisma.attachmentFileAtRest.count).toHaveBeenCalledWith({ where: { keyId: 'key-own', conversationId: { not: CONV } } });
    expect(prisma.serverEncryptionKey.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['key-linked'] } } });
  });

  it('n\'efface aucune clé quand toutes servent ailleurs', async () => {
    const { prisma } = keysDouble({ 'key-own': 2, 'key-linked': 1 });
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(prisma.serverEncryptionKey.deleteMany).not.toHaveBeenCalled();
  });
});

describe('#14691 — une conversation obsolète n\'est pas un objet de signalement : elle est détruite à 48 h (décision porteur 2026-11-03)', () => {
  const REPORTED_MESSAGE = '507f1f77bcf86cd799439033';
  const REPORTED_USER = '507f1f77bcf86cd799439055';
  const OPEN_REPORTS: OpenReport[] = [
    { reportedType: 'conversation', reportedEntityId: CONV, status: 'pending' },
    { reportedType: 'message', reportedEntityId: REPORTED_MESSAGE, status: 'under_review' },
    { reportedType: 'user', reportedEntityId: REPORTED_USER, status: 'pending' },
  ];

  it('une conversation obsolète visée par un signalement ouvert est purgée à 48 h', async () => {
    const { prisma, log } = prismaDouble([candidate()], [['m1', 'm2']], OPEN_REPORTS, 1);
    const attachmentRemover = remover();
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover });
    expect(report).toEqual({ applied: true, candidates: 1, purged: 1, failed: 0, truncated: false });
    expect(attachmentRemover.deleteAttachment).toHaveBeenCalledWith('a1');
    expect(log).toContain('message.deleteMany');
    expect(log).toContain('participant.deleteMany');
  });

  it('la purge ne lit aucun signalement : leur lecture en échec n\'arrête rien', async () => {
    const { prisma } = prismaDouble([candidate()], [['m1', 'm2']], OPEN_REPORTS);
    prisma.report.findMany = jest.fn<any>().mockRejectedValue(new Error('mongo down'));
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(report).toMatchObject({ purged: 1, failed: 0 });
    expect(prisma.report.findMany).not.toHaveBeenCalled();
  });

  it('aucun signalement ne recule la purge : la ligne n\'est réécrite que pour la désarmer', async () => {
    const { prisma } = prismaDouble([candidate()], [['m1', 'm2']], OPEN_REPORTS, 1);
    await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover() });
    expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purgeAfter: null }) }));
  });
});
