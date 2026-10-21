/**
 * Vecteurs inter-plateformes du scellement d'une traduction partagée (#9899).
 *
 * `fixtures/shared-translation/seal.vectors.json` est le CONTRAT : ce fichier le
 * produit en EXÉCUTANT les primitives de `utils/shared-translation-seal.ts`
 * (clé, données associées, JSON canonique) sous un nonce fixé — le module, lui,
 * ne laisse aucun appelant choisir son nonce —, puis vérifie que le module ouvre
 * chaque cas et n'ouvre aucun refus. `SharedTranslationSealVectorTests.swift`
 * (MeeshySDK) le rejoue avec CryptoKit — il ouvre chaque `payload`, rescelle
 * `innerJson` avec le même nonce et doit retrouver le même `payload` octet pour
 * octet, et n'ouvre aucun des `rejections`. Sur divergence, c'est le TS qui a
 * raison.
 *
 * Régénération voulue : `UPDATE_SHARED_TRANSLATION_VECTORS=1 npx vitest run __tests__/vectors/shared-translation.vectors.test.ts`.
 *
 * @see packages/shared/utils/shared-translation-seal.ts
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SharedTranslationEnvelope, SharedTranslationInner, SharedTranslationKdf } from '../../types/shared-translation.js';
import {
  canonicalSharedTranslationInner,
  deriveSharedTranslationKey,
  fromBase64,
  openSharedTranslation,
  sharedTranslationAad,
  sharedTranslationSourceDigest,
  toBase64,
  type SharedTranslationBinding,
  type SharedTranslationKeySource,
} from '../../utils/shared-translation-seal.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'shared-translation', 'seal.vectors.json');

const CONVERSATION = '64f0c0ffee0000000000c0de';
const NONCE = toBase64(Uint8Array.from({ length: 12 }, (_, index) => index));
const SECRET = toBase64(Uint8Array.from({ length: 32 }, (_, index) => index + 1));

type CaseInput = {
  readonly kdf: SharedTranslationKdf;
  readonly conversationId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly sourceContent: string;
  readonly secret: string | null;
  readonly nonce: string;
  readonly inner: SharedTranslationInner;
};

type CaseExpected = {
  readonly sourceDigest: string;
  readonly key: string;
  readonly aad: string;
  readonly innerJson: string;
  readonly payload: string;
};

type Rejection = {
  readonly _label: string;
  readonly open: Omit<CaseInput, 'nonce' | 'inner'> & { readonly envelope: SharedTranslationEnvelope };
};

type VectorFile = {
  readonly cases: readonly { readonly _label: string; readonly input: CaseInput; readonly expected: CaseExpected }[];
  readonly rejections: readonly Rejection[];
};

const plan = (
  label: string,
  input: Omit<CaseInput, 'conversationId' | 'nonce' | 'secret'> & { readonly secret?: string },
): { readonly label: string; readonly input: CaseInput } => ({
  label,
  input: { ...input, conversationId: CONVERSATION, nonce: NONCE, secret: input.secret ?? null },
});

const PLAN = [
  plan('anglais vers français, clé tirée du texte du message', {
    kdf: 'message-content',
    messageId: '64f0c0ffee0000000000a001',
    targetLanguage: 'fr',
    sourceContent: 'Hello, how are you today?',
    inner: { v: 1, text: "Bonjour, comment vas-tu aujourd'hui ?", sourceLanguage: 'en', engine: 'apple-translation' },
  }),
  plan('français décomposé (NFD) vers arabe : l’empreinte se calcule en NFC', {
    kdf: 'message-content',
    messageId: '64f0c0ffee0000000000a002',
    targetLanguage: 'ar',
    sourceContent: 'Le café est prêt',
    inner: { v: 1, text: 'القهوة جاهزة', sourceLanguage: 'fr', engine: 'opus-mt' },
  }),
  plan('espagnol vers anglais : émoji, guillemets, retour à la ligne', {
    kdf: 'message-content',
    messageId: '64f0c0ffee0000000000a003',
    targetLanguage: 'en',
    sourceContent: '¡Hola! 👋\n"Nos vemos" mañana',
    inner: { v: 1, text: 'Hi! 👋\n"See you" tomorrow', sourceLanguage: 'es', engine: 'chrome-translator' },
  }),
  plan('allemand vers italien, clé tirée du secret du message (E2EE)', {
    kdf: 'message-secret',
    messageId: '64f0c0ffee0000000000a004',
    targetLanguage: 'it',
    sourceContent: 'Guten Morgen, bis später!',
    secret: SECRET,
    inner: { v: 1, text: 'Buongiorno, a dopo!', sourceLanguage: 'de', engine: 'apple-translation' },
  }),
  plan('portugais vers espagnol', {
    kdf: 'message-content',
    messageId: '64f0c0ffee0000000000a005',
    targetLanguage: 'es',
    sourceContent: 'Obrigado pela ajuda!',
    inner: { v: 1, text: '¡Gracias por la ayuda!', sourceLanguage: 'pt', engine: 'nllb-200-distilled-600M' },
  }),
] as const;

const bindingOf = (input: Pick<CaseInput, 'conversationId' | 'messageId' | 'targetLanguage' | 'sourceContent'>): SharedTranslationBinding => ({
  conversationId: input.conversationId,
  messageId: input.messageId,
  targetLanguage: input.targetLanguage,
  sourceContent: input.sourceContent,
});

const keyOf = (input: Pick<CaseInput, 'kdf' | 'secret'>): SharedTranslationKeySource =>
  input.kdf === 'message-secret' ? { kdf: 'message-secret', secret: fromBase64(input.secret ?? '') } : { kdf: 'message-content' };

const encoder = new TextEncoder();

/** Le scellement du module, recomposé sous un nonce fixé : base64(nonce ‖ AES-256-GCM(clé, données associées, JSON canonique)). */
const sealedUnderFixedNonce = async (params: { readonly key: Uint8Array<ArrayBuffer>; readonly aad: string; readonly innerJson: string; readonly nonce: Uint8Array<ArrayBuffer> }): Promise<string> => {
  const aesKey = await globalThis.crypto.subtle.importKey('raw', params.key, 'AES-GCM', false, ['encrypt']);
  const sealed = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: params.nonce, additionalData: encoder.encode(params.aad), tagLength: 128 },
    aesKey,
    encoder.encode(params.innerJson),
  );
  return toBase64(Uint8Array.from([...params.nonce, ...new Uint8Array(sealed)]));
};

