import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { attachmentReplyOf, withAttachmentReply } from './attachment-reply';

const message = { id: 'm-1', attachments: [{ id: 'a-1' }, { id: 'a-2' }] } as unknown as Message;

describe('attachment-reply (#6303)', () => {
  test('la pièce nommée voyage sur le message cité', () => {
    expect(attachmentReplyOf(withAttachmentReply(message, 'a-2'))).toEqual({ attachmentId: 'a-2' });
  });

  test('une pièce que le message ne porte pas n’est jamais nommée — la passerelle refuserait l’envoi', () => {
    expect(withAttachmentReply(message, 'a-9')).toBe(message);
    expect(attachmentReplyOf(withAttachmentReply(message, 'a-9'))).toBeUndefined();
  });

  test('sans pièce, la citation reste celle du message', () => {
    expect(withAttachmentReply(message, null)).toBe(message);
    expect(attachmentReplyOf(message)).toBeUndefined();
    expect(attachmentReplyOf(undefined)).toBeUndefined();
  });
});
