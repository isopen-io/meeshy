/**
 * #7498 — une pièce jointe porte la protection de SON message.
 *
 * Suite SÉPARÉE de `AttachmentService.direct.test.ts`, qui est hors budget de
 * taille (cliquet `gateway-test-file-size-budget`) : on extrait d'abord, on
 * ajoute ensuite. Elle ne double pas le harnais de sa voisine — elle ne monte
 * que ce que `associateAttachmentsToMessage` touche, c'est-à-dire un seul
 * `updateMany`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const mockUploadProcessor = {} as any;

jest.mock('../../../services/attachments/UploadProcessor', () => ({
  UploadProcessor: jest.fn().mockImplementation(() => mockUploadProcessor),
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => ({})),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { AttachmentService } from '../../../services/attachments';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ATTACH_ID = '507f1f77bcf86cd799439001';
const MSG_ID = '507f1f77bcf86cd799439002';

function makePrisma() {
  return {
    messageAttachment: {
      updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 }),
    },
  };
}

describe('AttachmentService.associateAttachmentsToMessage — protection (#7498)', () => {
  // Les trois colonnes jumelles existaient et restaient à leur défaut : une
  // photo envoyée sous « vue unique » produisait un message protégé portant
  // une pièce ORDINAIRE. Tout ce qui garde au niveau de la PIÈCE
  // (`maskedAttachment` de l'éventail de notifications, le gate fail-closed de
  // la traduction de légende) lisait `false` et laissait passer, pendant que
  // la bulle, elle, affichait bien le voile.
  it('écrit la protection du message sur ses pièces jointes', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID, {
      isViewOnce: true,
      isBlurred: true,
      effectFlags: 0b111,
    });

    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ATTACH_ID] } },
      data: { messageId: MSG_ID, isViewOnce: true, isBlurred: true, effectFlags: 0b111 },
    });
  });

  // Un `false` ÉCRIT et une colonne NON TOUCHÉE ne sont pas la même chose : le
  // second laisse intacte une protection qu'une pièce porterait déjà par un
  // autre chemin. Un appelant qui ne déclare rien ne doit donc rien écraser —
  // seule l'absence de clé le garantit.
  it('ne touche pas une colonne que l’appelant ne déclare pas', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID, { isViewOnce: true });

    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ATTACH_ID] } },
      data: { messageId: MSG_ID, isViewOnce: true },
    });
  });

  // Le chemin historique (aucune protection déclarée) ne doit rien écrire
  // d'autre que le lien — c'est ce qui rend le paramètre ADDITIF.
  it('sans protection, n’écrit que le lien', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID);

    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ATTACH_ID] } },
      data: { messageId: MSG_ID },
    });
  });
});
