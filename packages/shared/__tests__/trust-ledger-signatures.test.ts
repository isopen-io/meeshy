// packages/shared/__tests__/trust-ledger-signatures.test.ts
//
// #19182 (#18906) — les OCTETS SIGNÉS des entrées du registre de confiance et leur
// vérification XEdDSA par libsignal, injectée : spécification
// `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 6.1, et vecteurs
// `fixtures/e2ee-device-verification/trust-ledger-v1.cases.json` (`signatures`,
// `signatureIndex`). XEdDSA est aléatoire : on vérifie les signatures FIXES publiées, et on
// prouve la signature d'ici par un aller-retour, jamais par une égalité d'octets.
//
// libsignal est le vérificateur de Node et de la passerelle (`@signalapp/libsignal-client`,
// déclaré par packages/shared en optionalDependencies, posé par l'installation de CI). Ce
// témoin ne se saute jamais : s'il ne charge pas, il rougit.

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrivateKey, PublicKey } from '@signalapp/libsignal-client';
import {
  ledgerEntryAuthor,
  ledgerIdentityKeyBytes,
  ledgerSignatureBytes,
  ledgerSignedBytes,
  parseLedgerApproval,
  parseLedgerRevocation,
  verifyLedgerEntrySignature,
  type LedgerEntry,
  type LedgerSignatureVerifier,
} from '../encryption/device-verification/index.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/e2ee-device-verification/', import.meta.url));

type SignatureVector = { readonly name: string; readonly entry: LedgerEntry; readonly signedHex: string; readonly sig: string; readonly signer?: string };
type NegativeVector = SignatureVector & { readonly verifyWith: string; readonly expected: 'invalide' | 'refus-forme' };
type CaseMessage = { readonly approvals?: readonly LedgerEntry[]; readonly revocations?: readonly LedgerEntry[]; readonly raw?: string };
type Ledger = {
  readonly account: string;
  readonly testKeys: { readonly keys: readonly { readonly name: string; readonly identityKey: string; readonly privateKeyHex: string }[] };
  readonly signatures: { readonly positives: readonly SignatureVector[]; readonly negatives: readonly NegativeVector[] };
  readonly signatureIndex: { readonly entries: readonly { readonly signer: string; readonly signedSha256: string; readonly variant: number; readonly sig: string }[] };
  readonly cases: readonly { readonly name: string; readonly messages: readonly CaseMessage[] }[];
};

const ledger = JSON.parse(readFileSync(join(FIXTURES, 'trust-ledger-v1.cases.json'), 'utf8')) as Ledger;
const ACCOUNT = ledger.account;
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'base64'));

/** Le vérificateur de Node : libsignal, tel quel — il accepte la jumelle et `s + L`, la forme les refuse avant lui. */
const libsignalVerify: LedgerSignatureVerifier = (identityKey, message, signature) => PublicKey.deserialize(identityKey).verify(message, signature);

const asEntry = (value: unknown): LedgerEntry => {
  const parsed = typeof value === 'object' && value !== null && 'revokedBy' in value ? parseLedgerRevocation(value) : parseLedgerApproval(value);
  if (parsed.entry === null) throw new Error(`entrée hors forme : ${parsed.problem}`);
  return parsed.entry;
};

