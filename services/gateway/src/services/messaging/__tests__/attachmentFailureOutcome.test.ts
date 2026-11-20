/**
 * @jest-environment node
 *
 * #19956 — la LOI, lue seule : ce qu'un échec de pièce jointe fait du message
 * déjà écrit. Les trois issues et ce qui les sépare — la LIBÉRATION des pièces
 * pré-téléversées, sans laquelle le rejeu reconstruirait un message amputé.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const logError = jest.fn();
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => logError(...a), debug: jest.fn() })),
    warn: jest.fn(),
  },
}));

import {
  discardMessageAfterCopyFailure,
  discardMessageAfterLinkFailure,
  sealLinkedFilesAtRest,
  type AttachmentFailurePrisma,
} from '../attachmentFailureOutcome';
import { MESSAGE_SCOPED_MODELS } from '../messageScopedRows';

const MSG_ID = '507f1f77bcf86cd799439033';

function makePrisma(overrides: { deleteImpl?: (args: unknown) => Promise<unknown>; updateManyImpl?: (args: unknown) => Promise<unknown> } = {}) {
  const del = jest.fn(overrides.deleteImpl ?? (async (_args: unknown) => ({ id: MSG_ID })));
  const updateMany = jest.fn(overrides.updateManyImpl ?? (async (_args: unknown) => ({ count: 2 })));
  const prisma = {
    message: { delete: del },
    messageAttachment: { updateMany },
    ...Object.fromEntries(MESSAGE_SCOPED_MODELS.map((m) => [m, { deleteMany: jest.fn(async () => ({ count: 0 })) }])),
  } as unknown as AttachmentFailurePrisma;
  return { prisma, del, updateMany };
}

describe('attachmentFailureOutcome', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('un échec de LIAISON', () => {
    it('rend les pièces déjà liées à l’état non lié, PUIS supprime le message', async () => {
      const { prisma, del, updateMany } = makePrisma();

      await discardMessageAfterLinkFailure(prisma, { messageId: MSG_ID });

      // La libération est ce qui rend le rejeu COMPLET : `associateAttachmentsToMessage`
      // ne relie qu'un `messageId` nul ou absent, donc une pièce restée liée à la
      // ligne supprimée serait manquée par le nouvel essai, en silence.
      expect(updateMany).toHaveBeenCalledWith({ where: { messageId: MSG_ID }, data: { messageId: null } });
      expect(del).toHaveBeenCalledWith({ where: { id: MSG_ID } });
      expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
    });

    it('supprime quand même le message si la libération échoue, et ne lève pas', async () => {
      const { prisma, del } = makePrisma({ updateManyImpl: async () => { throw new Error('mongo down'); } });

      await expect(discardMessageAfterLinkFailure(prisma, { messageId: MSG_ID })).resolves.toBeUndefined();

      expect(del).toHaveBeenCalledWith({ where: { id: MSG_ID } });
      expect(logError).toHaveBeenCalled();
    });

    // Ce témoin n'atteste PAS « l'erreur d'origine n'est pas masquée » — son
    // intitulé le disait, et c'était faux : cette fonction ne REÇOIT pas
    // l'erreur d'origine, donc rien ici ne peut tomber sur cette propriété-là.
    // Elle est tenue par `MessageProcessor.attachmentFailure.test.ts`, où le
    // `throw` d'après le nettoyage est observable. Ici on garde ce qui l'est :
    // une suppression qui échoue ne fait pas lever le nettoyage, et elle
    // laisse une trace nommée.
    it('survit à une suppression qui échoue, et la journalise', async () => {
      const { prisma } = makePrisma({ deleteImpl: async () => { throw new Error('mongo down'); } });

      await expect(discardMessageAfterLinkFailure(prisma, { messageId: MSG_ID })).resolves.toBeUndefined();

      expect(logError.mock.calls.some(([msg]) => String(msg).includes('message orphelin'))).toBe(true);
    });
  });

  describe('un échec de COPIE', () => {
    it('supprime le message sans RIEN libérer — les lignes recopiées naissent avec lui', async () => {
      const { prisma, del, updateMany } = makePrisma();

      await discardMessageAfterCopyFailure(prisma, { messageId: MSG_ID });

      expect(del).toHaveBeenCalledWith({ where: { id: MSG_ID } });
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('un échec de SCELLEMENT après une liaison réussie', () => {
    it('est absorbé : les pièces SONT liées, et le rattrapage rejoue le scellement', async () => {
      await expect(
        sealLinkedFilesAtRest(async () => { throw new Error('keyring unavailable'); }, { messageId: MSG_ID })
      ).resolves.toBeUndefined();

      expect(logError).toHaveBeenCalled();
      expect(logError.mock.calls[0][2]).toMatchObject({ code: 'SERVER_AT_REST_FILE_SEAL_FAILED', messageId: MSG_ID });
    });

    it('laisse passer le scellement nominal sans rien journaliser', async () => {
      const seal = jest.fn(async () => undefined);

      await sealLinkedFilesAtRest(seal, { messageId: MSG_ID });

      expect(seal).toHaveBeenCalledTimes(1);
      expect(logError).not.toHaveBeenCalled();
    });
  });
});
