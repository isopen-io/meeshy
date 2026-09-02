/**
 * Sticker de message (#4823) — validation d'entrée, relecture et hoist.
 *
 * Miroir de `sharedPlace.test.ts` : la même doctrine (« le client n'envoie
 * JAMAIS de `metadata` brut ») vaut pour le sticker, et les mêmes trois
 * fonctions la portent. Les bornes sont testées UNE par UNE parce que la
 * première qui tombe nomme la règle perdue.
 */
import { parseMessageSticker, stickerFromMetadata, hoistStickerOnto } from '../messageSticker';
import { MESSAGE_STICKER_ANIMATIONS } from '@meeshy/shared/types/message-sticker';

describe('parseMessageSticker', () => {
  it('accepte une décoration complète', () => {
    expect(parseMessageSticker({
      templateId: 'love.heart-01',
      slots: { title: ' Bravo ', name: 'Alice' },
      animation: 'heartbeat',
    })).toEqual({
      templateId: 'love.heart-01',
      slots: { title: 'Bravo', name: 'Alice' },
      animation: 'heartbeat',
    });
  });

  it('accepte un emoji seul', () => {
    expect(parseMessageSticker({ emoji: ' 🎉 ' })).toEqual({ emoji: '🎉' });
  });

  it('rend null sans gabarit ni emoji', () => {
    expect(parseMessageSticker({ slots: { a: 'b' }, animation: 'pulse' })).toBeNull();
    expect(parseMessageSticker({ templateId: '   ', emoji: '' })).toBeNull();
    expect(parseMessageSticker({})).toBeNull();
    expect(parseMessageSticker(null)).toBeNull();
    expect(parseMessageSticker([])).toBeNull();
    expect(parseMessageSticker('🎉')).toBeNull();
  });

  it('rejette un templateId hors forme ou trop long', () => {
    expect(parseMessageSticker({ templateId: '.leading-dot' })).toBeNull();
    expect(parseMessageSticker({ templateId: 'has space' })).toBeNull();
    expect(parseMessageSticker({ templateId: 'a'.repeat(65) })).toBeNull();
    expect(parseMessageSticker({ templateId: 42 })).toBeNull();
  });

  it('rejette un emoji trop long ou non-chaîne', () => {
    expect(parseMessageSticker({ emoji: 'x'.repeat(17) })).toBeNull();
    expect(parseMessageSticker({ emoji: 42 })).toBeNull();
  });

  it('rejette trop de slots, une clé hors forme ou une valeur trop longue', () => {
    const tooMany = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`s${i}`, 'v']));
    expect(parseMessageSticker({ templateId: 't', slots: tooMany })).toBeNull();
    expect(parseMessageSticker({ templateId: 't', slots: { 'Bad-Key': 'v' } })).toBeNull();
    expect(parseMessageSticker({ templateId: 't', slots: { ok: 'x'.repeat(201) } })).toBeNull();
    expect(parseMessageSticker({ templateId: 't', slots: { ok: 42 } })).toBeNull();
    expect(parseMessageSticker({ templateId: 't', slots: ['a'] })).toBeNull();
  });

  it('omet des slots vides plutôt que de servir un objet vide', () => {
    expect(parseMessageSticker({ templateId: 't', slots: {} })).toEqual({ templateId: 't' });
    expect(parseMessageSticker({ templateId: 't', slots: { a: '   ' } })).toEqual({ templateId: 't' });
  });

  it('accepte les onze animations et rejette toute autre', () => {
    for (const animation of MESSAGE_STICKER_ANIMATIONS) {
      expect(parseMessageSticker({ emoji: '🎉', animation })).toEqual({ emoji: '🎉', animation });
    }
    expect(parseMessageSticker({ emoji: '🎉', animation: 'explode' })).toBeNull();
    expect(parseMessageSticker({ emoji: '🎉', animation: 7 })).toBeNull();
  });

  it('ignore tout champ inconnu — copie blanchie, jamais un spread', () => {
    const forged = {
      templateId: 't',
      postReplyTo: { id: 'volé' },
      trackingLinks: [{ url: 'x' }],
      __proto__: { polluted: true },
    };
    const parsed = parseMessageSticker(forged);
    expect(parsed).toEqual({ templateId: 't' });
    expect(Object.keys(parsed as object)).toEqual(['templateId']);
  });
});

describe('stickerFromMetadata', () => {
  it('extrait le bloc sticker', () => {
    expect(stickerFromMetadata({ sticker: { emoji: '🔥', animation: 'pulse' } }))
      .toEqual({ emoji: '🔥', animation: 'pulse' });
  });

  it('rend null quand le bloc est absent ou invalide', () => {
    expect(stickerFromMetadata({})).toBeNull();
    expect(stickerFromMetadata(null)).toBeNull();
    expect(stickerFromMetadata(undefined)).toBeNull();
    expect(stickerFromMetadata([])).toBeNull();
    expect(stickerFromMetadata({ sticker: { animation: 'pulse' } })).toBeNull();
  });
});

describe('hoistStickerOnto', () => {
  it('hisse metadata.sticker en champ racine sans muter l’entité', () => {
    const entity = { id: 'm1', metadata: { sticker: { emoji: '🔥' }, other: 1 } };
    const hoisted = hoistStickerOnto(entity);
    expect(hoisted.sticker).toEqual({ emoji: '🔥' });
    expect(hoisted.metadata).toEqual(entity.metadata);
    expect('sticker' in entity).toBe(false);
  });

  it('ne pose PAS la clé quand le sticker est absent', () => {
    const entity = { id: 'm1', metadata: { location: { latitude: 1, longitude: 2 } } };
    const hoisted = hoistStickerOnto(entity);
    expect('sticker' in hoisted).toBe(false);
    expect(hoisted).toBe(entity);
    const bare = { id: 'm2' };
    expect('sticker' in hoistStickerOnto(bare)).toBe(false);
  });
});
