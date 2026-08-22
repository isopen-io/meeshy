/**
 * `messageResponseSchema` — l'enveloppe d'une édition de message.
 *
 * Les deux transports REST d'édition (`PUT /conversations/:id/messages/:messageId`
 * et `PATCH /messages/:messageId`) servent `sendSuccess(reply, messageResponse)`,
 * où `messageResponse` EST le message édité : la charge utile est à `data`, pas à
 * `data.message`.
 *
 * Leur schéma de réponse déclarait pourtant un enveloppement `data.message` que
 * AUCUN gestionnaire n'a jamais produit et qu'AUCUN client n'a jamais lu. Comme
 * `fast-json-stringify` applique `additionalProperties: false` par défaut, une
 * clé déclarée mais absente ne laisse pas passer le reste : elle emporte tout.
 * La réponse servie était `{"success":true,"data":{}}` — le message édité,
 * ENTIER, retiré à la sérialisation.
 *
 * Ce que ça coûtait, mesuré chez les clients :
 *
 * - **Android** décode `ApiResponse<ApiMessage>`, dont `id` et `conversationId`
 *   n'ont pas de valeur par défaut. `{}` lève `MissingFieldException`, que
 *   `apiCall` traduit en `Failure(code = "PARSE")`, que `OutboxFlushWorker`
 *   traduit en `TransientFailure` — donc en RÉESSAI. La ligne d'outbox ne
 *   draine jamais : chaque vidange rejoue l'édition, que le serveur applique et
 *   rediffuse en `message:edited` à toute la room. Une édition réussie se
 *   présente comme une panne, indéfiniment.
 * - **Web** (`PUT`) ne lit pas la charge rendue et affiche « Message edited
 *   successfully » — l'édition est bien persistée, la réponse est vide.
 *
 * Ce témoin épingle le contrat au niveau où le défaut vivait : la sortie
 * sérialisée. Un test de route qui mocke `sendSuccess` n'exerce jamais le
 * schéma de réponse et ne voit rien de tout ceci.
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { messageResponseSchema } from '@meeshy/shared/types/api-schemas';

/**
 * La charge RÉELLE des deux gestionnaires : le message édité étalé, plus
 * `conversationId`, `translations` retransformées en tableau et — sur le
 * sibling `PUT` — les mentions revalidées.
 */
function editedMessagePayload(): Record<string, unknown> {
  return {
    success: true,
    data: {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      senderId: '507f1f77bcf86cd799439013',
      content: 'Salut @bob, on se voit demain',
      originalLanguage: 'fr',
      messageType: 'text',
      messageSource: 'user',
      isEdited: true,
      editedAt: '2026-08-22T14:36:00.000Z',
      createdAt: '2026-08-22T14:30:00.000Z',
      updatedAt: '2026-08-22T14:36:00.000Z',
      translations: [],
      validatedMentions: ['bob'],
      attachments: [],
      sender: {
        id: '507f1f77bcf86cd799439013',
        userId: '507f1f77bcf86cd799439014',
        displayName: 'Alice',
        avatar: null,
      },
    },
  };
}

function serialize(payload: unknown): Record<string, any> {
  const stringify = fastJsonStringify(messageResponseSchema as never);
  return JSON.parse(stringify(payload));
}

describe("messageResponseSchema — la charge d'une édition est à `data`, pas à `data.message`", () => {
  it("ne vide pas `data` : l'identité du message édité survit à la sérialisation", () => {
    const out = serialize(editedMessagePayload());

    expect(out.data.id).toBe('507f1f77bcf86cd799439011');
    expect(out.data.conversationId).toBe('507f1f77bcf86cd799439012');
  });

  it("sert le contenu édité — ce que le client a demandé d'écrire", () => {
    const out = serialize(editedMessagePayload());

    expect(out.data.content).toBe('Salut @bob, on se voit demain');
    expect(out.data.isEdited).toBe(true);
    expect(out.data.editedAt).toBe('2026-08-22T14:36:00.000Z');
  });

  it("n'enveloppe PAS la charge sous une clé `message` qu'aucun client ne lit", () => {
    const out = serialize(editedMessagePayload());

    expect(out.data.message).toBeUndefined();
  });

  it('rend les deux champs sans valeur par défaut côté Android — sans eux, la ligne d’outbox réessaie sans fin', () => {
    const out = serialize(editedMessagePayload());

    expect(Object.keys(out.data)).toEqual(expect.arrayContaining(['id', 'conversationId']));
  });

  it("sert l'expéditeur et les traductions — le Prisme lit les deux", () => {
    const out = serialize(editedMessagePayload());

    expect(out.data.sender).toMatchObject({ displayName: 'Alice' });
    expect(out.data.translations).toEqual([]);
  });

  it('sert les mentions revalidées du sibling PUT', () => {
    const out = serialize(editedMessagePayload());

    expect(out.data.validatedMentions).toEqual(['bob']);
  });

  it("garde l'enveloppe elle-même intacte", () => {
    const out = serialize(editedMessagePayload());

    expect(out.success).toBe(true);
  });
});
