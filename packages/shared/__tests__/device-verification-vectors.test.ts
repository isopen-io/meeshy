// packages/shared/__tests__/device-verification-vectors.test.ts
//
// #19154 (#18906) — la référence TypeScript de la COMPARAISON d'un appareil par code court
// rejoue les vecteurs communs (`fixtures/e2ee-device-verification/sas-v1.vectors.json`),
// RFC 5869 A.1 et A.3 D'ABORD, par WebCrypto seul. Spécification
// `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 4 et § 8.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACK_SQUARE,
  ackDecimal,
  ackEmojiIndexes,
  ackFromSymbols,
  byteStream,
  canonicalBase64,
  CODE_SQUARE,
  codeDecimals,
  codeEmojiIndexes,
  codeFromSymbols,
  commitmentOf,
  deriveVerification,
  descriptorProblem,
  DeviceVerificationUnavailableError,
  hkdfSha256,
  opensCommitment,
  readVerificationMessage,
  renderSymbols,
  SAS_EMOJI_TABLE,
  squareOptions,
  toBase64,
  type DeviceDescriptor,
} from '../encryption/device-verification/index.js';
import { deviceDescriptorSchema, deviceVerificationMessageSchema } from '../types/e2ee-device-trust.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/e2ee-device-verification/', import.meta.url));

type Ack = { bytesHex: string; emojiIndexes: number[]; emoji: string[]; emojiNames: Record<string, string[]>; decimal: number };
type Expected = {
  initiatorDescriptorHex: string;
  responderDescriptorHex: string;
  commitment: string;
  transcriptSha256Hex: string;
  hkdfOutputHex: string;
  sasBytesHex: string;
  emojiIndexes: number[];
  emoji: string[];
  emojiNames: Record<string, string[]>;
  decimal: number[];
  ack: Ack;
};
type Input = { tx: string; initiator: DeviceDescriptor; responder: DeviceDescriptor; initiatorNonce: string; responderNonce: string };
type Vector = { name: string; input: Input; expected: Expected; wire: { request: unknown; accept: unknown; reveal: unknown } };
type Negative = {
  name: string;
  outcome: string;
  input: Record<string, unknown> & Partial<Input>;
  expected: Record<string, unknown>;
};
type Displayed = { indexes: number[]; emoji: string[]; names: Record<string, string[]>; decimal: number[] | number };
type OptionVector = {
  name: string;
  bit1: number[];
  bit2: number[];
  streamHex: string;
  expected: { alternatives: Record<string, number>; permutation: number; order: number[]; displayed: Displayed[]; correctAt: number; bytesUsed: number };
};
type VectorFile = {
  rfc5869: { name: string; ikm: string; salt: string; info: string; length: number; okm: string }[];
  vectors: Vector[];
  properties: (Vector & { mustDifferFrom: string })[];
  negatives: Negative[];
  options: OptionVector[];
};
type EmojiFile = { emoji: { number: number; emoji: string; names: Record<string, string> }[] };

const vectors: VectorFile = JSON.parse(readFileSync(join(FIXTURES, 'sas-v1.vectors.json'), 'utf8'));
const emojiFile: EmojiFile = JSON.parse(readFileSync(join(FIXTURES, 'sas-emoji-v1.json'), 'utf8'));

const hexOf = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const bytesOfHex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
const b64 = (text: string): Uint8Array => {
  const bytes = canonicalBase64(text);
  if (bytes === null) throw new Error(`base64 non canonique dans un vecteur : ${text}`);
  return bytes;
};
const inputsOf = (input: Input) => ({
  tx: b64(input.tx),
  initiator: input.initiator,
  responder: input.responder,
  initiatorNonce: b64(input.initiatorNonce),
  responderNonce: b64(input.responderNonce),
});