describe('les octets signés et les signatures publiées (§ 6.1)', () => {
  it.each(ledger.signatures.positives.map((vector) => [vector.name, vector] as const))('%s : octets égaux à signedHex, signature vérifiée par libsignal', (_name, vector) => {
    const entry = asEntry(vector.entry);
    expect(hex(ledgerSignedBytes(ACCOUNT, entry))).toBe(vector.signedHex);
    expect(verifyLedgerEntrySignature(libsignalVerify, ACCOUNT, entry)).toBe(true);
  });

  it.each(ledger.signatures.negatives.map((vector) => [vector.name, vector] as const))('%s : refusé', (_name, vector) => {
    const parsed = 'revokedBy' in vector.entry ? parseLedgerRevocation({ ...vector.entry, sig: vector.sig }) : parseLedgerApproval({ ...vector.entry, sig: vector.sig });
    if (vector.expected === 'refus-forme') {
      expect(parsed.entry).toBeNull();
      return;
    }
    expect(parsed.entry).not.toBeNull();
    const entry = parsed.entry as LedgerEntry;
    expect(hex(ledgerSignedBytes(ACCOUNT, entry))).toBe(vector.signedHex);
    const key = ledgerIdentityKeyBytes(vector.verifyWith) as Uint8Array;
    expect(libsignalVerify(key, ledgerSignedBytes(ACCOUNT, entry), fromBase64(vector.sig))).toBe(false);
  });

  it('huit positifs et douze négatifs (huit invalides, quatre refus de forme)', () => {
    expect(ledger.signatures.positives.length).toBe(8);
    expect(ledger.signatures.negatives.filter((vector) => vector.expected === 'invalide').length).toBe(8);
    expect(ledger.signatures.negatives.filter((vector) => vector.expected === 'refus-forme').length).toBe(4);
  });

  it('libsignal VÉRIFIE la clé jumelle et la signature malléable : la forme est le seul rempart', () => {
    const twin = ledger.signatures.negatives.find((vector) => vector.name === 'auteur-a-cle-jumelle') as NegativeVector;
    const malleable = ledger.signatures.negatives.find((vector) => vector.name === 'signature-malleable-s-plus-L') as NegativeVector;
    const twinKey = fromBase64(twin.verifyWith);
    expect(libsignalVerify(twinKey, Buffer.from(twin.signedHex, 'hex'), fromBase64(twin.sig))).toBe(true);
    expect(ledgerIdentityKeyBytes(twin.verifyWith)).toBeNull();
    expect(libsignalVerify(fromBase64(malleable.verifyWith), Buffer.from(malleable.signedHex, 'hex'), fromBase64(malleable.sig))).toBe(true);
    expect(ledgerSignatureBytes(malleable.sig)).toBeNull();
  });

  it('le positif dont la clé a le bit de signe d’Edwards à 1 se vérifie (bit 255 de la signature levé)', () => {
    const vector = ledger.signatures.positives.find((entry) => entry.name === 'approbation-de-parrainage-cle-a-bit-de-signe-1') as SignatureVector;
    expect((fromBase64(vector.sig)[63] ?? 0) >> 7).toBe(1);
    expect(verifyLedgerEntrySignature(libsignalVerify, ACCOUNT, asEntry(vector.entry))).toBe(true);
  });

  it('un octet signé retouché, ou un autre compte, fait échouer la vérification', () => {
    const entry = asEntry(ledger.signatures.positives[1]?.entry);
    expect(verifyLedgerEntrySignature(libsignalVerify, ACCOUNT, { ...entry, approvedAt: (entry as { approvedAt: number }).approvedAt + 1 } as LedgerEntry)).toBe(false);
    expect(verifyLedgerEntrySignature(libsignalVerify, ACCOUNT.toUpperCase(), entry)).toBe(false);
    expect(verifyLedgerEntrySignature(libsignalVerify, '6745a1b2c3d4e5f601234568', entry)).toBe(false);
  });

  it('un vérificateur qui lève vaut refus (fail-closed)', () => {
    const entry = asEntry(ledger.signatures.positives[0]?.entry);
    expect(verifyLedgerEntrySignature(() => { throw new Error('clé indécodable'); }, ACCOUNT, entry)).toBe(false);
  });

  it('une signature produite ici avec une clé de TEST se vérifie (aller-retour)', () => {
    ledger.testKeys.keys.forEach((key) => {
      const privateKey = PrivateKey.deserialize(Buffer.from(key.privateKeyHex, 'hex'));
      expect(Buffer.from(privateKey.getPublicKey().serialize()).toString('base64')).toBe(key.identityKey);
      const entry = asEntry({ ...ledger.signatures.positives[0]?.entry, sig: ledger.signatures.positives[0]?.sig });
      const self = { ...entry, deviceId: 9, registrationId: 99, identityKey: key.identityKey, approvedBy: { deviceId: 9, registrationId: 99, identityKey: key.identityKey } } as LedgerEntry;
      const sig = Buffer.from(privateKey.sign(ledgerSignedBytes(ACCOUNT, self))).toString('base64');
      expect(ledgerSignatureBytes(sig)).not.toBeNull();
      expect(verifyLedgerEntrySignature(libsignalVerify, ACCOUNT, { ...self, sig })).toBe(true);
    });
  });
});

describe('chaque entrée signée des cas communs a l’encodage que l’index publie (signatureIndex)', () => {
  const index = new Map(ledger.signatureIndex.entries.map((entry) => [`${entry.signer}|${entry.sig}`, entry.signedSha256] as const));
  const caseEntries = ledger.cases.flatMap((entry) =>
    entry.messages.flatMap((message) => [...(message.approvals ?? []), ...(message.revocations ?? [])].map((value) => ({ name: entry.name, value }))),
  );

  it('chaque entrée qui se vérifie dans le compte a, pour son signataire, le SHA-256 d’octets signés que l’index publie', () => {
    const verified = caseEntries
      .map(({ name, value }) => ({ name, parsed: 'revokedBy' in value ? parseLedgerRevocation(value) : parseLedgerApproval(value) }))
      .filter(({ parsed }) => parsed.entry !== null && verifyLedgerEntrySignature(libsignalVerify, ACCOUNT, parsed.entry))
      .map(({ name, parsed }) => ({ name, entry: parsed.entry as LedgerEntry }));
    expect(verified.length).toBeGreaterThan(700);
    const mismatches = verified.filter(
      ({ entry }) => index.get(`${ledgerEntryAuthor(entry).identityKey}|${entry.sig}`) !== createHash('sha256').update(ledgerSignedBytes(ACCOUNT, entry)).digest('hex'),
    );
    expect(mismatches.map(({ name }) => name)).toEqual([]);
  });
});