const evaluate = async (input: CaseInput): Promise<CaseExpected> => {
  const binding = bindingOf(input);
  const sourceDigest = await sharedTranslationSourceDigest(input.sourceContent);
  const key = await deriveSharedTranslationKey(binding, keyOf(input));
  const aad = sharedTranslationAad(binding, input.kdf, sourceDigest);
  const innerJson = canonicalSharedTranslationInner(input.inner);
  return {
    sourceDigest,
    key: toBase64(key),
    aad,
    innerJson,
    payload: await sealedUnderFixedNonce({ key, aad, innerJson, nonce: fromBase64(input.nonce) }),
  };
};

const tampered = (payload: string): string => {
  const bytes = fromBase64(payload);
  const last = bytes.length - 1;
  return toBase64(bytes.map((byte, index) => (index === last ? byte ^ 0x01 : byte)));
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Les mêmes octets sous un remplissage aux bits non nuls : un décodeur indulgent les lirait. */
const dirtyPadding = (payload: string): string => {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  if (padding === 0) throw new Error('le cas de référence se termine par un remplissage');
  const at = payload.length - padding - 1;
  return `${payload.slice(0, at)}${BASE64_ALPHABET.charAt(BASE64_ALPHABET.indexOf(payload.charAt(at)) + 1)}${payload.slice(at + 1)}`;
};

const rejectionsOf = (cases: VectorFile['cases']): readonly Rejection[] => {
  const [first, , , secretCase] = cases;
  if (first === undefined || secretCase === undefined) throw new Error('le plan porte au moins quatre cas');
  const opening = (input: CaseInput, payload: string) => ({
    kdf: input.kdf,
    conversationId: input.conversationId,
    messageId: input.messageId,
    targetLanguage: input.targetLanguage,
    sourceContent: input.sourceContent,
    secret: input.secret,
    envelope: { v: 1 as const, alg: 'A256GCM' as const, kdf: input.kdf, payload },
  });
  const base = opening(first.input, first.expected.payload);
  const secretBase = opening(secretCase.input, secretCase.expected.payload);
  return [
    { _label: 'une autre langue cible', open: { ...base, targetLanguage: 'es' } },
    { _label: 'le message a été modifié depuis', open: { ...base, sourceContent: 'Hello, how are you tonight?' } },
    { _label: 'un autre message', open: { ...base, messageId: '64f0c0ffee0000000000a009' } },
    { _label: 'une autre conversation', open: { ...base, conversationId: '64f0c0ffee0000000000c0df' } },
    { _label: 'une enveloppe altérée', open: { ...base, envelope: { ...base.envelope, payload: tampered(base.envelope.payload) } } },
    {
      _label: 'une dérivation annoncée autre que celle du scellement',
      open: { ...base, kdf: 'message-secret', secret: SECRET, envelope: { ...base.envelope, kdf: 'message-secret' } },
    },
    { _label: 'un autre secret', open: { ...secretBase, secret: toBase64(Uint8Array.from({ length: 32 }, () => 7)) } },
    { _label: 'un base64 aux bits de remplissage non nuls', open: { ...base, envelope: { ...base.envelope, payload: dirtyPadding(base.envelope.payload) } } },
    { _label: 'un base64 sans son remplissage', open: { ...base, envelope: { ...base.envelope, payload: base.envelope.payload.replace(/=+$/, '') } } },
    {
      _label: 'un base64 coupé d’un retour à la ligne',
      open: { ...base, envelope: { ...base.envelope, payload: `${base.envelope.payload.slice(0, 64)}\n${base.envelope.payload.slice(64)}` } },
    },
  ];
};

const render = async (): Promise<string> => {
  const cases = await Promise.all(PLAN.map(async (entry) => ({ _label: entry.label, input: entry.input, expected: await evaluate(entry.input) })));
  return `${JSON.stringify({ cases, rejections: rejectionsOf(cases) }, null, 2)}\n`;
};

if (process.env.UPDATE_SHARED_TRANSLATION_VECTORS === '1') {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, await render());
}

