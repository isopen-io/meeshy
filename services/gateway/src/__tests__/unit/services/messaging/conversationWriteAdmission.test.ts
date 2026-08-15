/**
 * La règle que le schéma déclarait et que personne n'appliquait.
 *
 * `schema.prisma` documente `Conversation.closedAt` par « Conversation closed
 * for all — **no one can write**, messages stay readable ». Le recensement du
 * cycle 31 n'a trouvé AUCUNE lecture de `Conversation.isActive` / `closedAt`
 * comme garde : les deux champs sont écrits (clôture), diffusés
 * (`conversation:closed`) et lus par le flux de rattrapage
 * (`delta-tombstones`), jamais opposés à un écrivain.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitConversationWrite,
  isConversationClosed,
  isConversationWriteRefused
} from '../../../../services/messaging/conversationWriteAdmission';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';

const readerReturning = (row: unknown) => ({
  conversation: {
    findUnique: jest.fn(async () => row)
  }
}) as any;

describe('isConversationClosed — le prédicat, sur une ligne déjà chargée', () => {
  it('dit close une conversation dont `isActive` est faux', () => {
    expect(isConversationClosed({ isActive: false, closedAt: null })).toBe(true);
  });

  // `leave.ts` (créateur dernier membre) ferme en n'écrivant QUE `isActive`,
  // constat latent nº 2 du cycle 30 : un prédicat qui ne lirait que `closedAt`
  // laisserait ce quatrième écrivain de clôture hors de la règle.
  it('dit close une conversation fermée SANS `closedAt`', () => {
    expect(isConversationClosed({ isActive: false })).toBe(true);
  });

  // ... et réciproquement : un futur écrivain qui n'estampillerait que la date
  // ne doit pas pouvoir contourner la règle par omission d'un booléen.
  it('dit close une conversation estampillée `closedAt` sans `isActive` faux', () => {
    expect(isConversationClosed({ isActive: true, closedAt: new Date() })).toBe(true);
  });

  it('dit ouverte une conversation active et non estampillée', () => {
    expect(isConversationClosed({ isActive: true, closedAt: null })).toBe(false);
  });

  // L'unité n'est PAS l'autorité d'appartenance — celle-là est le
  // `Participant`, vérifié juste avant par chaque appelant. « Inconnu » n'est
  // pas « terminal » : une ligne absente ne fabrique pas un refus.
  it('n’invente pas un refus sur une ligne absente', () => {
    expect(isConversationClosed(null)).toBe(false);
    expect(isConversationClosed(undefined)).toBe(false);
  });
});

describe('admitConversationWrite — la lecture, pour le point de convergence', () => {
  it('refuse l’écriture dans une conversation close', async () => {
    const prisma = readerReturning({ isActive: false, closedAt: new Date() });

    const admission = await admitConversationWrite(prisma, { conversationId: CONVERSATION_ID });

    expect(isConversationWriteRefused(admission)).toBe(true);
    expect(admission).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('admet l’écriture dans une conversation active', async () => {
    const prisma = readerReturning({ isActive: true, closedAt: null });

    const admission = await admitConversationWrite(prisma, { conversationId: CONVERSATION_ID });

    expect(isConversationWriteRefused(admission)).toBe(false);
  });

  it('ne lit que les deux colonnes de l’état terminal', async () => {
    const prisma = readerReturning({ isActive: true, closedAt: null });

    await admitConversationWrite(prisma, { conversationId: CONVERSATION_ID });

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID },
      select: { isActive: true, closedAt: true }
    });
  });
});
