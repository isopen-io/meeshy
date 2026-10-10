/**
 * SCELLER ET OUVRIR UNE TRADUCTION PARTAGÉE — sur l'appareil, jamais ailleurs (#9899).
 *
 * Le contrat est dans `types/shared-translation.ts`. Ce module en est la moitié
 * TypeScript (web, coque Android) ; `SharedTranslationSeal` (MeeshySDK) en est
 * le miroir iOS. `fixtures/shared-translation/seal.vectors.json`, produit en
 * EXÉCUTANT ce module, les tient ensemble : sur divergence, c'est ce module qui
 * a raison.
 *
 * - clé : HKDF-SHA256, sel `meeshy-shared-translation/v1`, info
 *   `<kdf>|<conversationId>|<messageId>|<targetLanguage>`, 32 octets ; matière
 *   = le texte original en NFC (`message-content`) ou le secret du message
 *   (`message-secret`) ;
 * - scellement : AES-256-GCM, nonce aléatoire de 12 octets, tag de 16 ;
 *   `payload` = base64(nonce ‖ chiffré ‖ tag) — la forme `combined` de CryptoKit ;
 * - données associées : `meeshy-shared-translation/v1|<kdf>|<conversationId>|<messageId>|<targetLanguage>|<sha256 hex du texte original en NFC>`.
 *   Elles lient l'enveloppe à UN message, UNE langue et UN état du texte : la
 *   traduction d'un message depuis modifié ne s'ouvre plus, et l'empreinte ne
 *   voyage jamais (le serveur pourrait la comparer à des messages devinés).
 *
 * Ouvrir ne lève jamais : toute enveloppe illisible, altérée, d'une autre
 * langue ou d'un autre état du texte rend `null`, et l'appareil garde ce qu'il
 * avait.
 */

import {
  SHARED_TRANSLATION_ALGORITHM,
  SHARED_TRANSLATION_LIMITS,
  SHARED_TRANSLATION_PROTOCOL,
  sharedTranslationInnerSchema,
  type SharedTranslationEnvelope,
  type SharedTranslationInner,
  type SharedTranslationKdf,
} from '../types/shared-translation.js';

/** Ce qui lie une enveloppe à un message, une langue et un état du texte source. */
export type SharedTranslationBinding = {
  readonly conversationId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  /** Le texte original du message tel que l'appareil le lit — déchiffré s'il l'était. */
  readonly sourceContent: string;
};

export type SharedTranslationKeySource =
  | { readonly kdf: 'message-content' }
  | { readonly kdf: 'message-secret'; readonly secret: Uint8Array };

const encoder = new TextEncoder();

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(text));

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

const BASE64_CHUNK = 0x8000;

export const toBase64 = (bytes: Uint8Array): string =>
  btoa(
    Array.from({ length: Math.ceil(bytes.length / BASE64_CHUNK) }, (_, index) =>
      String.fromCharCode(...bytes.subarray(index * BASE64_CHUNK, (index + 1) * BASE64_CHUNK)),
    ).join(''),
  );

export const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export const sharedTranslationSourceDigest = async (sourceContent: string): Promise<string> =>
  hex(await subtle().digest('SHA-256', bytesOf(sourceContent.normalize('NFC'))));

export const sharedTranslationAad = (binding: SharedTranslationBinding, kdf: SharedTranslationKdf, sourceDigest: string): string =>
  [SHARED_TRANSLATION_PROTOCOL, kdf, binding.conversationId, binding.messageId, binding.targetLanguage, sourceDigest].join('|');

/** Les clés dans l'ordre alphabétique, sans espace : le miroir iOS encode à l'identique (`.sortedKeys`). */
export const canonicalSharedTranslationInner = (inner: SharedTranslationInner): string =>
  JSON.stringify({ engine: inner.engine, sourceLanguage: inner.sourceLanguage, text: inner.text, v: 1 });

const keyMaterial = (binding: SharedTranslationBinding, source: SharedTranslationKeySource): Uint8Array<ArrayBuffer> => {
  if (source.kdf === 'message-secret') {
    if (source.secret.length !== SHARED_TRANSLATION_LIMITS.secretLength) throw new Error('le secret du message fait 32 octets');
    return new Uint8Array(source.secret);
  }
  if (binding.sourceContent === '') throw new Error('un message sans texte ne se traduit pas');
  return bytesOf(binding.sourceContent.normalize('NFC'));
};

