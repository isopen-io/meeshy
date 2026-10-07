/**
 * L'échéance d'un LECTEUR s'applique aussi au fichier (#9589).
 *
 * `resolveAttachmentReadVerdict` ne lisait que les colonnes GLOBALES du
 * message porteur. Un destinataire dont le décompte était fini, qui avait
 * consommé sa flamme après lecture ou brûlé sa vue unique retéléchargeait le
 * fichier par identifiant jusqu'à la destruction globale — sept jours quand un
 * autre membre ne recevait jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { FastifyRequest } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS, EPHEMERAL_UNRECEIVED_RETENTION_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import { VIEW_ONCE_BURN_GRACE_MS } from '../../messaging/scheduleViewOnceBurn';
import { resolveAttachmentReadVerdict } from '../attachmentReadVerdict';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const READER_PARTICIPANT = '507f1f77bcf86cd799439013';
const READER_USER = '507f1f77bcf86cd799439014';
const SENDER_PARTICIPANT = '507f1f77bcf86cd799439015';
const SENDER_USER = '507f1f77bcf86cd799439016';
const GUEST_PARTICIPANT = '507f1f77bcf86cd799439017';

const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE } = MESSAGE_EFFECT_FLAGS;
const NOW = Date.now();
const ago = (ms: number): Date => new Date(NOW - ms);
const ahead = (ms: number): Date => new Date(NOW + ms);
const MINUTE = 60_000;

type Entry = { ephemeralExpiresAt?: Date | null; viewedOnceAt?: Date | null };

const message = (over: Record<string, unknown> = {}) => ({
  conversationId: CONVERSATION_ID,
  deletedAt: null,
  expiresAt: ahead(EPHEMERAL_UNRECEIVED_RETENTION_MS),
  viewOnceBurnAt: null,
  senderId: SENDER_PARTICIPANT,
  createdAt: ago(10 * MINUTE),
  isViewOnce: false,
  effectFlags: 0,
  ephemeralDuration: null,
  ...over,
});

function setup(input: {
  message: ReturnType<typeof message>;
  entry?: Entry | null;
  reader?: 'recipient' | 'sender' | 'guest';
  attachment?: Record<string, unknown>;
}) {
  const reader = input.reader ?? 'recipient';
  const participantId = reader === 'sender' ? SENDER_PARTICIPANT : reader === 'guest' ? GUEST_PARTICIPANT : READER_PARTICIPANT;
  const statusFindFirst = jest.fn<any>().mockResolvedValue(input.entry ?? null);
  const prisma = {
    message: { findUnique: jest.fn<any>().mockResolvedValue(input.message) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: participantId }) },
    messageStatusEntry: { findFirst: statusFindFirst },
  };
  const authContext =
    reader === 'guest'
      ? { isAuthenticated: true, isAnonymous: true, participantId: GUEST_PARTICIPANT, userId: GUEST_PARTICIPANT }
      : { isAuthenticated: true, isAnonymous: false, userId: reader === 'sender' ? SENDER_USER : READER_USER };
  const verdict = () =>
    resolveAttachmentReadVerdict(
      { authContext } as unknown as FastifyRequest,
      { messageId: MESSAGE_ID, uploadedBy: SENDER_USER, ...input.attachment },
      prisma as never,
    );
  return { verdict, statusFindFirst, participantId };
}

describe('resolveAttachmentReadVerdict — l’échéance du lecteur ferme le fichier (#9589)', () => {
  const timedFlame = message({ effectFlags: EPHEMERAL, ephemeralDuration: 30 });

  it('ne lit aucune ligne de statut pour un message ordinaire', async () => {
    const { verdict, statusFindFirst } = setup({ message: message({ expiresAt: null }) });

    expect(await verdict()).toBe('allow');
    expect(statusFindFirst).not.toHaveBeenCalled();
  });

  it('refuse au destinataire dont le décompte est FINI, alors que le message vit encore pour d’autres', async () => {
    const { verdict, statusFindFirst, participantId } = setup({
      message: timedFlame,
      entry: { ephemeralExpiresAt: ago(MINUTE) },
    });

    expect(await verdict()).toBe('gone');
    expect(statusFindFirst).toHaveBeenCalledWith({
      where: { messageId: MESSAGE_ID, participantId },
      select: { ephemeralExpiresAt: true, viewedOnceAt: true },
    });
  });

  it('sert au destinataire dont le décompte court encore', async () => {
    const { verdict } = setup({ message: timedFlame, entry: { ephemeralExpiresAt: ahead(MINUTE) } });

    expect(await verdict()).toBe('allow');
  });

  it('sert au destinataire qui n’a pas encore reçu : rien ne décompte pour lui', async () => {
    expect(await setup({ message: timedFlame, entry: null }).verdict()).toBe('allow');
    expect(await setup({ message: timedFlame, entry: {} }).verdict()).toBe('allow');
  });

  it('refuse à l’invité ANONYME dont le décompte est fini, résolu par son `Participant.id`', async () => {
    const { verdict, statusFindFirst } = setup({
      message: timedFlame,
      entry: { ephemeralExpiresAt: ago(MINUTE) },
      reader: 'guest',
    });

    expect(await verdict()).toBe('gone');
    expect(statusFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { messageId: MESSAGE_ID, participantId: GUEST_PARTICIPANT } }),
    );
  });

  it('refuse au lecteur qui a CONSOMMÉ sa flamme après lecture', async () => {
    const { verdict } = setup({
      message: message({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }),
      entry: { ephemeralExpiresAt: ago(1_000) },
    });

    expect(await verdict()).toBe('gone');
  });

  it('laisse à l’expéditeur d’une flamme après lecture son fichier : il la garde jusqu’à la destruction', async () => {
    const { verdict } = setup({
      message: message({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }),
      entry: null,
      reader: 'sender',
    });

    expect(await verdict()).toBe('allow');
  });

  describe('la copie transférée — durée ET après lecture', () => {
    const copy = (createdAt: Date) =>
      message({
        effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ,
        ephemeralDuration: 30,
        createdAt,
        // Un destinataire a reçu tard : la destruction globale est repoussée.
        expiresAt: ahead(EPHEMERAL_UNAVAILABILITY_GRACE_MS + 10 * MINUTE),
      });

    it('refuse à son EXPÉDITEUR passé « envoi + durée »', async () => {
      expect(await setup({ message: copy(ago(31_000)), reader: 'sender' }).verdict()).toBe('gone');
    });

    it('lui sert tant que « envoi + durée » n’est pas atteint', async () => {
      expect(await setup({ message: copy(ago(5_000)), reader: 'sender' }).verdict()).toBe('allow');
    });
  });

  describe('la vue unique brûlée par CE lecteur', () => {
    const viewOnce = message({ isViewOnce: true, effectFlags: VIEW_ONCE, expiresAt: null, viewOnceBurnAt: ahead(EPHEMERAL_UNRECEIVED_RETENTION_MS) });

    it('sert pendant le sursis qui suit son ouverture — c’est lui qui regarde', async () => {
      const { verdict } = setup({ message: viewOnce, entry: { viewedOnceAt: ago(VIEW_ONCE_BURN_GRACE_MS - MINUTE) } });

      expect(await verdict()).toBe('allow');
    });

    it('refuse une fois le sursis passé, même si un autre destinataire n’a pas encore ouvert', async () => {
      const { verdict } = setup({ message: viewOnce, entry: { viewedOnceAt: ago(VIEW_ONCE_BURN_GRACE_MS + 1_000) } });

      expect(await verdict()).toBe('gone');
    });

    it('sert à qui n’a pas encore ouvert', async () => {
      expect(await setup({ message: viewOnce, entry: {} }).verdict()).toBe('allow');
    });

    it('lit le statut quand SEULE la pièce est à vue unique', async () => {
      const { verdict } = setup({
        message: message({ expiresAt: null }),
        entry: { viewedOnceAt: ago(VIEW_ONCE_BURN_GRACE_MS + 1_000) },
        attachment: { isViewOnce: true },
      });

      expect(await verdict()).toBe('gone');
    });
  });

  it('juge l’APPARTENANCE avant l’échéance : un étranger reçoit 403, jamais ce qu’il est advenu du contenu', async () => {
    const statusFindFirst = jest.fn<any>();
    const prisma = {
      message: { findUnique: jest.fn<any>().mockResolvedValue(timedFlame) },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      messageStatusEntry: { findFirst: statusFindFirst },
    };

    const verdict = await resolveAttachmentReadVerdict(
      { authContext: { isAuthenticated: true, isAnonymous: false, userId: READER_USER } } as unknown as FastifyRequest,
      { messageId: MESSAGE_ID, uploadedBy: SENDER_USER },
      prisma as never,
    );

    expect(verdict).toBe('forbidden');
    expect(statusFindFirst).not.toHaveBeenCalled();
  });

  it('laisse REMONTER une lecture de statut en panne — jamais « encore lisible » par défaut', async () => {
    const prisma = {
      message: { findUnique: jest.fn<any>().mockResolvedValue(timedFlame) },
      participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: READER_PARTICIPANT }) },
      messageStatusEntry: { findFirst: jest.fn<any>().mockRejectedValue(new Error('base indisponible')) },
    };

    await expect(
      resolveAttachmentReadVerdict(
        { authContext: { isAuthenticated: true, isAnonymous: false, userId: READER_USER } } as unknown as FastifyRequest,
        { messageId: MESSAGE_ID, uploadedBy: SENDER_USER },
        prisma as never,
      ),
    ).rejects.toThrow('base indisponible');
  });
});