const loaded = (): VectorFile => JSON.parse(readFileSync(FILE, 'utf-8')) as VectorFile;

describe('seal.vectors.json — le scellement partagé par le web et iOS', () => {
  it('porte ses cas et ses refus — jamais de vert silencieux', () => {
    expect(loaded().cases.length).toBeGreaterThanOrEqual(5);
    expect(loaded().rejections.length).toBeGreaterThanOrEqual(10);
  });

  it('est exactement ce que le module produit', async () => {
    expect(loaded()).toEqual(JSON.parse(await render()));
  });

  it('chaque cas s’ouvre et rend la traduction scellée', async () => {
    for (const vector of loaded().cases) {
      const envelope: SharedTranslationEnvelope = { v: 1, alg: 'A256GCM', kdf: vector.input.kdf, payload: vector.expected.payload };
      expect(await openSharedTranslation({ binding: bindingOf(vector.input), key: keyOf(vector.input), envelope }), vector._label).toEqual(vector.input.inner);
    }
  });

  it('aucun refus ne s’ouvre', async () => {
    for (const rejection of loaded().rejections) {
      expect(await openSharedTranslation({ binding: bindingOf(rejection.open), key: keyOf(rejection.open), envelope: rejection.open.envelope }), rejection._label).toBeNull();
    }
  });
});
