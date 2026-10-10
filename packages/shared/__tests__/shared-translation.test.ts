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
  SHARED_TRANSLATION_ORIGINAL_SOURCE,
  sharedTranslationServerReadsMessage,
  sharedTranslationSourceVersion,
} from '../utils/shared-translation-eligibility.js';
import {
  deriveSharedTranslationKey,
  fromBase64,
  openSharedTranslation,
  sealSharedTranslation,
  sharedTranslationAad,
  sharedTranslationSourceDigest,
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

  it('ne laisse aucun appelant imposer son nonce : un nonce fixé ne se pose que dans les vecteurs', async () => {
    const forced = { binding: bindingOf(), key: CONTENT_KEY, inner: innerOf(), nonce: new Uint8Array(12) } as Parameters<typeof sealSharedTranslation>[0];
    const first = await sealSharedTranslation(forced);
    const second = await sealSharedTranslation(forced);

    expect(first.payload).not.toBe(second.payload);
    expect(fromBase64(first.payload).subarray(0, 12)).not.toEqual(new Uint8Array(12));
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

  it('scelle sous la borne de l’enveloppe la plus longue traduction admise, quelle que soit l’écriture', async () => {
    const text = '中'.repeat(SHARED_TRANSLATION_LIMITS.textMaxLength);
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text }) });

    expect(envelope.payload.length).toBeLessThanOrEqual(SHARED_TRANSLATION_LIMITS.payloadMaxLength);
    expect(sharedTranslationEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it.each([
    ['une conversation qui n’est pas un identifiant', { conversationId: '64f0c0ffee0000000000c0de|x' }],
    ['un message qui n’est pas un identifiant', { messageId: 'a001' }],
    ['une langue qui n’en est pas une', { targetLanguage: 'fr|es' }],
  ] as const)('ne scelle ni n’ouvre pour %s : les champs liés ne peuvent pas se confondre', async (_label, overrides) => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    await expect(sealSharedTranslation({ binding: bindingOf(overrides), key: CONTENT_KEY, inner: innerOf() })).rejects.toThrow();
    expect(await openSharedTranslation({ binding: bindingOf(overrides), key: CONTENT_KEY, envelope })).toBeNull();
  });

  it('ne scelle pas un texte mal formé, qu’un autre appareil lirait autrement', async () => {
    await expect(sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text: 'avant \ud800 après' }) })).rejects.toThrow();
    await expect(sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ engine: '\udc00' }) })).rejects.toThrow();
    await expect(sealSharedTranslation({ binding: bindingOf({ sourceContent: 'demi \ud83d' }), key: CONTENT_KEY, inner: innerOf() })).rejects.toThrow();
    await expect(sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text: 'Salut 👋' }) })).resolves.toMatchObject({ v: 1 });
  });

  it('n’ouvre pas une enveloppe dont le texte scellé est mal formé', async () => {
    const binding = bindingOf();
    const key = await globalThis.crypto.subtle.importKey('raw', await deriveSharedTranslationKey(binding, CONTENT_KEY), 'AES-GCM', false, ['encrypt']);
    const aad = sharedTranslationAad(binding, 'message-content', await sharedTranslationSourceDigest(binding.sourceContent));
    const nonce = new Uint8Array(12).fill(3);
    const json = '{"engine":"x","sourceLanguage":"en","text":"\\ud800","v":1}';
    const sealed = new Uint8Array(
      await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode(json)),
    );
    const payload = toBase64(Uint8Array.from([...nonce, ...sealed]));

    expect(await openSharedTranslation({ binding, key: CONTENT_KEY, envelope: { v: 1, alg: 'A256GCM', kdf: 'message-content', payload } })).toBeNull();
  });

  it('n’ouvre qu’un base64 canonique : la même enveloppe autrement écrite ne s’ouvre pas', async () => {
    const envelope = await paddedEnvelope();
    const variants = nonCanonicalVariantsOf(envelope.payload);

    expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope })).toEqual(innerOf({ text: envelope.text }));
    expect(variants.length).toBeGreaterThanOrEqual(3);
    for (const payload of variants) {
      expect(await openSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, envelope: { ...envelope, payload } }), payload.slice(-6)).toBeNull();
    }
  });
});

