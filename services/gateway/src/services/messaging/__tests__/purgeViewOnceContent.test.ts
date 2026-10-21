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
import { sharedTranslationRow, sharedTranslationTable } from '../../../__tests__/helpers/shared-translation-table';

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

/**
 * Ce que la purge d'une vue unique doit à la table des traductions PARTAGÉES
 * (#9899, audit C4).
 *
 * La purge efface `translations` du message — celles du SERVEUR — et laissait
 * intacte la version scellée que les appareils s'étaient passée : pour une vue
 * unique, c'est le contenu même qui devait disparaître, et il restait lisible,
 * pour qui détenait la clé, dans la table voisine. Cette purge n'appelle pas
 * `applyMessageRemovalEffects` (aucun `deletedAt`, la bulle reste) : elle porte
 * donc l'effacement elle-même.
 *
 * Le double de la table APPLIQUE le `where` ; ces témoins lisent les lignes qui
 * RESTENT.
 */
describe('purgeDueViewOnceContent — traductions partagées', () => {
  const prismaWith = (rows: unknown[], table: ReturnType<typeof sharedTranslationTable>) => ({
    ...buildPrisma(rows),
    sharedTranslation: table.delegate,
  });

  it('efface les traductions partagées du message purgé — son contenu a disparu, sa version scellée aussi', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'fr', messageId: 'msg-1', targetLanguage: 'fr' }),
      sharedTranslationRow({ id: 'en', messageId: 'msg-1', targetLanguage: 'en' }),
    ]);

    await purgeDueViewOnceContent(prismaWith([dueRow()], table) as any, { now: NOW, attachmentRemover: remover() });

    expect(table.remainingIds()).toEqual([]);
  });

  it("laisse intactes les traductions partagées d'un message qui n'est pas échu", async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'purgé', messageId: 'msg-1' }),
      sharedTranslationRow({ id: 'voisin', messageId: 'msg-ailleurs' }),
    ]);

    await purgeDueViewOnceContent(prismaWith([dueRow()], table) as any, { now: NOW, attachmentRemover: remover() });

    expect(table.remainingIds()).toEqual(['voisin']);
  });

  it('efface toute la passe en UNE requête, pas une par message', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'a', messageId: 'msg-1' }),
      sharedTranslationRow({ id: 'b', messageId: 'msg-2' }),
      sharedTranslationRow({ id: 'c', messageId: 'msg-3' }),
    ]);
    const rows = [dueRow({ id: 'msg-1' }), dueRow({ id: 'msg-2' }), dueRow({ id: 'msg-3' })];

    await purgeDueViewOnceContent(prismaWith(rows, table) as any, { now: NOW, attachmentRemover: remover() });

    expect(table.deleteMany).toHaveBeenCalledTimes(1);
    expect(table.remainingIds()).toEqual([]);
  });

  it("n'efface pas celles d'une ligne dont l'écriture a résisté — la passe suivante reprend les deux", async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'résiste', messageId: 'msg-1' }),
      sharedTranslationRow({ id: 'purgé', messageId: 'msg-2' }),
    ]);
    const prisma = prismaWith([dueRow({ id: 'msg-1' }), dueRow({ id: 'msg-2' })], table);
    prisma.message.update.mockImplementation(async (args: unknown) => {
      if ((args as { where: { id: string } }).where.id === 'msg-1') throw new Error('mongo down');
      return {};
    });

    const result = await purgeDueViewOnceContent(prisma as any, { now: NOW, attachmentRemover: remover() });

    expect(result).toEqual({ purged: 1 });
    expect(table.remainingIds()).toEqual(['résiste']);
  });

  it("n'émet aucune requête quand aucune ligne n'est échue", async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ id: 'intacte' })]);

    await purgeDueViewOnceContent(prismaWith([], table) as any, { now: NOW, attachmentRemover: remover() });

    expect(table.deleteMany).not.toHaveBeenCalled();
    expect(table.remainingIds()).toEqual(['intacte']);
  });

  it('une table voisine qui ne répond pas ne retire rien à la purge : comptée, annoncée', async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ messageId: 'msg-1' })]);
    table.deleteMany.mockRejectedValueOnce(new Error('mongo down'));
    const announce = jest.fn();

    const result = await purgeDueViewOnceContent(prismaWith([dueRow()], table) as any, {
      now: NOW,
      attachmentRemover: remover(),
      announce,
    });

    expect(result).toEqual({ purged: 1 });
    expect(announce).toHaveBeenCalledWith({ id: 'msg-1', conversationId: 'conv-1' });
  });

  it("une passe interrompue en cours de route n'abandonne pas l'effacement des messages déjà purgés", async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ id: 'déjà-purgé', messageId: 'msg-1' })]);
    const prisma = prismaWith([dueRow({ id: 'msg-1' }), dueRow({ id: 'msg-2' })], table);
    prisma.message.update.mockImplementation(async (args: unknown) => {
      if ((args as { where: { id: string } }).where.id === 'msg-2') throw new Error('mongo down');
      return {};
    });

    await expect(
      purgeDueViewOnceContent(prisma as any, {
        now: NOW,
        attachmentRemover: remover(),
        onError: () => {
          throw new Error('le rappel d’erreur lève à son tour');
        },
      }),
    ).rejects.toThrow('le rappel d’erreur lève à son tour');

    expect(table.remainingIds()).toEqual([]);
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

  it('laisse une flamme-œil à vue unique à SA destruction, même privée du bit EPHEMERAL (#8345)', () => {
    const flame = MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ | MESSAGE_EFFECT_FLAGS.VIEW_ONCE;
    expect(isLegacyViewOnceBurn({ ...base, isViewOnce: true, ephemeralDuration: null, effectFlags: flame })).toBe(false);
    expect(
      isLegacyViewOnceBurn({ ...base, isViewOnce: true, ephemeralDuration: null, effectFlags: flame | MESSAGE_EFFECT_FLAGS.EPHEMERAL }),
    ).toBe(false);
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
