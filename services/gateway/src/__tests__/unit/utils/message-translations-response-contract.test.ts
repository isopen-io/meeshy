/**
 * Contrat entre `Message.translations` et le schéma de réponse `messageSchema`.
 *
 * Ce témoin existe parce que le compilateur ne peut PAS le tenir. Le type
 * partagé annonce `translations?: readonly MessageTranslation[]`
 * (`packages/shared/types/message-types.ts:211`) alors que la valeur qui sort
 * de Prisma est une CARTE Mongo (`Message.translations Json?`). Les deux formes
 * circulent réellement sous le même nom : une route qui recopie le résultat
 * Prisma tel quel type-checke parfaitement et produit néanmoins une réponse
 * invalide.
 *
 * Et l'échec n'est pas une dégradation partielle. `messageSchema` déclare
 * `translations: { type: 'array' }` et `fast-json-stringify` — le sérialiseur
 * de Fastify — ne coerce pas : il JETTE, donc la route entière répond 500.
 * C'est ce qui est arrivé à `GET /conversations/:id/pinned-messages` (cycle 67),
 * dont les quatre témoins de route posaient tous `translations: null`, le seul
 * cas qui ne déclenche pas le défaut.
 *
 * La règle épinglée ici : **ce qu'une route pose dans `translations` doit être
 * ce que `transformTranslationsToArray` produit — jamais la carte.**
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

import { transformTranslationsToArray } from '../../../utils/translation-transformer';

const MESSAGE_ID = '507f1f77bcf86cd799439011';

/** La forme d'enveloppe qu'utilisent les routes de liste (`sendSuccess`). */
const serialize = fastJson({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: messageSchema as Record<string, unknown> },
  },
} as never);

const envelope = (translations: unknown) => ({
  success: true,
  data: [
    {
      id: MESSAGE_ID,
      conversationId: '507f1f77bcf86cd799439022',
      senderId: '507f1f77bcf86cd799439033',
      content: 'Hello',
      originalLanguage: 'en',
      messageType: 'text',
      translations,
    },
  ],
});

const mongoMap = {
  fr: {
    text: 'Bonjour',
    translationModel: 'medium' as const,
    createdAt: new Date('2026-08-11T00:00:00Z'),
  },
};

describe('contrat `translations` ↔ messageSchema', () => {
  it('la carte Mongo brute fait ÉCHOUER la sérialisation de la réponse entière', () => {
    expect(() => serialize(envelope(mongoMap))).toThrow();
  });

  it('la sortie de transformTranslationsToArray se sérialise', () => {
    const apiForm = transformTranslationsToArray(MESSAGE_ID, mongoMap);

    const body = JSON.parse(serialize(envelope(apiForm)));

    expect(body.data[0].translations).toEqual([
      expect.objectContaining({
        id: `${MESSAGE_ID}-fr`,
        messageId: MESSAGE_ID,
        targetLanguage: 'fr',
        translatedContent: 'Bonjour',
      }),
    ]);
  });

  it('une colonne nulle traverse le transformateur en tableau vide', () => {
    const body = JSON.parse(serialize(envelope(transformTranslationsToArray(MESSAGE_ID, null))));

    expect(body.data[0].translations).toEqual([]);
  });
});
