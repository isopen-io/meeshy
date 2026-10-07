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
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const ATTACH_ID = '507f1f77bcf86cd799439001';
const MSG_ID = '507f1f77bcf86cd799439002';

const UNATTACHED = { OR: [{ messageId: null }, { messageId: { isSet: false } }] };

function makePrisma(rows: Array<{ id: string; effectFlags: number | null }> = []) {
  return {
    messageAttachment: {
      updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 }),
      findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue(rows),
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
    const prisma = makePrisma([{ id: ATTACH_ID, effectFlags: 0 }]);
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID, {
      isViewOnce: true,
      isBlurred: true,
      effectFlags: 0b111,
    });

    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ATTACH_ID] }, ...UNATTACHED },
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
      where: { id: { in: [ATTACH_ID] }, ...UNATTACHED },
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
      where: { id: { in: [ATTACH_ID] }, ...UNATTACHED },
      data: { messageId: MSG_ID },
    });
  });
});

describe('AttachmentService.associateAttachmentsToMessage — le lien ne déplace ni ne déprotège (#9587)', () => {
  const OTHER_ATTACH_ID = '507f1f77bcf86cd799439003';
  const { EPHEMERAL, BLURRED, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;

  it('n’apparie que des pièces NON attachées — `messageId` nul ou absent du document', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID, { isViewOnce: false, isBlurred: false, effectFlags: 0 });

    const calls = prisma.messageAttachment.updateMany.mock.calls as Array<[{ where: Record<string, unknown> }]>;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].where).toEqual({ id: { in: [ATTACH_ID] }, ...UNATTACHED });
  });

  it('un message ORDINAIRE n’écrit aucun `false` ni aucun zéro sur la protection d’une pièce', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID, { isViewOnce: false, isBlurred: false, effectFlags: 0 });

    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ATTACH_ID] }, ...UNATTACHED },
      data: { messageId: MSG_ID },
    });
    expect(prisma.messageAttachment.findMany).not.toHaveBeenCalled();
  });

  it('AJOUTE les bits du message à ceux que la pièce porte déjà, pièce par pièce', async () => {
    const prisma = makePrisma([
      { id: ATTACH_ID, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ },
      { id: OTHER_ATTACH_ID, effectFlags: null },
    ]);
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID, OTHER_ATTACH_ID], MSG_ID, { isBlurred: true, effectFlags: BLURRED });

    expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith({
      where: { id: { in: [ATTACH_ID, OTHER_ATTACH_ID] }, ...UNATTACHED },
      select: { id: true, effectFlags: true },
    });
    const writes = (prisma.messageAttachment.updateMany.mock.calls as Array<[{ where: { id: { in: string[] } }; data: Record<string, unknown> }]>)
      .map(([args]) => ({ ids: args.where.id.in, data: args.data, where: args.where }));
    expect(writes).toHaveLength(2);
    expect(writes).toContainEqual({
      ids: [ATTACH_ID],
      where: { id: { in: [ATTACH_ID] }, ...UNATTACHED },
      data: { messageId: MSG_ID, isBlurred: true, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ | BLURRED },
    });
    expect(writes).toContainEqual({
      ids: [OTHER_ATTACH_ID],
      where: { id: { in: [OTHER_ATTACH_ID] }, ...UNATTACHED },
      data: { messageId: MSG_ID, isBlurred: true, effectFlags: BLURRED },
    });
  });

  it('n’écrit rien quand aucune pièce demandée n’est libre', async () => {
    const prisma = makePrisma([]);
    const svc = new AttachmentService(prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([ATTACH_ID], MSG_ID, { effectFlags: BLURRED });

    expect(prisma.messageAttachment.updateMany).not.toHaveBeenCalled();
  });
});
