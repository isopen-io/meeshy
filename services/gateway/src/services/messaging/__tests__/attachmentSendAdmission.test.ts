/**
 * `admitMessageAttachments` — l'admission des pièces PRÉ-UPLOADÉES pour le
 * transport REST de `POST /conversations/:id/messages` (#6870), au même
 * contrat que le contrôle déjà en place côté WS
 * (`MessageHandler.handleMessageSendWithAttachments`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { admitMessageAttachments } from '../attachmentSendAdmission';

const OWNER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const ATTACHMENT_ID_1 = '507f1f77bcf86cd799439033';
const ATTACHMENT_ID_2 = '507f1f77bcf86cd799439044';
const UNKNOWN_ATTACHMENT_ID = '507f1f77bcf86cd799439055';

function prismaWith(rows: Array<{ id: string; uploadedBy: string }>) {
  return { messageAttachment: { findMany: jest.fn().mockResolvedValue(rows) } };
}

describe('admitMessageAttachments (#6870)', () => {
  it('admet sans requête quand aucune pièce n’est fournie', async () => {
    const prisma = prismaWith([]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.messageAttachment.findMany).not.toHaveBeenCalled();
  });

  it('admet quand toutes les pièces existent et appartiennent à l’appelant', async () => {
    const prisma = prismaWith([
      { id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID },
      { id: ATTACHMENT_ID_2, uploadedBy: OWNER_ID },
    ]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1, ATTACHMENT_ID_2],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: true });
  });

  it('refuse et NOMME l’id d’une pièce introuvable — jamais un succès silencieux', async () => {
    const prisma = prismaWith([{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID }]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1, UNKNOWN_ATTACHMENT_ID],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: UNKNOWN_ATTACHMENT_ID });
  });

  it('refuse une pièce qui appartient à quelqu’un d’autre, même si la ligne existe', async () => {
    const prisma = prismaWith([{ id: ATTACHMENT_ID_1, uploadedBy: OTHER_USER_ID }]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_1 });
  });

  it('déduplique les ids avant la requête — un id répété ne coûte pas une ligne de plus', async () => {
    const prisma = prismaWith([{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID }]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1, ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: true });
    const call = (prisma.messageAttachment.findMany as jest.Mock).mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(call.where.id.in).toEqual([ATTACHMENT_ID_1]);
  });
});
