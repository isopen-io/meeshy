/**
 * Éditer et supprimer un message — ce que le SÉRIALISEUR laisse passer.
 *
 * Les trois transports de mutation de `conversations/messages-advanced.ts`
 * (PUT, PATCH, DELETE) déclaraient un `data` dont AUCUNE clé n'existe dans la
 * charge utile que leur handler compose. fast-json-stringify appliquant
 * `additionalProperties: false` par défaut, les trois répondaient
 * `{"success":true,"data":{}}` :
 *
 * | route | déclaré | envoyé par `sendSuccess` |
 * |---|---|---|
 * | PUT `/…/messages/:messageId`   | `message` | le message LUI-MÊME (`{...updatedMessage, translations, validatedMentions, meta}`) |
 * | PATCH `/…/messages/:messageId` | `message` | idem, sans `meta` |
 * | DELETE `/…/messages/:messageId`| `message` (une STRING) | `{messageId, deleted, meta}` |
 *
 * Le `message` déclaré était une ENVELOPPE que personne n'a jamais posée : les
 * handlers rendent le message à plat sous `data`, pas sous `data.message`.
 * C'est la maladie du § « Une déclaration n'agit que si le schéma décrit la
 * bonne ENVELOPPE » — ici dans le sens destructeur, puisque le bloc `data`
 * DÉCLARE une clé et supprime donc tout le reste.
 *
 * Conséquence produit : une édition réussie ne rendait au client ni le contenu
 * édité, ni `editedAt`, ni les traductions invalidées, ni les mentions
 * revalidées ; une suppression ne rendait même pas `deleted: true`. Seule la
 * diffusion Socket.IO (`broadcastMessageMutation`, qui ne passe PAS par ce
 * sérialiseur) portait la vérité — donc un client sans socket vivant, ou qui
 * réconcilie son optimistic update sur la réponse REST, restait sur l'ancien
 * texte.
 *
 * Ces témoins traversent un VRAI Fastify (`app.inject()`) et assertent sur les
 * VALEURS servies — jamais sur `statusCode`, qui était vert pendant toute la
 * vie du défaut.
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect } from '@jest/globals';
import { messageSchema, conversationStatsSchema } from '@meeshy/shared/types/api-schemas';

const MESSAGE_ID = '671f0c1a2b3c4d5e6f708192';
const CONVERSATION_ID = '671f0c1a2b3c4d5e6f708100';
const SENDER_ID = '671f0c1a2b3c4d5e6f708111';

/** La charge utile EXACTE que composent les deux transports d'édition. */
const editedMessagePayload = () => ({
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: SENDER_ID,
  content: 'le texte après édition',
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: true,
  editedAt: '2026-08-22T10:00:00.000Z',
  createdAt: '2026-08-22T09:00:00.000Z',
  // La forme que produit RÉELLEMENT `transformTranslationsToArray`
  // (`utils/translation-transformer.ts`) — `targetLanguage`/`translatedContent`,
  // et non `language`/`content`. Un double inventé aurait fait passer ce témoin
  // pour de mauvaises raisons.
  translations: [{
    id: `${MESSAGE_ID}-en`,
    messageId: MESSAGE_ID,
    targetLanguage: 'en',
    translatedContent: 'the text after editing',
    translationModel: 'basic',
    confidenceScore: 0.94,
    createdAt: '2026-08-22T10:00:00.000Z',
  }],
  validatedMentions: ['bob'],
  meta: { conversationStats: { totalMessages: 41 } },
});

const serve = async (schema: object, payload: object): Promise<{ app: FastifyInstance; body: any }> => {
  const app = Fastify();
  app.post('/x', { schema: { response: { 200: schema } } }, async () => ({ success: true, data: payload }));
  const res = await app.inject({ method: 'POST', url: '/x' });
  return { app, body: JSON.parse(res.body) };
};

const editResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      ...messageSchema,
      properties: {
        ...messageSchema.properties,
        meta: {
          type: 'object',
          properties: { conversationStats: conversationStatsSchema },
        },
      },
    },
  },
} as const;

const deleteResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        messageId: { type: 'string' },
        deleted: { type: 'boolean' },
        meta: {
          type: 'object',
          properties: { conversationStats: conversationStatsSchema },
        },
      },
    },
  },
} as const;

describe('édition d’un message — la réponse porte le message édité', () => {
  it('sert le contenu édité et son horodatage, pas un objet vide', async () => {
    const { app, body } = await serve(editResponseSchema, editedMessagePayload());

    expect(body.data.id).toBe(MESSAGE_ID);
    expect(body.data.content).toBe('le texte après édition');
    expect(body.data.isEdited).toBe(true);
    expect(body.data.editedAt).toBe('2026-08-22T10:00:00.000Z');
    await app.close();
  });

  it('sert les traductions recalculées et les mentions revalidées', async () => {
    const { app, body } = await serve(editResponseSchema, editedMessagePayload());

    expect(body.data.translations).toHaveLength(1);
    expect(body.data.translations[0].targetLanguage).toBe('en');
    expect(body.data.translations[0].translatedContent).toBe('the text after editing');
    expect(body.data.validatedMentions).toEqual(['bob']);
    await app.close();
  });

  /**
   * `meta` n'appartient pas à `messageSchema` : l'étendre est la seule façon de
   * ne pas perdre les statistiques que le transport PUT calcule déjà.
   */
  it('conserve `meta.conversationStats`, absent de `messageSchema`', async () => {
    const { app, body } = await serve(editResponseSchema, editedMessagePayload());

    expect(body.data.meta.conversationStats.totalMessages).toBe(41);
    await app.close();
  });

  /**
   * Le défaut, nommé : la forme d'AVANT déclarait une enveloppe `message` que
   * le handler n'a jamais posée. Ce témoin montre qu'elle vide tout — il garde
   * la RAISON du correctif, pas son résultat.
   */
  it('l’ancienne forme — un `message` enveloppant — vidait la réponse entière', async () => {
    const legacy = {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object', properties: { message: { type: 'object' } } },
      },
    };

    const { app, body } = await serve(legacy, editedMessagePayload());

    expect(body.data).toEqual({});
    await app.close();
  });
});

describe('suppression d’un message — la réponse porte l’acquittement', () => {
  it('sert `messageId` et `deleted`, que l’ancien schéma supprimait', async () => {
    const { app, body } = await serve(deleteResponseSchema, {
      messageId: MESSAGE_ID,
      deleted: true,
      meta: { conversationStats: { totalMessages: 40 } },
    });

    expect(body.data.messageId).toBe(MESSAGE_ID);
    expect(body.data.deleted).toBe(true);
    expect(body.data.meta.conversationStats.totalMessages).toBe(40);
    await app.close();
  });
});