const V1 = vectors.vectors[0] as Vector;
const ACCOUNT = V1.input.initiator.userId;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RFC 5869 d’abord, par WebCrypto (§ 3.3)', () => {
  it.each(vectors.rfc5869.map((vector) => [vector.name, vector] as const))('%s', async (_name, vector) => {
    const okm = await hkdfSha256({ ikm: bytesOfHex(vector.ikm), salt: bytesOfHex(vector.salt), info: bytesOfHex(vector.info), length: vector.length });
    expect(hexOf(okm)).toBe(vector.okm);
  });

  it('A.3 : un sel vide et un sel de 32 octets nuls rendent la même sortie (le sel des quatre plateformes)', async () => {
    const vector = vectors.rfc5869.find((entry) => entry.name === 'rfc5869-A.3');
    if (!vector) throw new Error('A.3 manquant');
    const okm = await hkdfSha256({ ikm: bytesOfHex(vector.ikm), salt: new Uint8Array(32), info: new Uint8Array(0), length: vector.length });
    expect(hexOf(okm)).toBe(vector.okm);
  });
});

describe('les quatre vecteurs nominaux (§ 8)', () => {
  it.each(vectors.vectors.map((vector) => [vector.name, vector] as const))('%s', async (_name, vector) => {
    const out = await deriveVerification(inputsOf(vector.input));
    const { expected } = vector;
    expect(hexOf(out.initiatorDescriptor)).toBe(expected.initiatorDescriptorHex);
    expect(hexOf(out.responderDescriptor)).toBe(expected.responderDescriptorHex);
    expect(toBase64(out.commitment)).toBe(expected.commitment);
    expect(hexOf(out.transcriptSha256)).toBe(expected.transcriptSha256Hex);
    expect(hexOf(out.okm)).toBe(expected.hkdfOutputHex);
    expect(hexOf(out.code)).toBe(expected.sasBytesHex);
    const symbols = renderSymbols(codeEmojiIndexes(out.code));
    expect(symbols.indexes).toEqual(expected.emojiIndexes);
    expect(symbols.emoji).toEqual(expected.emoji);
    expect(symbols.names).toEqual(expected.emojiNames);
    expect(codeDecimals(out.code)).toEqual(expected.decimal);
    const ack = renderSymbols(ackEmojiIndexes(out.ack));
    expect(hexOf(out.ack)).toBe(expected.ack.bytesHex);
    expect(ack.indexes).toEqual(expected.ack.emojiIndexes);
    expect(ack.emoji).toEqual(expected.ack.emoji);
    expect(ack.names).toEqual(expected.ack.emojiNames);
    expect(ackDecimal(out.ack)).toBe(expected.ack.decimal);
  });

  it('les messages tels qu’ils voyagent passent le schéma strict et la validation du répondeur', () => {
    vectors.vectors.forEach((vector) => {
      const { initiator, responder } = vector.input;
      const atResponder = { account: ACCOUNT, self: responder, relayedFrom: initiator };
      const atInitiator = { account: ACCOUNT, self: initiator, relayedFrom: responder };
      expect(deviceVerificationMessageSchema.safeParse(vector.wire.request).success).toBe(true);
      expect(readVerificationMessage(vector.wire.request, atResponder).verdict).toBe('accepted');
      expect(readVerificationMessage(vector.wire.accept, atInitiator).verdict).toBe('accepted');
      expect(readVerificationMessage(vector.wire.reveal, { ...atResponder, peer: initiator }).verdict).toBe('accepted');
    });
  });

  it('un libellé omis s’encode comme la chaîne vide et ne voyage pas', () => {
    const ipad = vectors.vectors.find((vector) => vector.name === 'ipad-sans-libelle-ios-approuve');
    if (!ipad) throw new Error('vecteur iPad manquant');
    expect(ipad.expected.initiatorDescriptorHex.endsWith('00000003696f7300000000')).toBe(true);
    expect('label' in ((ipad.wire.request as { from: object }).from)).toBe(false);
  });

  it('le banc prouve son ROUGE : un octet d’aléa altéré change le code', async () => {
    const inputs = inputsOf(V1.input);
    const nonce = Uint8Array.from(inputs.responderNonce);
    nonce[0] = (nonce[0] ?? 0) ^ 0x01;
    const out = await deriveVerification({ ...inputs, responderNonce: nonce });
    expect(hexOf(out.code)).not.toBe(V1.expected.sasBytesHex);
  });
});

