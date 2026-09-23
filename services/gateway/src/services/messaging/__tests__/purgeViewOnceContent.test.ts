/**
 * #7578 — la purge d'une vue unique retire le CONTENU et garde la bulle.
 *
 * L'ancien chemin écrivait l'échéance dans `expiresAt` : le balayage de
 * l'éphémère SUPPRIMAIT alors le message (`deletedAt`, `message:expired`) chez
 * tout le monde, y compris chez qui ne l'avait jamais ouvert. La règle du
 * porteur garde « (1) · déjà ouvert » chez chacun : seul le contenu disparaît.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EPHEMERAL_UNRECEIVED_RETENTION_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import {
  isLegacyViewOnceBurn,
  purgeDueViewOnceContent,
  reevaluateLegacyViewOnceBurn,
} from '../purgeViewOnceContent';

const NOW = new Date('2026-09-23T15:00:00.000Z');

function dueRow(overrides: Record<string, unknown> = {}) {
  return { id: 'msg-1', conversationId: 'conv-1', attachments: [{ id: 'att-1' }], ...overrides };
}

function buildPrisma(rows: unknown[]) {
  return {
    message: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue(rows),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
    },
    messageStatusEntry: { findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]) },
    participant: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      count: jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(2),
    },
  };
}

const remover = () => ({ deleteAttachment: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined) });

describe('purgeDueViewOnceContent', () => {
  it('efface le contenu et les fichiers, SANS poser deletedAt : la bulle reste', async () => {
    const prisma = buildPrisma([dueRow()]);
    const attachments = remover();

    const result = await purgeDueViewOnceContent(prisma as any, { now: NOW, attachmentRemover: attachments });

    expect(result).toEqual({ purged: 1 });
    expect(attachments.deleteAttachment).toHaveBeenCalledWith('att-1');
    const { data } = prisma.message.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ content: '', translations: null, metadata: null, viewOnceBurnedAt: NOW, viewOnceBurnAt: null });
    expect(data).not.toHaveProperty('deletedAt');
    expect(data).not.toHaveProperty('expiresAt');
  });

  it("n'interroge que les échéances de PURGE passées, jamais expiresAt", async () => {
    const prisma = buildPrisma([]);

    await purgeDueViewOnceContent(prisma as any, { now: NOW, attachmentRemover: remover() });

    const query = JSON.stringify(prisma.message.findMany.mock.calls[0][0]);
    expect(query).toContain('viewOnceBurnAt');
    expect(query).not.toContain('expiresAt');
  });

  it('annonce la purge — jamais un retrait', async () => {
    const prisma = buildPrisma([dueRow()]);
    const announce = jest.fn();

    await purgeDueViewOnceContent(prisma as any, { now: NOW, attachmentRemover: remover(), announce });

    expect(announce).toHaveBeenCalledWith({ id: 'msg-1', conversationId: 'conv-1' });
  });

  it("une ligne qui résiste n'est ni comptée ni annoncée — la passe suivante la reprend", async () => {
    const prisma = buildPrisma([dueRow()]);
    prisma.message.update.mockRejectedValue(new Error('mongo down'));
    const announce = jest.fn();

    const result = await purgeDueViewOnceContent(prisma as any, { now: NOW, attachmentRemover: remover(), announce });

    expect(result).toEqual({ purged: 0 });
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('les destructions programmées à tort par l’ancien chemin', () => {
  const base = { id: 'msg-1', conversationId: 'conv-1', senderId: 'author', createdAt: new Date('2026-09-23T14:43:24.000Z') };

  it('reconnaît une vue unique NON éphémère — seul l’ancien chemin y posait expiresAt', () => {
    expect(isLegacyViewOnceBurn({ ...base, isViewOnce: true, ephemeralDuration: null, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })).toBe(true);
  });

  it("laisse un éphémère à son balayage : son échéance est la sienne", () => {
    expect(isLegacyViewOnceBurn({ ...base, isViewOnce: true, ephemeralDuration: 30 })).toBe(false);
    expect(isLegacyViewOnceBurn({ ...base, isViewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL })).toBe(false);
    expect(isLegacyViewOnceBurn({ ...base, isViewOnce: false })).toBe(false);
  });

  it("personne n'a ouvert (l'auteur seul) ⇒ la destruction redevient le plafond de rétention", async () => {
    const prisma = buildPrisma([]);
    prisma.messageStatusEntry.findMany.mockResolvedValue([{ messageId: 'msg-1', participantId: 'author' }]);
    prisma.participant.findMany.mockResolvedValue([{ id: 'author' }]);

    await reevaluateLegacyViewOnceBurn(prisma as any, { ...base, isViewOnce: true }, NOW);

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { expiresAt: null, viewOnceBurnAt: new Date(base.createdAt.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS) },
    });
  });

  it('tous les destinataires ont vraiment ouvert ⇒ purge immédiate, sans supprimer la bulle', async () => {
    const prisma = buildPrisma([]);
    prisma.messageStatusEntry.findMany.mockResolvedValue([{ messageId: 'msg-1', participantId: 'bob' }]);
    prisma.participant.findMany.mockResolvedValue([{ id: 'author' }, { id: 'bob' }]);

    await reevaluateLegacyViewOnceBurn(prisma as any, { ...base, isViewOnce: true }, NOW);

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { expiresAt: null, viewOnceBurnAt: NOW },
    });
  });
});
