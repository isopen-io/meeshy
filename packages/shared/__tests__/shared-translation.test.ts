import { describe, expect, it } from 'vitest';

import {
  SHARED_TRANSLATION_LIMITS,
  acceptedSharedTranslationKdfs,
  shareTranslationBodyJsonSchema,
  shareTranslationBodySchema,
  sharedTranslationEnvelopeSchema,
  sharedTranslationsQuerySchema,
  type SharedTranslationInner,
} from '../types/shared-translation.js';
import { SERVER_EVENTS } from '../types/socketio-events.js';
import {
  fromBase64,
  openSharedTranslation,
  sealSharedTranslation,
  toBase64,
  type SharedTranslationBinding,
  type SharedTranslationKeySource,
} from '../utils/shared-translation-seal.js';

const bindingOf = (overrides: Partial<SharedTranslationBinding> = {}): SharedTranslationBinding => ({
  conversationId: '64f0c0ffee0000000000c0de',
  messageId: '64f0c0ffee0000000000a001',
  targetLanguage: 'fr',
  sourceContent: 'See you at the station at noon.',
  ...overrides,
});

const innerOf = (overrides: Partial<SharedTranslationInner> = {}): SharedTranslationInner => ({
  v: 1,
  text: 'On se retrouve à la gare à midi.',
  sourceLanguage: 'en',
  engine: 'apple-translation',
  ...overrides,
});

const CONTENT_KEY: SharedTranslationKeySource = { kdf: 'message-content' };
const secretKey = (fill = 9): SharedTranslationKeySource => ({ kdf: 'message-secret', secret: new Uint8Array(32).fill(fill) });

describe('une traduction partagée se scelle sur un appareil et s’ouvre sur un autre', () => {
  it('rend la traduction à qui lit le même message', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope })).toEqual(innerOf());
  });

  it('rend la traduction à qui détient le secret du message', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: secretKey(), inner: innerOf() });

    expect(await openSharedTranslation({ binding: bindingOf(), key: secretKey(), envelope })).toEqual(innerOf());
  });

  it('ne laisse rien lire au serveur : ni la traduction, ni la langue source, ni le moteur', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });
    const wire = JSON.stringify(envelope);

    expect(wire).not.toContain('gare');
    expect(wire).not.toContain('apple-translation');
    expect(wire).not.toContain('"en"');
    expect(Object.keys(envelope).sort()).toEqual(['alg', 'kdf', 'payload', 'v']);
  });

  it('tire un nonce neuf à chaque scellement', async () => {
    const first = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });
    const second = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    expect(first.payload).not.toBe(second.payload);
  });

  it('s’ouvre quand le texte source arrive décomposé (NFD) : l’empreinte se prend en NFC', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf({ sourceContent: 'Le café est prêt' }), key: CONTENT_KEY, inner: innerOf() });

    expect(await openSharedTranslation({ binding: bindingOf({ sourceContent: 'Le café est prêt' }), key: CONTENT_KEY, envelope })).toEqual(innerOf());
  });

  it.each([
    ['une autre langue cible', { targetLanguage: 'es' }],
    ['un autre message', { messageId: '64f0c0ffee0000000000a002' }],
    ['une autre conversation', { conversationId: '64f0c0ffee0000000000c0df' }],
    ['un message modifié depuis', { sourceContent: 'See you at the station at one.' }],
  ] as const)('ne s’ouvre pas pour %s', async (_label, overrides) => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    expect(await openSharedTranslation({ binding: bindingOf(overrides), key: CONTENT_KEY, envelope })).toBeNull();
  });

  it('ne s’ouvre pas avec un autre secret, ni sous une autre dérivation', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: secretKey(9), inner: innerOf() });

    expect(await openSharedTranslation({ binding: bindingOf(), key: secretKey(8), envelope })).toBeNull();
    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope })).toBeNull();
    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope: { ...envelope, kdf: 'message-content' } })).toBeNull();
  });

  it('rend null, sans lever, sur une enveloppe altérée, tronquée ou illisible', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });
    const bytes = fromBase64(envelope.payload);
    const flipped = toBase64(bytes.map((byte, index) => (index === 20 ? byte ^ 0xff : byte)));

    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope: { ...envelope, payload: flipped } })).toBeNull();
    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope: { ...envelope, payload: toBase64(bytes.subarray(0, 20)) } })).toBeNull();
    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope: { ...envelope, payload: '%%%' } })).toBeNull();
  });

  it('refuse de sceller sans texte source, avec un secret mal formé, ou une traduction vide', async () => {
    await expect(sealSharedTranslation({ binding: bindingOf({ sourceContent: '' }), key: CONTENT_KEY, inner: innerOf() })).rejects.toThrow();
    await expect(sealSharedTranslation({ binding: bindingOf(), key: { kdf: 'message-secret', secret: new Uint8Array(16) }, inner: innerOf() })).rejects.toThrow();
    await expect(sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text: '' }) })).rejects.toThrow();
  });

  it('refuse de sceller ce que la passerelle refuserait de garder', async () => {
    const text = '👋'.repeat(SHARED_TRANSLATION_LIMITS.textMaxLength / 2);

    await expect(sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text }) })).resolves.toMatchObject({ v: 1 });
    await expect(sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text: `${text}!` }) })).rejects.toThrow();
  });
});

