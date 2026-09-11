import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { bodyKindOf, emojiOnlyOf, mapsUrlOf, placeOf, stickerOf, storyCitationOf } from './message-body';

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-bruno',
    content: '',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    ...partial,
  }) as Message;

describe('emojiOnlyOf — 90 / 60 / 45, jamais au-delà de trois', () => {
  test('un seul emoji ⇒ {count:1, fontSize:90}', () => {
    expect(emojiOnlyOf({ content: '👍', attachmentCount: 0, hasPlace: false })).toEqual({ count: 1, fontSize: 90 });
  });

  test('un graphème à modificateur compte UN : "👍🏽❤️" ⇒ 2/60', () => {
    expect(emojiOnlyOf({ content: '👍🏽❤️', attachmentCount: 0, hasPlace: false })).toEqual({ count: 2, fontSize: 60 });
  });

  test('trois emoji ⇒ 3/45', () => {
    expect(emojiOnlyOf({ content: '🎉🎉🎉', attachmentCount: 0, hasPlace: false })).toEqual({ count: 3, fontSize: 45 });
  });

  test('quatre emoji ⇒ null', () => {
    expect(emojiOnlyOf({ content: '🎉🎉🎉🎉', attachmentCount: 0, hasPlace: false })).toBeNull();
  });

  test('« ok 👍 » (du texte mêlé) ⇒ null', () => {
    expect(emojiOnlyOf({ content: 'ok 👍', attachmentCount: 0, hasPlace: false })).toBeNull();
  });

  test('les espaces autour sont retirés : " 👍 " ⇒ 1', () => {
    expect(emojiOnlyOf({ content: ' 👍 ', attachmentCount: 0, hasPlace: false })).toEqual({ count: 1, fontSize: 90 });
  });

  test('une chaîne vide ⇒ null', () => {
    expect(emojiOnlyOf({ content: '', attachmentCount: 0, hasPlace: false })).toBeNull();
  });

  test('avec une pièce jointe ⇒ null', () => {
    expect(emojiOnlyOf({ content: '👍', attachmentCount: 1, hasPlace: false })).toBeNull();
  });

  test('avec un lieu ⇒ null', () => {
    expect(emojiOnlyOf({ content: '👍', attachmentCount: 0, hasPlace: true })).toBeNull();
  });
});

describe('stickerOf — lit metadata.sticker comme la passerelle', () => {
  test('{emoji:"🔥"} ⇒ {emoji:"🔥"}', () => {
    expect(stickerOf(message({ metadata: { sticker: { emoji: '🔥' } } }))).toEqual({ emoji: '🔥' });
  });

  test('{templateId, slots, animation:"pop"} ⇒ conservé', () => {
    expect(
      stickerOf(message({ metadata: { sticker: { templateId: 'since', slots: { date: '12 mai' }, animation: 'pop' } } })),
    ).toEqual({ templateId: 'since', slots: { date: '12 mai' }, animation: 'pop' });
  });

  test('animation:"fly" (hors MESSAGE_STICKER_ANIMATIONS) ⇒ null', () => {
    expect(stickerOf(message({ metadata: { sticker: { emoji: '🔥', animation: 'fly' } } }))).toBeNull();
  });

  test('{} ⇒ null', () => {
    expect(stickerOf(message({ metadata: { sticker: {} } }))).toBeNull();
  });

  test('metadata absent ⇒ null', () => {
    expect(stickerOf(message())).toBeNull();
  });
});

describe('bodyKindOf — sticker avant emoji avant texte', () => {
  test('sticker + content emoji ⇒ sticker (le repli servi à la place de la chose)', () => {
    expect(bodyKindOf(message({ content: '🔥', metadata: { sticker: { emoji: '🔥' } } })).kind).toBe('sticker');
  });

  test('emoji seul sans replyTo ⇒ emoji-only', () => {
    expect(bodyKindOf(message({ content: '👍' })).kind).toBe('emoji-only');
  });

  test('emoji seul AVEC replyTo ⇒ text (FocalRow.swift:612)', () => {
    expect(bodyKindOf(message({ content: '👍', replyTo: message({ id: 'q1' }) })).kind).toBe('text');
  });

  test('sinon text', () => {
    expect(bodyKindOf(message({ content: 'Bonjour' })).kind).toBe('text');
  });
});

