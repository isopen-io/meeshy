/**
 * `sticker` (#4823) ↔ `messageSchema` — contrat de SÉRIALISATION.
 *
 * Les témoins de route mockent `sendSuccess` : le schéma de réponse n'y est
 * jamais exercé, et fast-json-stringify strippe en silence tout champ absent
 * des `properties`. Un `sticker` hissé par toutes les routes et déclaré nulle
 * part n'atteindrait aucun client — exactement le défaut que `metadata` a
 * payé avant lui (cf. `message-schema-metadata-serialization.test.ts`).
 *
 * Et `slots` est une CARTE : déclarée sans `additionalProperties`, elle
 * sortirait `{}` — un gabarit sans ses textes, sans qu'aucun témoin rougisse.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { messageSchema, messageStickerResponseSchema } from '@meeshy/shared/types/api-schemas';
import { MESSAGE_STICKER_ANIMATIONS } from '@meeshy/shared/types/message-sticker';

const STICKER = {
  templateId: 'love.heart',
  slots: { caption: 'Toi', name: 'Alice' },
  animation: 'heartbeat',
  emoji: '❤️',
};

function stickerMessage(sticker: unknown): Record<string, unknown> {
  return {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439012',
    senderId: 'user-alice',
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
    metadata: { sticker },
    createdAt: '2026-09-02T10:00:00.000Z',
    translations: [],
    ...(sticker ? { sticker } : {}),
  };
}

function serialize(payload: unknown): Record<string, any> {
  const stringify = fastJsonStringify(messageSchema as never);
  return JSON.parse(stringify(payload));
}

describe('messageSchema — sérialisation REST du sticker', () => {
  it('sert le sticker ENTIER — gabarit, slots (carte), animation, emoji', () => {
    const out = serialize(stickerMessage(STICKER));

    expect(out.sticker).toEqual(STICKER);
  });

  it('un message sans sticker n’en fabrique pas', () => {
    const out = serialize(stickerMessage(undefined));

    expect('sticker' in out).toBe(false);
  });

  it('le schéma partagé déclare les onze animations depuis la source UNIQUE', () => {
    // Deux listes finiraient par diverger ; celle du schéma est dérivée.
    expect(messageStickerResponseSchema.properties.animation.enum).toEqual([...MESSAGE_STICKER_ANIMATIONS]);
    expect(MESSAGE_STICKER_ANIMATIONS).toHaveLength(11);
  });
});