describe('ce que la passerelle accepte', () => {
  it('n’accepte que le secret du message quand le message est chiffré de bout en bout', () => {
    expect(acceptedSharedTranslationKdfs({ conversationEncryptionMode: 'e2ee', messageEncryptionMode: null })).toEqual(['message-secret']);
    expect(acceptedSharedTranslationKdfs({ conversationEncryptionMode: null, messageEncryptionMode: 'e2ee' })).toEqual(['message-secret']);
  });

  it('accepte les deux dérivations là où le serveur lit déjà le message', () => {
    for (const mode of [null, undefined, 'server', 'hybrid']) {
      expect(acceptedSharedTranslationKdfs({ conversationEncryptionMode: mode, messageEncryptionMode: mode })).toEqual(['message-content', 'message-secret']);
    }
  });

  it('valide une enveloppe et refuse ce qui n’en est pas une', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    expect(sharedTranslationEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, v: 2 }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, alg: 'none' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, kdf: 'plaintext' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, payload: 'pas du base64 !' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, payload: 'AAAA' }).success).toBe(false);
  });

  it('valide le corps du partage', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    expect(shareTranslationBodySchema.safeParse({ messageId: '64f0c0ffee0000000000a001', targetLanguage: 'fr', envelope }).success).toBe(true);
    expect(shareTranslationBodySchema.safeParse({ messageId: 'nope', targetLanguage: 'fr', envelope }).success).toBe(false);
    expect(shareTranslationBodySchema.safeParse({ messageId: '64f0c0ffee0000000000a001', targetLanguage: 'français', envelope }).success).toBe(false);
  });

  it('lit une liste de messages et de langues séparés par des virgules, dédoublonnée et bornée', () => {
    const ids = Array.from({ length: 3 }, (_, index) => `64f0c0ffee0000000000a00${index}`);

    expect(sharedTranslationsQuerySchema.parse({ messageIds: `${ids.join(',')},${ids[0]}`, languages: 'fr, en' })).toEqual({ messageIds: ids, languages: ['fr', 'en'] });
    expect(sharedTranslationsQuerySchema.parse({ messageIds: ids[0] })).toEqual({ messageIds: [ids[0]] });
    expect(sharedTranslationsQuerySchema.safeParse({ messageIds: '' }).success).toBe(false);
    expect(
      sharedTranslationsQuerySchema.safeParse({ messageIds: Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(24, '0')).join(',') }).success,
    ).toBe(false);
  });

  it('décrit à Fastify les mêmes bornes que le schéma Zod', () => {
    const payload = shareTranslationBodyJsonSchema.properties.envelope.properties.payload;

    expect(payload.minLength).toBe(SHARED_TRANSLATION_LIMITS.payloadMinLength);
    expect(payload.maxLength).toBe(SHARED_TRANSLATION_LIMITS.payloadMaxLength);
    expect(shareTranslationBodyJsonSchema.properties.envelope.properties.kdf.enum).toEqual(['message-content', 'message-secret']);
  });

  it('relaie la traduction partagée sous son propre nom, distinct de la traduction du serveur', () => {
    expect(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED).toBe('message:translation-shared');
    expect(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED).not.toBe(SERVER_EVENTS.MESSAGE_TRANSLATION);
  });
});
