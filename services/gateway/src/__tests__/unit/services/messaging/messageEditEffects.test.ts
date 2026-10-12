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
import {
  ORIGINAL_SOURCE_VERSION,
  sharedTranslationRow,
  sharedTranslationTable,
} from '../../../helpers/shared-translation-table';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const OTHER_MESSAGE_ID = '507f1f77bcf86cd799439055';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const SENDER_USER_ID = '507f1f77bcf86cd799439044';
const EDITED_AT = new Date('2026-10-10T12:00:00.000Z');

const prisma = {} as any;

function editedMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: SENDER_PARTICIPANT_ID,
    senderUserId: SENDER_USER_ID,
    previousContent: 'trois petits mots',
    content: 'deux mots',
    editedAt: EDITED_AT,
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

/**
 * Le TROISIÈME effet durable d'une édition : les traductions PARTAGÉES des
 * versions qu'elle périme (#9899, audit C4).
 *
 * Une traduction partagée est la version scellée du texte tel qu'il était à un
 * instant (`sourceVersion` = `editedAt`, ou `original`). L'édition périme toutes
 * les versions d'avant — leur texte n'est plus celui que le message porte — et
 * elles restaient pourtant en base : le texte que l'édition existait peut-être
 * pour retirer demeurait lisible, pour qui détenait la clé.
 *
 * Le double de la table APPLIQUE le `where` : ces témoins lisent les lignes qui
 * RESTENT. Épargner la version que l'édition vient d'écrire en est la moitié
 * qu'une clause trop large casserait en silence.
 */
describe('applyMessageEditEffects — traductions partagées', () => {
  const EARLIER_EDIT = '2026-10-09T08:30:00.000Z';
  const NEW_VERSION = EDITED_AT.toISOString();
  const prismaWith = (table: ReturnType<typeof sharedTranslationTable>) =>
    ({ sharedTranslation: table.delegate }) as any;

  beforeEach(() => {
    mockReproduce.mockResolvedValue(1);
  });

  it("efface les versions PÉRIMÉES par l'édition — l'originale comme les éditions précédentes", async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'originale', messageId: MESSAGE_ID, sourceVersion: ORIGINAL_SOURCE_VERSION }),
      sharedTranslationRow({ id: 'édition-précédente', messageId: MESSAGE_ID, sourceVersion: EARLIER_EDIT }),
    ]);

    await applyMessageEditEffects(prismaWith(table), editedMessage());

    expect(table.remainingIds()).toEqual([]);
  });

  it("épargne la version que l'édition vient d'écrire — dans toutes ses langues", async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'périmée', messageId: MESSAGE_ID, sourceVersion: ORIGINAL_SOURCE_VERSION }),
      sharedTranslationRow({ id: 'courante-fr', messageId: MESSAGE_ID, targetLanguage: 'fr', sourceVersion: NEW_VERSION }),
      sharedTranslationRow({ id: 'courante-en', messageId: MESSAGE_ID, targetLanguage: 'en', sourceVersion: NEW_VERSION }),
    ]);

    await applyMessageEditEffects(prismaWith(table), editedMessage());

    expect(table.remainingIds()).toEqual(['courante-fr', 'courante-en']);
  });

  it("ne touche à aucune traduction partagée d'un AUTRE message, quelle que soit sa version", async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'voisine-originale', messageId: OTHER_MESSAGE_ID }),
      sharedTranslationRow({ id: 'voisine-éditée', messageId: OTHER_MESSAGE_ID, sourceVersion: EARLIER_EDIT }),
    ]);

    await applyMessageEditEffects(prismaWith(table), editedMessage());

    expect(table.remainingIds()).toEqual(['voisine-originale', 'voisine-éditée']);
  });

  it("lit la version courante dans la date que l'écrivain vient de poser, à la milliseconde", async () => {
    // `sourceVersion` est `editedAt.toISOString()` : une version écrite avec
    // une milliseconde de différence n'est PAS la version courante.
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'courante', messageId: MESSAGE_ID, sourceVersion: '2026-10-10T12:00:00.000Z' }),
      sharedTranslationRow({ id: 'une-milliseconde-plus-tôt', messageId: MESSAGE_ID, sourceVersion: '2026-10-10T11:59:59.999Z' }),
    ]);

    await applyMessageEditEffects(prismaWith(table), editedMessage({ editedAt: new Date('2026-10-10T12:00:00.000Z') }));

    expect(table.remainingIds()).toEqual(['courante']);
  });

  it("efface TOUTES les versions quand la date d'édition ne se lit pas — jamais l'originale par défaut", async () => {
    // Fail-closed. `sharedTranslationSourceVersion(undefined)` rend `original`,
    // exactement la version que toute édition périme : passer la date telle
    // quelle épargnerait les lignes du texte d'AVANT.
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'originale', messageId: MESSAGE_ID, sourceVersion: ORIGINAL_SOURCE_VERSION }),
      sharedTranslationRow({ id: 'éditée', messageId: MESSAGE_ID, sourceVersion: EARLIER_EDIT }),
    ]);

    await applyMessageEditEffects(prismaWith(table), editedMessage({ editedAt: undefined }));
    expect(table.remainingIds()).toEqual([]);

    const second = sharedTranslationTable([
      sharedTranslationRow({ id: 'originale', messageId: MESSAGE_ID, sourceVersion: ORIGINAL_SOURCE_VERSION }),
    ]);
    await applyMessageEditEffects(prismaWith(second), editedMessage({ editedAt: new Date('pas une date') }));
    expect(second.remainingIds()).toEqual([]);
  });

  it("ne fait jamais échouer l'édition, déjà committée, quand la table voisine ne répond pas", async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ id: 'reste', messageId: MESSAGE_ID })]);
    table.deleteMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(applyMessageEditEffects(prismaWith(table), editedMessage())).resolves.toBeUndefined();
    expect(table.remainingIds()).toEqual(['reste']);
  });

  it("ajuste quand même les compteurs et reproduit les notifications quand l'effacement échoue", async () => {
    const table = sharedTranslationTable();
    table.deleteMany.mockRejectedValueOnce(new Error('mongo down'));

    await applyMessageEditEffects(prismaWith(table), editedMessage());

    expect(mockOnMessageEdited).toHaveBeenCalledTimes(1);
    expect(mockReproduce).toHaveBeenCalledTimes(1);
  });

  it("efface quand même les versions périmées quand les compteurs et les notifications échouent", async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ messageId: MESSAGE_ID })]);
    mockOnMessageEdited.mockRejectedValue(new Error('counters down'));
    mockReproduce.mockRejectedValue(new Error('mongo down'));

    await applyMessageEditEffects(prismaWith(table), editedMessage());

    expect(table.remainingIds()).toEqual([]);
  });
});
