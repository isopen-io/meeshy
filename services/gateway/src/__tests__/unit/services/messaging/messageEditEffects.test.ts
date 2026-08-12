/**
 * Les effets DURABLES d'une édition de message.
 *
 * Troisième volet du même défaut que ce cycle ferme sur l'envoi et sur le
 * retrait : quatre transports d'édition écrivent un nouveau contenu (socket
 * `message:edit`, `PUT /conversations/:id/messages/:mid`, `PUT /messages/:id`,
 * `PATCH /messages/:id`) et UN SEUL ajustait `totalWords` / `totalCharacters`.
 * Les trois autres laissaient les compteurs sur les longueurs du texte
 * D'ORIGINE — définitivement, aucun recalcul périodique n'existant pour les
 * rattraper.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockOnMessageEdited = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onMessageEdited: (...a: any[]) => mockOnMessageEdited(...a),
  },
}));

import { applyMessageEditEffects } from '../../../../services/messaging/messageEditEffects';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const SENDER_USER_ID = '507f1f77bcf86cd799439044';

const prisma = {} as any;

function editedMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: SENDER_PARTICIPANT_ID,
    senderUserId: SENDER_USER_ID,
    previousContent: 'trois petits mots',
    content: 'deux mots',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnMessageEdited.mockResolvedValue(undefined);
});

describe('applyMessageEditEffects', () => {
  it('ajuste les compteurs sur l\'écart entre l\'ancien et le nouveau contenu', async () => {
    await applyMessageEditEffects(prisma, editedMessage());

    expect(mockOnMessageEdited).toHaveBeenCalledWith(
      prisma,
      CONVERSATION_ID,
      SENDER_USER_ID,
      'trois petits mots',
      'deux mots'
    );
  });

  it('ajuste la MÊME clé que celle créditée à l\'envoi', async () => {
    await applyMessageEditEffects(prisma, editedMessage({ senderUserId: null }));

    expect(mockOnMessageEdited.mock.calls[0][2]).toBe(SENDER_PARTICIPANT_ID);
  });

  it('traite un contenu absent comme la chaîne vide des deux côtés', async () => {
    // Une édition peut RETIRER la légende d'un message à pièce jointe : le
    // nouveau contenu est alors légitimement vide, et l'écart doit être compté,
    // pas ignoré.
    await applyMessageEditEffects(
      prisma,
      editedMessage({ previousContent: null, content: null })
    );

    expect(mockOnMessageEdited).toHaveBeenCalledWith(
      prisma,
      CONVERSATION_ID,
      SENDER_USER_ID,
      '',
      ''
    );
  });

  it('ne fait jamais échouer l\'édition, déjà committée, si l\'ajustement jette', async () => {
    mockOnMessageEdited.mockRejectedValue(new Error('counters down'));

    await expect(
      applyMessageEditEffects(prisma, editedMessage())
    ).resolves.toBeUndefined();
  });
});
