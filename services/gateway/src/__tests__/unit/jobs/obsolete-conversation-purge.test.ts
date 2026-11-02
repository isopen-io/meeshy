/**
 * #14643 — la purge des conversations obsolètes, 48 h après leur obsolescence.
 * Désarmée sans `OBSOLETE_CONVERSATION_PURGE_ENABLED=true`, idempotente, et
 * qui ne peut viser QUE ce qu'une obsolescence a marqué.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
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

function prismaDouble(candidates: Candidate[], messagePages: string[][] = [['m1', 'm2']]) {
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
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'a1' }]) },
    attachmentFileAtRest: { deleteMany: deleteManyOf('attachmentFileAtRest') },
    trackingLink: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: 't1' }]),
      deleteMany: deleteManyOf('trackingLink'),
    },
    trackingLinkClick: { deleteMany: deleteManyOf('trackingLinkClick') },
  };
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
      data: { purgeAfter: null, title: null, description: null, avatar: null, banner: null },
    });
  });

  it('une pièce dont le fichier résiste arrête la conversation : rien n\'est désarmé, la passe suivante reprend', async () => {
    const { prisma, log } = prismaDouble([candidate()]);
    const report = await purgeObsoleteConversations(prisma, { now: NOW, apply: true, attachmentRemover: remover(true) });
    expect(report).toEqual({ applied: true, candidates: 1, purged: 0, failed: 1, truncated: false });
    expect(log).not.toContain('message.deleteMany');
    expect(log).not.toContain('conversation.update');
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