describe('propriétés et négatifs (§ 8)', () => {
  it.each(vectors.properties.map((property) => [property.name, property] as const))('propriété %s : un champ change, le code change', async (_name, property) => {
    const out = await deriveVerification(inputsOf(property.input));
    expect(hexOf(out.code)).toBe(property.expected.sasBytesHex);
    expect(hexOf(out.code)).not.toBe(V1.expected.sasBytesHex);
  });

  const differing = vectors.negatives.filter((negative) => negative.outcome === 'codes-differents');
  it.each(differing.map((negative) => [negative.name, negative] as const))('%s : deux codes différents', async (_name, negative) => {
    const out = await deriveVerification(inputsOf(negative.input as Input));
    expect(hexOf(out.code)).toBe((negative.expected as Expected).sasBytesHex);
    expect(hexOf(out.code)).not.toBe(V1.expected.sasBytesHex);
  });

  it('libelle-altere-dans-request : l’engagement recalculé sur la request reçue ne s’ouvre pas', async () => {
    const negative = vectors.negatives.find((entry) => entry.name === 'libelle-altere-dans-request') as Negative;
    const inputs = inputsOf(negative.input as Input);
    const received = { ...inputs, initiator: negative.input.receivedInitiator as DeviceDescriptor };
    expect(toBase64(await commitmentOf(received))).toBe(negative.expected.recomputedFromReceivedRequest);
    expect(await opensCommitment({ ...received, commitment: b64(negative.expected.commitment as string) })).toBe(false);
  });

  it('revelation-qui-n-ouvre-pas-l-engagement : refusée avant tout code', async () => {
    const negative = vectors.negatives.find((entry) => entry.name === 'revelation-qui-n-ouvre-pas-l-engagement') as Negative;
    const inputs = inputsOf(negative.input as Input);
    const forged = { ...inputs, initiatorNonce: b64(negative.input.revealedNonce as string) };
    expect(toBase64(await commitmentOf(forged))).toBe(negative.expected.recomputedFromReveal);
    expect(await opensCommitment({ ...forged, commitment: b64(negative.expected.commitment as string) })).toBe(false);
  });

  it('engagement-rejoue-sous-un-autre-tx : refusé', async () => {
    const negative = vectors.negatives.find((entry) => entry.name === 'engagement-rejoue-sous-un-autre-tx') as Negative;
    const inputs = inputsOf(negative.input as Input);
    const replayed = { ...inputs, tx: b64(negative.input.replayedUnderTx as string) };
    expect(toBase64(await commitmentOf(replayed))).toBe(negative.expected.recomputedUnderReplayedTx);
    expect(await opensCommitment({ ...replayed, commitment: b64(negative.expected.commitment as string) })).toBe(false);
  });

  const formRefusals = vectors.negatives.filter((negative) => negative.outcome === 'refus:unexpected-message' && 'from' in negative.input);
  it.each(formRefusals.map((negative) => [negative.name, negative] as const))('%s : refusé par la forme, aucun code', (_name, negative) => {
    const from = negative.input.from as DeviceDescriptor;
    expect(descriptorProblem(from)).toBe(negative.expected.refusedField);
    expect(deviceDescriptorSchema.safeParse(from).success).toBe(false);
    const request = { ...(V1.wire.request as object), from };
    expect(deviceVerificationMessageSchema.safeParse(request).success).toBe(false);
    expect(readVerificationMessage(request, { account: ACCOUNT, self: V1.input.responder, relayedFrom: from }).verdict).toBe('refused');
  });

  const nonceRefusals = vectors.negatives.filter((negative) => negative.outcome === 'refus:unexpected-message' && 'nonce' in negative.input);
  it.each(nonceRefusals.map((negative) => [negative.name, negative] as const))('%s : un aléa hors forme est refusé', (_name, negative) => {
    expect(canonicalBase64(negative.input.nonce, 32)).toBeNull();
    const accept = { ...(V1.wire.accept as object), nonce: negative.input.nonce };
    expect(deviceVerificationMessageSchema.safeParse(accept).success).toBe(false);
    expect(readVerificationMessage(accept, { account: ACCOUNT, self: V1.input.initiator, relayedFrom: V1.input.responder })).toEqual({ verdict: 'refused', cancel: 'unexpected-message' });
  });

  it('chaque négatif du fichier est tenu par un des bancs ci-dessus', () => {
    const covered = new Set([
      ...differing.map((negative) => negative.name),
      ...formRefusals.map((negative) => negative.name),
      ...nonceRefusals.map((negative) => negative.name),
      'libelle-altere-dans-request',
      'revelation-qui-n-ouvre-pas-l-engagement',
      'engagement-rejoue-sous-un-autre-tx',
    ]);
    expect(vectors.negatives.map((negative) => negative.name).filter((name) => !covered.has(name))).toEqual([]);
  });
});

