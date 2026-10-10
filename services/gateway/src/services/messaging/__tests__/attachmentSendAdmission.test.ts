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

const CONVERSATION_ID = '507f1f77bcf86cd799439066';
const CARRIER_MESSAGE_ID = '507f1f77bcf86cd799439077';
const GUEST_PARTICIPANT_ID = '507f1f77bcf86cd799439088';
const CLIENT_MESSAGE_ID = 'cid_3f2b8c1e-5d4a-4b7e-9a1c-2f6e8d0b4a11';

type Row = { id: string; uploadedBy: string; messageId?: string | null };
type Carrier = { id: string; conversationId: string; clientMessageId: string | null; identifier?: string };

function prismaWith(rows: Row[], carriers: Carrier[] = []) {
  const findCarriers = jest.fn(async (args: { where: { id: { in: string[] } } }) =>
    carriers
      .filter((carrier) => args.where.id.in.includes(carrier.id))
      .map(({ identifier, ...carrier }) => ({ ...carrier, conversation: { identifier: identifier ?? null } })),
  );
  return {
    messageAttachment: { findMany: jest.fn().mockResolvedValue(rows) },
    message: { findMany: findCarriers },
  };
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

describe('admitMessageAttachments — une pièce déjà attachée ne se ré-attache pas (#9587)', () => {
  it('admet une pièce dont `messageId` est ABSENT du document comme une pièce à `null`', async () => {
    const prisma = prismaWith([
      { id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID },
      { id: ATTACHMENT_ID_2, uploadedBy: OWNER_ID, messageId: null },
    ]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1, ATTACHMENT_ID_2],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('refuse à un INSCRIT de re-lier sa propre pièce déjà envoyée — la bulle d’origine ne se vide pas', async () => {
    const prisma = prismaWith([{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID }]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
      conversationId: CONVERSATION_ID,
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_1 });
  });

  it('refuse à un invité ANONYME la pièce d’une copie transférée née sous son identité', async () => {
    const prisma = prismaWith([
      { id: ATTACHMENT_ID_1, uploadedBy: GUEST_PARTICIPANT_ID, messageId: CARRIER_MESSAGE_ID },
    ]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: GUEST_PARTICIPANT_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_1 });
  });

  it('refuse le lot entier quand UNE pièce est déjà attachée, et la nomme', async () => {
    const prisma = prismaWith([
      { id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: null },
      { id: ATTACHMENT_ID_2, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID },
    ]);

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1, ATTACHMENT_ID_2],
      ownerId: OWNER_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_2 });
  });

  it('admet le RÉESSAI du même envoi : la pièce est déjà sur le message de ce `clientMessageId`', async () => {
    const prisma = prismaWith(
      [{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID }],
      [{ id: CARRIER_MESSAGE_ID, conversationId: CONVERSATION_ID, clientMessageId: CLIENT_MESSAGE_ID }],
    );

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
      conversationId: CONVERSATION_ID,
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result).toEqual({ ok: true });
  });

  it('admet le réessai d’un transport qui adresse la conversation par son `identifier`', async () => {
    const prisma = prismaWith(
      [{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID }],
      [{ id: CARRIER_MESSAGE_ID, conversationId: CONVERSATION_ID, clientMessageId: CLIENT_MESSAGE_ID, identifier: 'meeshy' }],
    );

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
      conversationId: 'meeshy',
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result).toEqual({ ok: true });
  });

  it('refuse un autre `clientMessageId` que celui du message porteur', async () => {
    const prisma = prismaWith(
      [{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID }],
      [{ id: CARRIER_MESSAGE_ID, conversationId: CONVERSATION_ID, clientMessageId: CLIENT_MESSAGE_ID }],
    );

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
      conversationId: CONVERSATION_ID,
      clientMessageId: 'cid_00000000-0000-4000-8000-000000000000',
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_1 });
  });

  it('refuse le réessai qui vise une AUTRE conversation que celle du message porteur', async () => {
    const prisma = prismaWith(
      [{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID }],
      [{ id: CARRIER_MESSAGE_ID, conversationId: CONVERSATION_ID, clientMessageId: CLIENT_MESSAGE_ID }],
    );

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
      conversationId: OTHER_USER_ID,
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_1 });
  });

  it('refuse une pièce attachée quand l’envoi ne porte aucun `clientMessageId` — sans lire les messages', async () => {
    const prisma = prismaWith(
      [{ id: ATTACHMENT_ID_1, uploadedBy: OWNER_ID, messageId: CARRIER_MESSAGE_ID }],
      [{ id: CARRIER_MESSAGE_ID, conversationId: CONVERSATION_ID, clientMessageId: null }],
    );

    const result = await admitMessageAttachments(prisma as never, {
      attachmentIds: [ATTACHMENT_ID_1],
      ownerId: OWNER_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(result).toEqual({ ok: false, invalidAttachmentId: ATTACHMENT_ID_1 });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