/** Une enveloppe dont le base64 se termine par `==` : c'est là que des bits de remplissage peuvent se glisser. */
async function paddedEnvelope() {
  for (const text of ['Salut', 'Salut !', 'Salut !!']) {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf({ text }) });
    if (envelope.payload.endsWith('==')) return { ...envelope, text };
  }
  throw new Error('aucune longueur ne produit un remplissage double');
}

/** Ce que `atob` lit comme les mêmes octets : bits de remplissage non nuls, remplissage absent, blanc glissé. */
function nonCanonicalVariantsOf(payload: string): readonly string[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const body = payload.slice(0, -3);
  const last = payload.charAt(payload.length - 3);
  const dirtied = alphabet.charAt(alphabet.indexOf(last) + 1);
  return [`${body}${dirtied}==`, payload.slice(0, -2), `${payload.slice(0, 8)}\n${payload.slice(8)}`, ` ${payload}`];
}

describe('ce que la passerelle accepte', () => {
  const readable = (conversationEncryptionMode: string | null | undefined, messageIsEncrypted: boolean | null | undefined, messageEncryptionMode: string | null | undefined) =>
    sharedTranslationServerReadsMessage({ conversationEncryptionMode, messageIsEncrypted, messageEncryptionMode });

  it.each([
    ['un message en clair', null, false, null],
    ['un message en clair, conversation chiffrée par le serveur', 'server', false, null],
    ['un message chiffré par le serveur', null, true, 'server'],
    ['un message chiffré en mode hybride', 'hybrid', true, 'hybrid'],
    ['des modes écrits autrement', ' Server ', true, 'HYBRID'],
  ] as const)('le serveur lit déjà %s', (_label, conversation, encrypted, mode) => {
    expect(readable(conversation, encrypted, mode)).toBe(true);
  });

  it.each([
    ['une conversation chiffrée de bout en bout', 'e2ee', false, null],
    ['une conversation chiffrée de bout en bout, écrite autrement', ' E2EE ', false, null],
    ['un message chiffré de bout en bout', null, true, 'e2ee'],
    ['un message de bout en bout envoyé en clair', null, false, 'e2ee'],
    ['un message chiffré sans mode', null, true, null],
    ['un message chiffré sous un mode inconnu', null, true, 'x'],
    ['un message en clair sous un mode inconnu', null, false, 'x'],
    ['une conversation sous un mode inconnu', 'x', false, null],
  ] as const)('le serveur ne lit pas %s : rien de ce qu’on y partage ne s’appuie sur son texte', (_label, conversation, encrypted, mode) => {
    expect(readable(conversation, encrypted, mode)).toBe(false);
    expect(acceptedSharedTranslationKdfs({ conversationEncryptionMode: conversation, messageIsEncrypted: encrypted, messageEncryptionMode: mode })).toEqual([]);
  });

  it('n’accepte que le texte du message là où le serveur le lit déjà — le secret du message n’est pas encore transporté (#9959)', () => {
    for (const mode of [null, undefined, 'server', 'hybrid']) {
      expect(acceptedSharedTranslationKdfs({ conversationEncryptionMode: mode, messageIsEncrypted: mode !== null && mode !== undefined, messageEncryptionMode: mode })).toEqual([
        'message-content',
      ]);
    }
  });

  it('date la version du texte source à la milliseconde, ou la dit originale', () => {
    expect(sharedTranslationSourceVersion(null)).toBe(SHARED_TRANSLATION_ORIGINAL_SOURCE);
    expect(sharedTranslationSourceVersion(undefined)).toBe('original');
    expect(sharedTranslationSourceVersion(new Date('2026-10-10T08:15:30.123Z'))).toBe('2026-10-10T08:15:30.123Z');
    expect(sharedTranslationSourceVersion('2026-10-10T10:15:30.1+02:00')).toBe('2026-10-10T08:15:30.100Z');
    expect(sharedTranslationSourceVersion('pas une date')).toBeNull();
  });

  it('valide une enveloppe et refuse ce qui n’en est pas une', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });

    expect(sharedTranslationEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, v: 2 }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, alg: 'none' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, kdf: 'plaintext' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, payload: 'pas du base64 !' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, payload: 'AAAA' }).success).toBe(false);
    expect(sharedTranslationEnvelopeSchema.safeParse({ ...envelope, payload: 'A'.repeat(SHARED_TRANSLATION_LIMITS.payloadMaxLength + 4) }).success).toBe(false);
  });

  it('ne garde qu’un base64 canonique, et le dit à Fastify dans les mêmes termes', async () => {
    const envelope = await paddedEnvelope();
    const pattern = new RegExp(shareTranslationBodyJsonSchema.properties.envelope.properties.payload.pattern);

    expect(pattern.test(envelope.payload)).toBe(true);
    for (const payload of nonCanonicalVariantsOf(envelope.payload)) {
      expect(sharedTranslationEnvelopeSchema.safeParse({ v: 1, alg: 'A256GCM', kdf: 'message-content', payload }).success, payload.slice(-6)).toBe(false);
      expect(pattern.test(payload), payload.slice(-6)).toBe(false);
    }
  });

  it('valide le corps du partage', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });
    const body = { messageId: '64f0c0ffee0000000000a001', targetLanguage: 'fr', sourceVersion: 'original', envelope };

    expect(shareTranslationBodySchema.safeParse(body).success).toBe(true);
    expect(shareTranslationBodySchema.safeParse({ ...body, messageId: 'nope' }).success).toBe(false);
    expect(shareTranslationBodySchema.safeParse({ ...body, targetLanguage: 'français' }).success).toBe(false);
  });

  it('exige la version du texte source que l’appareil a traduite', async () => {
    const envelope = await sealSharedTranslation({ binding: bindingOf(), key: CONTENT_KEY, inner: innerOf() });
    const body = { messageId: '64f0c0ffee0000000000a001', targetLanguage: 'fr', envelope };
    const pattern = new RegExp(shareTranslationBodyJsonSchema.properties.sourceVersion.pattern);

    expect(shareTranslationBodySchema.safeParse(body).success).toBe(false);
    expect(shareTranslationBodyJsonSchema.required).toContain('sourceVersion');
    for (const sourceVersion of ['original', '2026-10-10T08:15:30.123Z']) {
      expect(shareTranslationBodySchema.safeParse({ ...body, sourceVersion }).success, sourceVersion).toBe(true);
      expect(pattern.test(sourceVersion), sourceVersion).toBe(true);
    }
    for (const sourceVersion of ['edited', '2026-10-10T08:15:30Z', '2026-10-10T10:15:30.123+02:00', '', ' original']) {
      expect(shareTranslationBodySchema.safeParse({ ...body, sourceVersion }).success, sourceVersion).toBe(false);
      expect(pattern.test(sourceVersion), sourceVersion).toBe(false);
    }
  });

  it('lit une liste de messages et de langues séparés par des virgules, dédoublonnée et bornée', () => {
    const ids = Array.from({ length: 3 }, (_, index) => `64f0c0ffee0000000000a00${index}`);

    expect(sharedTranslationsQuerySchema.parse({ messageIds: `${ids.join(',')},${ids[0]}`, languages: 'fr, en' })).toEqual({ messageIds: ids, languages: ['fr', 'en'] });
    expect(sharedTranslationsQuerySchema.safeParse({ messageIds: '', languages: 'fr' }).success).toBe(false);
    expect(
      sharedTranslationsQuerySchema.safeParse({
        messageIds: Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(24, '0')).join(','),
        languages: 'fr',
      }).success,
    ).toBe(false);
  });

  it('exige les langues du lecteur : une lecture sans langue rendrait toutes celles qu’on a partagées', () => {
    const id = '64f0c0ffee0000000000a001';

    expect(sharedTranslationsQuerySchema.safeParse({ messageIds: id }).success).toBe(false);
    expect(sharedTranslationsQuerySchema.safeParse({ messageIds: id, languages: ' , ' }).success).toBe(false);
    expect(sharedTranslationsQuerySchema.safeParse({ messageIds: id, languages: 'fr,en,es,de,it,pt,ar,ja,ko' }).success).toBe(false);
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