describe('les options en carré, à l’octet près (§ 4.9)', () => {
  const codeBytes = bytesOfHex(V1.expected.sasBytesHex);
  const ackBytes = bytesOfHex(V1.expected.ack.bytesHex);
  const decimalOf = {
    'carre-du-code-vecteur-1': (symbols: readonly number[]) => codeDecimals(codeFromSymbols(symbols, (codeBytes[5] ?? 0) & 0x3f)),
    'carre-de-l-accuse-vecteur-1': (symbols: readonly number[]) => ackDecimal(ackFromSymbols(symbols, (ackBytes[1] ?? 0) & 0x0f)),
  } as const;

  it.each(vectors.options.map((option) => [option.name, option] as const))('%s', (name, option) => {
    const symbols = name === 'carre-du-code-vecteur-1' ? codeEmojiIndexes(codeBytes) : ackEmojiIndexes(ackBytes);
    const square = name === 'carre-du-code-vecteur-1' ? CODE_SQUARE : ACK_SQUARE;
    expect([...square.bit1]).toEqual(option.bit1);
    expect([...square.bit2]).toEqual(option.bit2);
    const stream = bytesOfHex(option.streamHex);
    const read = { count: 0 };
    const source = byteStream(stream);
    const options = squareOptions(symbols, square, () => {
      read.count += 1;
      return source();
    });
    expect(read.count).toBe(option.expected.bytesUsed);
    expect(Object.fromEntries(Object.entries(options.alternatives).map(([key, value]) => [String(key), value]))).toEqual(option.expected.alternatives);
    expect(options.permutation).toBe(option.expected.permutation);
    expect(options.order).toEqual(option.expected.order);
    expect(options.correctAt).toBe(option.expected.correctAt);
    options.displayed.forEach((displayed, index) => {
      const wanted = option.expected.displayed[index] as Displayed;
      const rendered = renderSymbols(displayed);
      expect(rendered.indexes).toEqual(wanted.indexes);
      expect(rendered.emoji).toEqual(wanted.emoji);
      expect(rendered.names).toEqual(wanted.names);
      expect(decimalOf[name as keyof typeof decimalOf](displayed)).toEqual(wanted.decimal);
    });
    expect(options.displayed[options.correctAt]).toEqual([...symbols]);
  });
});

describe('la table des 64 symboles (§ 4.5)', () => {
  it('la table de la référence est celle du fichier, symbole par symbole et nom par nom', () => {
    expect(SAS_EMOJI_TABLE.length).toBe(64);
    expect(SAS_EMOJI_TABLE.map((entry) => ({ emoji: entry.emoji, names: entry.names }))).toEqual(
      emojiFile.emoji.map((entry) => ({ emoji: entry.emoji, names: entry.names })),
    );
  });
});

describe('sans WebCrypto, aucune comparaison ne démarre (§ 3.3)', () => {
  it('crypto.subtle absent : refus, jamais un repli', async () => {
    vi.stubGlobal('crypto', {});
    await expect(deriveVerification(inputsOf(V1.input))).rejects.toBeInstanceOf(DeviceVerificationUnavailableError);
    await expect(hkdfSha256({ ikm: new Uint8Array(1), salt: new Uint8Array(0), info: new Uint8Array(0), length: 8 })).rejects.toBeInstanceOf(
      DeviceVerificationUnavailableError,
    );
  });
});