describe('placeOf — coordonnées valides, textes bornés', () => {
  test('un lieu valide se lit', () => {
    expect(
      placeOf(message({ metadata: { location: { latitude: 48.85, longitude: 2.35, name: 'Tour Eiffel', address: 'Champ de Mars' } } })),
    ).toEqual({ latitude: 48.85, longitude: 2.35, name: 'Tour Eiffel', address: 'Champ de Mars' });
  });

  test('latitude 91 ⇒ null', () => {
    expect(placeOf(message({ metadata: { location: { latitude: 91, longitude: 2.35 } } }))).toBeNull();
  });

  test('un nom de 300 caractères est tronqué à 200', () => {
    const longName = 'x'.repeat(300);
    const place = placeOf(message({ metadata: { location: { latitude: 48.85, longitude: 2.35, name: longName } } }));
    expect(place?.name).toHaveLength(200);
  });

  test('mapsUrlOf compose le lien Plans', () => {
    expect(mapsUrlOf({ latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null })).toBe(
      'https://maps.apple.com/?ll=48.85840,2.29450&q=Tour%20Eiffel',
    );
  });
});

describe('storyCitationOf — la carte subsiste, le geste non', () => {
  test('une story citée se lit', () => {
    const citation = storyCitationOf(
      message({
        storyReplyToId: 'p1',
        metadata: { postReplyTo: { id: 'p1', type: 'STORY', moodEmoji: null, previewText: 'Coucher de soleil', thumbnailUrl: null, createdAt: '2026-09-10T08:00:00.000Z' } },
      }),
    );
    expect(citation).toEqual({ id: 'p1', previewText: 'Coucher de soleil', thumbnailUrl: null, createdAt: '2026-09-10T08:00:00.000Z' });
  });

  test('une humeur (moodEmoji non nul) ⇒ null — pas de scène', () => {
    const citation = storyCitationOf(
      message({ storyReplyToId: 'p1', metadata: { postReplyTo: { id: 'p1', type: 'STATUS', moodEmoji: '😊', previewText: '', thumbnailUrl: null, createdAt: '' } } }),
    );
    expect(citation).toBeNull();
  });

  test('sans storyReplyToId ⇒ null', () => {
    expect(storyCitationOf(message())).toBeNull();
  });

  test('id vide ⇒ la carte se rend quand même', () => {
    const citation = storyCitationOf(
      message({ storyReplyToId: 'p1', metadata: { postReplyTo: { id: '', type: 'STORY', moodEmoji: null, previewText: '', thumbnailUrl: null, createdAt: '' } } }),
    );
    expect(citation).not.toBeNull();
    expect(citation?.id).toBe('');
  });
});

/**
 * REVUE-CORRECTION #5936 — LE CHAMP HISSÉ DU FIL. La charge `message:new`
 * (`services/gateway/src/socketio/messageNewPayload.ts:140-190`) ne porte
 * AUCUN `metadata` ; elle porte `sticker` à la RACINE (`:184`). Une loi qui
 * ne lit que `metadata` rend donc ces états inertes en TEMPS RÉEL — un
 * sticker retomberait sur `emojiOnlyOf` et se peindrait en gros emoji.
 *
 * `metadata` n'est pas des DONNÉES ici mais la FORME d'une charge non typée :
 * les objets sont construits tels que le fil les sert, sans `Partial<Message>`
 * qui déclarerait ces trois clés (le type partagé ne les porte pas encore).
 */
describe('les champs HISSÉS à la racine priment sur metadata', () => {
  const wire = (partial: Record<string, unknown>): Message => ({ ...message(), ...partial }) as Message;

  test('sticker servi À LA RACINE, sans aucun metadata (charge message:new)', () => {
    expect(stickerOf(wire({ content: '🔥', sticker: { emoji: '🔥', animation: 'pop' } }))).toEqual({
      animation: 'pop',
      emoji: '🔥',
    });
  });

  test('un sticker hissé fait rendre un STICKER, jamais un gros emoji', () => {
    const body = bodyKindOf(wire({ content: '🔥', sticker: { emoji: '🔥' } }));
    expect(body.kind).toBe('sticker');
  });

  test('location servie à la racine (REST, messages-list.ts:670-677)', () => {
    expect(placeOf(wire({ location: { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null } }))).toEqual({
      latitude: 48.8584,
      longitude: 2.2945,
      name: 'Tour Eiffel',
      address: null,
    });
  });

  test('postReplyTo servi à la racine', () => {
    const citation = storyCitationOf(
      wire({
        storyReplyToId: 'p1',
        postReplyTo: { id: 'p1', type: 'STORY', moodEmoji: null, previewText: 'Scène', thumbnailUrl: null, createdAt: '' },
      }),
    );
    expect(citation?.previewText).toBe('Scène');
  });

  test('la RACINE prime sur metadata quand les deux sont servis', () => {
    expect(stickerOf(wire({ sticker: { emoji: '🔥' }, metadata: { sticker: { emoji: '🎉' } } }))?.emoji).toBe('🔥');
  });

  test('`sticker: null` (la passerelle sert null quand il n’y en a pas) retombe sur metadata, jamais sur un sticker vide', () => {
    expect(stickerOf(wire({ sticker: null, metadata: { sticker: { emoji: '🎉' } } }))?.emoji).toBe('🎉');
    expect(stickerOf(wire({ sticker: null }))).toBeNull();
  });
});
