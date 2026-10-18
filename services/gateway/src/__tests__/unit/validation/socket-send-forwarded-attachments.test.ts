/**
 * #9914 — `forwardedAttachmentIds` traverse les DEUX schémas socket d'envoi :
 * `z.object` strippe en silence un champ non déclaré, et ce transport aurait
 * recopié tout le lot sous le nom d'une seule pièce.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SocketMessageSendSchema, SocketMessageSendWithAttachmentsSchema } from '../../../validation/socket-event-schemas';
import { forwardReferencesOf } from '../../../validation/forwarded-attachments';

const CID = 'cid_123e4567-e89b-42d3-a456-426614174000';
const SOURCE = '507f1f77bcf86cd799439011';
const PIECE = '507f1f77bcf86cd799439033';
const CONV = '507f1f77bcf86cd799439022';

const SCHEMAS = [
  ['message:send', SocketMessageSendSchema, {}],
  ['message:send-with-attachments', SocketMessageSendWithAttachmentsSchema, { attachmentIds: [PIECE] }],
] as const;

describe.each(SCHEMAS)('%s — forwardedAttachmentIds', (_name, schema, extra) => {
  const base = { conversationId: CONV, content: '', clientMessageId: CID, forwardedFromId: SOURCE, ...extra };

  it('garde les pièces choisies', () => {
    const parsed = schema.safeParse({ ...base, forwardedAttachmentIds: [PIECE] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.forwardedAttachmentIds).toEqual([PIECE]);
  });

  it('refuse un identifiant malformé et une liste vide', () => {
    expect(schema.safeParse({ ...base, forwardedAttachmentIds: ['nope'] }).success).toBe(false);
    expect(schema.safeParse({ ...base, forwardedAttachmentIds: [] }).success).toBe(false);
  });

  it('reste facultatif — un ancien client ne l’envoie pas', () => {
    expect(schema.safeParse(base).success).toBe(true);
  });
});

describe('forwardReferencesOf — les références de transfert voyagent en bloc', () => {
  it('recopie les trois, absentes comprises', () => {
    expect(forwardReferencesOf({ forwardedFromId: SOURCE, forwardedAttachmentIds: [PIECE] })).toEqual({
      forwardedFromId: SOURCE,
      forwardedFromConversationId: undefined,
      forwardedAttachmentIds: [PIECE],
    });
  });
});
