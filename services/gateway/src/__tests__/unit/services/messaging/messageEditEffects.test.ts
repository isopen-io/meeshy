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

const mockReproduce = jest.fn<any>().mockResolvedValue(1);
jest.mock('../../../../services/messaging/reproduceEditedMessageNotifications', () => ({
  reproduceEditedMessageNotifications: (...a: any[]) => mockReproduce(...a),
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

/**
 * Le SECOND effet durable d'une édition, et le seul des deux dont le retard se
 * VOIT : les notifications que le message a produites portent une copie
 * dénormalisée de son texte, qu'aucune lecture ne rafraîchit. Tant que la
 * reproduction n'a pas eu lieu, l'inbox de tous les destinataires affiche le
 * texte d'AVANT — y compris quand l'édition existait précisément pour retirer
 * ce qui n'aurait pas dû être écrit.
 *
 * Le poser ICI et non dans les quatre transports est le même arbitrage que
 * pour les compteurs, et pour la même raison mesurée : c'est la divergence
 * entre transports qui avait laissé trois d'entre eux sans ajustement.
 */
describe('applyMessageEditEffects — reproduction des notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnMessageEdited.mockResolvedValue(undefined);
    mockReproduce.mockResolvedValue(1);
  });

  it('reproduit les notifications sur le contenu PERSISTÉ', async () => {
    await applyMessageEditEffects(prisma, editedMessage({ content: 'nouveau texte' }) as any, undefined);

    expect(mockReproduce).toHaveBeenCalledWith(
      prisma,
      { messageId: MESSAGE_ID, content: 'nouveau texte' },
      undefined,
    );
  });

  /**
   * Les deux effets sont INDÉPENDANTS : un ajustement de compteurs récalcitrant
   * ne doit pas priver les destinataires de leur rafraîchissement. C'est ce que
   * ferait une liste d'effets qui s'arrêterait au premier échec.
   */
  it('reproduit même quand l’ajustement des compteurs échoue', async () => {
    mockOnMessageEdited.mockRejectedValue(new Error('stats down'));

    await applyMessageEditEffects(prisma, editedMessage({ content: 'nouveau texte' }) as any, undefined);

    expect(mockReproduce).toHaveBeenCalled();
  });

  /**
   * BEST-EFFORT : le nouveau contenu est DÉJÀ committé quand ceci s'exécute.
   * Une reproduction qui rejette ne doit jamais transformer une édition réussie
   * en 500.
   */
  it('n’échoue pas quand la reproduction rejette', async () => {
    mockReproduce.mockRejectedValue(new Error('mongo down'));

    await expect(
      applyMessageEditEffects(prisma, editedMessage({ content: 'nouveau texte' }) as any, undefined),
    ).resolves.toBeUndefined();
  });
});
