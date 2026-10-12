/**
 * #8686 — le RECALCUL de l'aperçu (édition, suppression, masquage) sert aussi
 * la ligne de liste d'une réponse morte pour un lecteur (#8630) « expirée » :
 * éditer une réponse dont la chaîne citée est morte pour B ne lui republie pas
 * son texte en aperçu, comme `GET /conversations` ne le lui sert pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../../../socketio/emitConversationPreviewUpdate';

const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR_ID = '507f1f77bcf86cd799439011';
const PEER_ID = '507f1f77bcf86cd799439012';
const REPLY_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const FLAME_ID = 'cccccccccccccccccccccccc';
const CONSUMED = new Date(Date.now() - 60_000);

type Emission = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (emissions: Emission[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emissions.push({ room, event, payload: payload as Record<string, unknown> });
    },
  }),
});

const makePrisma = (deadFor: readonly string[]) =>
  ({
    participant: {
      findMany: jest.fn(async () => [
        {
          id: 'part-actor',
          userId: ACTOR_ID,
          user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
        },
        {
          id: 'part-peer',
          userId: PEER_ID,
          user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
        },
      ]),
    },
    message: {
      findFirst: jest.fn(async (q: any) => {
        const isReplacement = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
        if (isReplacement) return null;
        return {
          id: REPLY_ID,
          content: 'je réponds, édité',
          senderId: 'part-actor',
          replyToId: FLAME_ID,
          originalLanguage: 'fr',
          translations: null,
          createdAt: new Date('2026-10-12T10:00:00Z'),
          isBlurred: false,
          isViewOnce: false,
          expiresAt: null,
          ephemeralDuration: null,
          effectFlags: 0,
          attachments: [],
        };
      }),
      findMany: jest.fn(async (q: any) =>
        q?.where?.id?.in?.includes(FLAME_ID)
          ? [{ id: FLAME_ID, replyToId: null, senderId: 'part-author', ephemeralDuration: null, effectFlags: 8, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) }]
          : [],
      ),
    },
    messageStatusEntry: {
      findMany: jest.fn(async () =>
        deadFor.map((participantId) => ({
          messageId: FLAME_ID,
          participantId,
          ephemeralExpiresAt: CONSUMED,
          participant: { userId: participantId === 'part-peer' ? PEER_ID : ACTOR_ID },
        })),
      ),
    },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  }) as never;

const previewFor = (emissions: Emission[], userId: string) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED && e.room === `user:${userId}`);

describe('emitConversationPreviewUpdate — une réponse morte pour un lecteur lui part « expirée » (#8686)', () => {
  it('B, pour qui la flamme citée est morte, reçoit la ligne sans texte, datée de la mort', async () => {
    const emissions: Emission[] = [];
    await emitConversationPreviewUpdate(makePrisma(['part-peer']), makeIo(emissions), CONV_ID, ACTOR_ID);

    const toPeer = previewFor(emissions, PEER_ID);
    expect(toPeer).toHaveLength(1);
    expect(toPeer[0]!.payload.lastMessageId).toBe(REPLY_ID);
    expect(toPeer[0]!.payload.lastMessagePreview).toBe('');
    expect(toPeer[0]!.payload.lastMessageExpiresAt).toBe(CONSUMED.toISOString());
    expect(JSON.stringify(toPeer[0]!.payload)).not.toContain('je réponds');

    const toActor = previewFor(emissions, ACTOR_ID);
    expect(toActor).toHaveLength(1);
    expect(toActor[0]!.payload.lastMessagePreview).toBe('je réponds, édité');
  });

  it('personne n’est mort : chacun reçoit le texte de la réponse', async () => {
    const emissions: Emission[] = [];
    await emitConversationPreviewUpdate(makePrisma([]), makeIo(emissions), CONV_ID, ACTOR_ID);
    expect(previewFor(emissions, PEER_ID)[0]!.payload.lastMessagePreview).toBe('je réponds, édité');
  });
});
