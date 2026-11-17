/**
 * LE CONTRAT DU CONTENU CHIFFRÉ (#18940) — ce que libsignal chiffre dans une
 * conversation `e2ee` : le contenu d'un message (`E2EEContent` v1), un signal
 * (`E2EESignal` v1), et le remplissage par espaces qui les égalise.
 *
 * Les vecteurs `fixtures/e2ee-content/` et `fixtures/e2ee-signal/` sont la
 * référence COMMUNE des trois clients : leurs `canonicalJson` sont écrits à la
 * main d'après ce que l'iPhone écrit aujourd'hui (`E2EEContent.swift`,
 * `E2EESignal.swift`, témoins `E2EEContentTests.swift`), jamais générés par
 * l'encodeur TS mesuré ici. Les octets base64 et le clair rempli n'en sont que
 * la dérivation mécanique, que ce témoin recalcule lui-même.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  E2EE_SIGNAL_KINDS,
  e2eeContentV1Schema,
  e2eePlaintextPayload,
  e2eeSignalHeaderV1Schema,
  e2eeSignalV1Schema,
  encodeE2EEContent,
  encodeE2EESignal,
  openE2EEPlaintext,
  padE2EEPlaintext,
  readE2EEContent,
  readE2EESignal,
  type E2EEContentV1,
  type E2EEEnvelopeOrigin,
  type E2EESignalV1,
} from '../types/e2ee-content.js';
import {
  E2EE_PADDING_CIPHER_OVERHEAD,
  E2EE_PADDING_STEP,
  E2EE_PADDING_TIERS,
  e2eePaddedLength,
  e2eePaddingCeiling,
} from '../types/e2ee-signals.js';

type RoundTripCase<T> = {
  readonly name: string;
  readonly object: T;
  readonly canonicalJson: string;
  readonly canonicalBase64: string;
  readonly canonicalLength: number;
  readonly envelope: E2EEEnvelopeOrigin;
  readonly padded: { readonly recipients: number; readonly length: number; readonly base64: string };
};

type VerdictCase = {
  readonly name: string;
  readonly plaintextBase64: string;
  readonly plaintextJson?: string;
  readonly envelope: E2EEEnvelopeOrigin;
  readonly payload: 'message' | 'signal';
  readonly verdict: string;
  readonly version?: number;
  readonly kind?: string;
  readonly expected?: Record<string, unknown>;
};

type Vectors<T> = {
  readonly contract: string;
  readonly version: number;
  readonly cases: readonly RoundTripCase<T>[];
  readonly verdicts: readonly VerdictCase[];
};

type PaddingVectors = {
  readonly tiers: readonly number[];
  readonly step: number;
  readonly cipherOverhead: number;
  readonly byte: number;
  readonly ceilings: readonly { readonly recipients: number; readonly ceiling: number }[];
  readonly lengths: readonly { readonly length: number; readonly recipients: number; readonly padded: number }[];
};

const fixture = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8')) as T;

const content = fixture<Vectors<E2EEContentV1>>('e2ee-content/content.vectors.json');
const signals = fixture<Vectors<E2EESignalV1>>('e2ee-signal/signal.vectors.json');
const padding = fixture<PaddingVectors>('e2ee-content/padding.vectors.json');

const bytesOf = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));
const utf8 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'));
const spacesAfter = (json: string, length: number): Uint8Array => {
  const head = utf8(json);
  const out = new Uint8Array(length).fill(0x20);
  out.set(head);
  return out;
};

describe('les vecteurs du contenu chiffré sont cohérents avec eux-mêmes', () => {
  it.each([...content.cases, ...signals.cases].map((c) => [c.name, c] as const))(
    '%s : base64 = octets UTF-8 du JSON canonique, clair rempli = JSON suivi d’espaces',
    (_name, vector) => {
      expect(Buffer.from(vector.canonicalBase64, 'base64').toString('utf8')).toBe(vector.canonicalJson);
      expect(utf8(vector.canonicalJson).length).toBe(vector.canonicalLength);
      expect(bytesOf(vector.padded.base64)).toEqual(spacesAfter(vector.canonicalJson, vector.padded.length));
      expect(vector.padded.length).toBe(e2eePaddedLength(vector.canonicalLength, vector.padded.recipients));
    },
  );

  it.each([...content.verdicts, ...signals.verdicts].filter((v) => v.plaintextJson !== undefined).map((v) => [v.name, v] as const))(
    '%s : le JSON lisible du cas est bien le clair (remplissage ôté)',
    (_name, vector) => {
      expect(Buffer.from(vector.plaintextBase64, 'base64').toString('utf8').replace(/ +$/u, '')).toBe(vector.plaintextJson);
    },
  );

  it('chaque verdict du contrat est illustré par au moins un cas', () => {
    const verdicts = new Set([...content.verdicts, ...signals.verdicts].map((v) => v.verdict));
    expect([...verdicts].sort()).toEqual([
      'admitted',
      'admitted-unauthored',
      'admitted-unknown-kind',
      'future-version',
      'misattributed-author',
      'misattributed-conversation',
      'unreadable',
    ]);
  });

  it('chaque action connue d’un signal a son cas d’aller-retour', () => {
    expect(new Set(signals.cases.map((c) => c.object.kind))).toEqual(new Set(E2EE_SIGNAL_KINDS));
  });
});

describe('le remplissage est celui d’iOS et d’Android (E2EEPadding, E2eePadding)', () => {
  it('les constantes du fichier sont celles de @meeshy/shared', () => {
    expect(padding.tiers).toEqual([...E2EE_PADDING_TIERS]);
    expect(padding.step).toBe(E2EE_PADDING_STEP);
    expect(padding.cipherOverhead).toBe(E2EE_PADDING_CIPHER_OVERHEAD);
    expect(padding.byte).toBe(0x20);
  });

  it.each(padding.ceilings.map((row) => [row.recipients, row.ceiling] as const))('%i enveloppe(s) : plafond %i octets', (recipients, ceiling) => {
    expect(e2eePaddingCeiling(recipients)).toBe(ceiling);
  });

  it.each(padding.lengths.map((row) => [row.length, row.recipients, row.padded] as const))(
    'un clair de %i octets pour %i enveloppe(s) se remplit à %i',
    (length, recipients, padded) => {
      expect(e2eePaddedLength(length, recipients)).toBe(padded);
    },
  );

  it.each(content.cases.map((c) => [c.name, c] as const))('%s : padE2EEPlaintext rend les octets du vecteur', (_name, vector) => {
    expect(padE2EEPlaintext(vector.canonicalJson, vector.padded.recipients)).toEqual(bytesOf(vector.padded.base64));
  });

  it('au-delà du plafond, rien ne s’ajoute', () => {
    const json = `{"v":1,"sentAt":1,"text":"${'x'.repeat(70_000)}"}`;
    expect(padE2EEPlaintext(json, 2)).toEqual(utf8(json));
  });
});

describe('l’encodeur canonique écrit les octets de l’iPhone', () => {
  it.each(content.cases.map((c) => [c.name, c] as const))('contenu %s', (_name, vector) => {
    expect(encodeE2EEContent(vector.object)).toBe(vector.canonicalJson);
  });

  it.each(signals.cases.map((c) => [c.name, c] as const))('signal %s', (_name, vector) => {
    expect(encodeE2EESignal(vector.object)).toBe(vector.canonicalJson);
  });

  it('l’ordre des clés est le même pour le tri par point de code et pour celui de JSONEncoder (.sortedKeys : sans casse, numérique)', () => {
    const keys = [
      ...Object.keys(e2eeContentV1Schema.shape),
      ...e2eeSignalV1Schema.options.flatMap((option) => Object.keys(option.shape)),
    ];
    const unique = [...new Set(keys)];
    const swiftOrder = [...unique].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
    expect([...unique].sort()).toEqual(swiftOrder);
  });

  it('refuse un contenu hors contrat plutôt que d’écrire ce qu’aucun appareil ne lirait', () => {
    const base: E2EEContentV1 = { v: 1, conversationId: 'c1', sentAt: 1 };
    expect(() => encodeE2EEContent({ ...base, authorDeviceId: -1 })).toThrow();
    expect(() => encodeE2EEContent({ ...base, sentAt: 1.5 })).toThrow();
    expect(() => encodeE2EEContent({ ...base, v: 2 } as unknown as E2EEContentV1)).toThrow();
    expect(() => encodeE2EEContent({ ...base, text: 'coupé \ud83d' })).toThrow();
  });

  it('n’écrit jamais une clé inconnue de la version 1', () => {
    const smuggled = { v: 1, conversationId: 'c1', sentAt: 1, mentions: ['u1'] } as unknown as E2EEContentV1;
    expect(encodeE2EEContent(smuggled)).toBe('{"conversationId":"c1","sentAt":1,"v":1}');
  });

  it('refuse un signal hors contrat', () => {
    const typing = { s: 1, kind: 'typing', active: true, conversationId: 'c1', sentAt: 1 } as const;
    expect(() => encodeE2EESignal({ ...typing, active: 'yes' } as unknown as E2EESignalV1)).toThrow();
    expect(() => encodeE2EESignal({ ...typing, kind: 'poll-vote' } as unknown as E2EESignalV1)).toThrow();
  });
});

describe('l’ouverture rend le verdict d’iOS, et une version future ne se perd pas', () => {
  it.each(content.cases.map((c) => [c.name, c] as const))('contenu %s : rempli, il s’ouvre et se lit tel qu’écrit', (_name, vector) => {
    const opening = openE2EEPlaintext(bytesOf(vector.padded.base64), vector.envelope);
    expect(opening).toMatchObject({ payload: 'message', verdict: 'admitted' });
    expect(opening.verdict === 'admitted' && opening.payload === 'message' ? opening.content : null).toEqual(vector.object);
  });

  it.each(signals.cases.map((c) => [c.name, c] as const))('signal %s : rempli, il s’ouvre et se lit tel qu’écrit', (_name, vector) => {
    const opening = openE2EEPlaintext(bytesOf(vector.padded.base64), vector.envelope);
    expect(opening).toMatchObject({ payload: 'signal', verdict: 'admitted' });
    expect(opening.verdict === 'admitted' && opening.payload === 'signal' ? opening.signal : null).toEqual(vector.object);
  });

  it.each([...content.verdicts, ...signals.verdicts].map((v) => [v.name, v] as const))('%s', (_name, vector) => {
    const plaintext = bytesOf(vector.plaintextBase64);
    expect(e2eePlaintextPayload(plaintext)).toBe(vector.payload);
    const opening = openE2EEPlaintext(plaintext, vector.envelope);
    expect(opening.payload).toBe(vector.payload);
    expect(opening.verdict).toBe(vector.verdict);
    if (opening.verdict === 'future-version') expect(opening.version).toBe(vector.version);
    if (opening.verdict === 'admitted-unknown-kind') expect(opening.header.kind).toBe(vector.kind);
    if (opening.verdict === 'admitted' || opening.verdict === 'admitted-unauthored') {
      expect(opening.payload === 'message' ? opening.content : opening.signal).toEqual(vector.expected);
    }
  });

  it('une version future rend son JSON, sans le remplissage : il se relit après la mise à jour', () => {
    const json = '{"conversationId":"c1","sentAt":1,"text":"x","v":2}';
    const opening = openE2EEPlaintext(padE2EEPlaintext(json, 1), { conversationId: 'c1', senderUserId: 'u', senderDeviceId: 1 });
    expect(opening).toEqual({ payload: 'message', verdict: 'future-version', version: 2, json });
  });

  it('le clair se lit aussi bien en octets qu’en texte déjà décodé', () => {
    const vector = content.cases[0]!;
    const fromText = openE2EEPlaintext(vector.canonicalJson, vector.envelope);
    expect(fromText).toEqual(openE2EEPlaintext(utf8(vector.canonicalJson), vector.envelope));
  });
});

describe('un signal ne se lit jamais comme un message, ni l’inverse', () => {
  it.each(signals.cases.map((c) => [c.name, c] as const))('%s : un lecteur de contenu le juge illisible', (_name, vector) => {
    expect(readE2EEContent(bytesOf(vector.padded.base64))).toMatchObject({ verdict: 'unreadable' });
  });

  it.each(content.cases.map((c) => [c.name, c] as const))('%s : un lecteur de signal le juge illisible', (_name, vector) => {
    expect(readE2EESignal(bytesOf(vector.padded.base64))).toMatchObject({ verdict: 'unreadable' });
  });

  it('l’en-tête d’un signal suffit à lire une action inconnue, sans l’appliquer', () => {
    const later = '{"authorDeviceId":1,"authorUserId":"a","conversationId":"c1","kind":"poll-vote","s":1,"sentAt":1}';
    expect(readE2EESignal(later)).toEqual({
      verdict: 'unknown-kind',
      header: e2eeSignalHeaderV1Schema.parse(JSON.parse(later)),
    });
  });
});
