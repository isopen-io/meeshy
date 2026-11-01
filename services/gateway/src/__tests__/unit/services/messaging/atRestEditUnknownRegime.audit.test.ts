/**
 * Audit adversarial (PR #14303, seconde passe) — une conversation au régime
 * ILLISIBLE (mode inconnu, ou `e2ee` mal normalisé) ne doit ni admettre une
 * édition ni recevoir le texte modifié en clair dans `content`. La loi partagée
 * (`sharedTranslationServerReadsMessage`) traite un régime inconnu comme
 * chiffré ; l'édition, elle, ne le refuse que s'il vaut exactement `e2ee`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { admitMessageEdit, isEditRefused } from '../../../../services/messaging/messageEditAdmission';
import { prepareEditedText } from '../../../../services/messaging/atRestEdit';

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const prisma = {
  user: { findUnique: jest.fn(async () => ({ role: 'USER' })) },
  participant: { findFirst: jest.fn(async () => ({ id: 'p', user: { role: 'USER' } })) },
};
const crypto = { sealAtRest: jest.fn(async () => { throw new Error('should not be called'); }), openAtRest: jest.fn() };

describe.each([' e2ee', 'e2ee ', 'signal_v3'])('régime de conversation illisible %p', (mode) => {
  it('refuse l’édition, ou du moins n’écrit pas le clair dans content', async () => {
    const admission = await admitMessageEdit({
      prisma: prisma as never,
      editorUserId: 'author',
      message: {
        authorUserId: 'author', conversationId: 'c', createdAt: new Date(NOW - 60_000),
        conversation: { isActive: true, closedAt: null, type: 'direct', encryptionMode: mode },
        messageType: 'text', metadata: null, isEncrypted: false, encryptionMode: null,
      },
      now: NOW,
    } as never);
    if (isEditRefused(admission)) return;
    const prepared = await prepareEditedText({
      crypto: crypto as never,
      row: { conversationId: 'c', content: 'avant', isEncrypted: false, encryptionMode: null, conversation: { encryptionMode: mode } } as never,
      text: 'secret modifié',
    });
    expect(prepared.columns).not.toEqual({ content: 'secret modifié' });
  });
});