export async function deriveSharedTranslationKey(
  binding: SharedTranslationBinding,
  source: SharedTranslationKeySource,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await subtle().importKey('raw', keyMaterial(binding, source), 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: bytesOf(SHARED_TRANSLATION_PROTOCOL),
      info: bytesOf([source.kdf, binding.conversationId, binding.messageId, binding.targetLanguage].join('|')),
    },
    material,
    256,
  );
  return new Uint8Array(bits);
}

const aesKey = async (binding: SharedTranslationBinding, source: SharedTranslationKeySource, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> =>
  subtle().importKey('raw', await deriveSharedTranslationKey(binding, source), 'AES-GCM', false, [usage]);

/**
 * Scelle une traduction. `nonce` n'est fixé que par les vecteurs : en usage,
 * il est tiré au hasard. Lève si la traduction dépasse ce que la passerelle
 * accepte — l'appareil ne partage pas alors, et garde sa traduction.
 */
export async function sealSharedTranslation(params: {
  readonly binding: SharedTranslationBinding;
  readonly key: SharedTranslationKeySource;
  readonly inner: SharedTranslationInner;
  readonly nonce?: Uint8Array;
}): Promise<SharedTranslationEnvelope> {
  const { binding, key, inner } = params;
  const nonce = new Uint8Array(params.nonce ?? globalThis.crypto.getRandomValues(new Uint8Array(SHARED_TRANSLATION_LIMITS.nonceLength)));
  if (nonce.length !== SHARED_TRANSLATION_LIMITS.nonceLength) throw new Error('le nonce fait 12 octets');
  const plaintext = sharedTranslationInnerSchema.parse(inner);
  const aad = sharedTranslationAad(binding, key.kdf, await sharedTranslationSourceDigest(binding.sourceContent));
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: bytesOf(aad), tagLength: SHARED_TRANSLATION_LIMITS.tagLength * 8 },
    await aesKey(binding, key, 'encrypt'),
    bytesOf(canonicalSharedTranslationInner(plaintext)),
  );
  const combined = new Uint8Array(nonce.length + sealed.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(sealed), nonce.length);
  const payload = toBase64(combined);
  if (payload.length > SHARED_TRANSLATION_LIMITS.payloadMaxLength) throw new Error('traduction trop longue pour être partagée');
  return { v: 1, alg: SHARED_TRANSLATION_ALGORITHM, kdf: key.kdf, payload };
}

const decryptedInner = async (params: {
  readonly binding: SharedTranslationBinding;
  readonly key: SharedTranslationKeySource;
  readonly envelope: SharedTranslationEnvelope;
}): Promise<SharedTranslationInner | null> => {
  const { binding, key, envelope } = params;
  const combined = fromBase64(envelope.payload);
  const { nonceLength, tagLength } = SHARED_TRANSLATION_LIMITS;
  if (combined.length < nonceLength + tagLength) return null;
  const aad = sharedTranslationAad(binding, key.kdf, await sharedTranslationSourceDigest(binding.sourceContent));
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: combined.subarray(0, nonceLength), additionalData: bytesOf(aad), tagLength: tagLength * 8 },
    await aesKey(binding, key, 'decrypt'),
    combined.subarray(nonceLength),
  );
  const parsed = sharedTranslationInnerSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)));
  return parsed.success ? parsed.data : null;
};

/** Ouvre une enveloppe ; `null` pour tout ce qui ne s'ouvre pas — jamais d'exception. */
export async function openSharedTranslation(params: {
  readonly binding: SharedTranslationBinding;
  readonly key: SharedTranslationKeySource;
  readonly envelope: SharedTranslationEnvelope;
}): Promise<SharedTranslationInner | null> {
  if (params.envelope.v !== 1 || params.envelope.alg !== SHARED_TRANSLATION_ALGORITHM || params.envelope.kdf !== params.key.kdf) return null;
  try {
    return await decryptedInner(params);
  } catch {
    return null;
  }
}
