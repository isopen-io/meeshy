/**
 * LES OCTETS SIGNÉS d'une entrée du registre de confiance, la FORME d'une clé et d'une
 * signature, et la vérification par un vérificateur INJECTÉ (#18906, #19182).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 6.1
 * (inchangé depuis la v3, à l'octet) :
 *
 *   gen(g)         = u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey, 33 octets)
 *   inscription    = LP(utf8("meeshy-device-trust:v1|inscription")) ‖ LP(ascii(userId)) ‖ gen(moi)
 *                    ‖ u64(approvedAt) ‖ u64(seq)
 *   approbation    = LP(utf8("meeshy-device-trust:v1|approval")) ‖ LP(ascii(userId)) ‖ gen(sujet) ‖ gen(auteur)
 *                    ‖ u64(approvedAt) ‖ LP(utf8(method)) ‖ u64(seq) ‖ u64(fromSeq, ou 0) ‖ u8(sponsor ? 1 : 0)
 *   pierre tombale = LP(utf8("meeshy-device-trust:v1|revocation")) ‖ LP(ascii(userId)) ‖ gen(clé retirée) ‖ gen(auteur)
 *                    ‖ u64(revokedAt) ‖ u64(seq)
 *
 * AUCUNE primitive de signature ici : la référence n'importe aucune bibliothèque. Le
 * vérificateur est injecté — `PublicKey.verify` de `@signalapp/libsignal-client` dans Node
 * et la passerelle, `verifyWithIdentity` du pont libsignal WASM dans le navigateur. La FORME
 * se vérifie AVANT lui : libsignal accepte la « jumelle » d'une clé (bit 0x80 de l'octet 32
 * levé) et la signature malléable `(R, s + L)` ; la forme est le seul rempart contre elles.
 */
import {
  canonicalBase64,
  concatBytes,
  DEVICE_ID_RANGE,
  identityKeyBytes,
  lengthPrefixed,
  REGISTRATION_ID_RANGE,
  u32,
  utf8Bytes,
} from './descriptor.js';

export const TRUST_LEDGER_PROTOCOL = 'meeshy-device-trust:v1' as const;

/** Une étiquette par genre : une signature d'un genre ne vaut pour aucun autre (§ 6.1). */
export const TRUST_LEDGER_LABELS = {
  inscription: `${TRUST_LEDGER_PROTOCOL}|inscription`,
  approval: `${TRUST_LEDGER_PROTOCOL}|approval`,
  revocation: `${TRUST_LEDGER_PROTOCOL}|revocation`,
} as const;

/** RÉSERVÉE (registre des domaines, § 6.1) : rien n'est signé sous elle en v1. */
export const TRUST_LEDGER_RESERVED_REGIME_LABEL = `${TRUST_LEDGER_PROTOCOL}|regime` as const;

export const TRUST_LEDGER_SIGNATURE_BYTES = 64;

/** Bornes des entiers du registre : millisecondes et rangs tiennent dans un entier sûr de JavaScript. */
export const TRUST_LEDGER_MAX_SAFE = Number.MAX_SAFE_INTEGER;

/** L'ordre du groupe d'Ed25519 : le scalaire `s` d'une signature doit lui être strictement inférieur. */
const ED25519_L = 2n ** 252n + 27742317777372353535851937790883648493n;
const IDENTITY_KEY_TWIN_BIT = 0x80;

/** Une génération : la place, la `registrationId` qui l'occupe, et la clé d'identité qu'elle présente. */
export type LedgerGeneration = {
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: string;
};

export const LEDGER_METHODS = ['self', 'sas', 'qr', 'migrated', 'reattested'] as const;
export type LedgerMethod = (typeof LEDGER_METHODS)[number];

export type LedgerApproval = LedgerGeneration & {
  readonly approvedBy: LedgerGeneration;
  readonly approvedAt: number;
  readonly method: LedgerMethod;
  readonly seq: number;
  readonly fromSeq?: number;
  readonly sponsor?: true;
  readonly sig: string;
};

export type LedgerRevocation = LedgerGeneration & {
  readonly revokedBy: LedgerGeneration;
  readonly revokedAt: number;
  readonly seq: number;
  readonly sig: string;
};

export type LedgerEntry = LedgerApproval | LedgerRevocation;

export type LedgerSignatureLabel = (typeof TRUST_LEDGER_LABELS)[keyof typeof TRUST_LEDGER_LABELS];

/**
 * Le vérificateur XEdDSA injecté : la clé d'identité publique (33 octets, `0x05` en tête),
 * les octets signés, la signature (64 octets). Il rend `true` seulement si la signature est
 * valide ; une exception vaut refus.
 */
export type LedgerSignatureVerifier = (identityKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean;

export const isLedgerRevocation = (entry: LedgerEntry): entry is LedgerRevocation => 'revokedBy' in entry;

export const ledgerEntryAuthor = (entry: LedgerEntry): LedgerGeneration =>
  isLedgerRevocation(entry) ? entry.revokedBy : entry.approvedBy;

/** `u64(x)` = 8 octets grand-boutiens, pour 0 ≤ x ≤ 2⁵³ − 1. */
export function u64(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`u64 hors bornes : ${value}`);
  const high = Math.floor(value / 2 ** 32);
  const low = value % 2 ** 32;
  return concatBytes(u32(high), u32(low));
}

const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);

const generationBytes = (generation: LedgerGeneration): Uint8Array => {
  const key = canonicalBase64(generation.identityKey);
  if (key === null) throw new RangeError('clé d’identité hors forme');
  return concatBytes(u32(generation.deviceId), u32(generation.registrationId), lengthPrefixed(key));
};

const header = (label: string, userId: string): Uint8Array => concatBytes(lengthPrefixed(utf8Bytes(label)), lengthPrefixed(asciiBytes(userId)));

/**
 * Les octets que l'AUTEUR a signés (§ 6.1), calculés avec le compte qui VÉRIFIE : une entrée
 * signée pour un autre compte, ou pour le même écrit en majuscules, ne se vérifie pas.
 * `label` ne sert qu'aux vecteurs (une signature sous l'étiquette d'un autre genre).
 */
export function ledgerSignedBytes(userId: string, entry: LedgerEntry, label?: LedgerSignatureLabel): Uint8Array {
  if (isLedgerRevocation(entry)) {
    return concatBytes(
      header(label ?? TRUST_LEDGER_LABELS.revocation, userId),
      generationBytes(entry),
      generationBytes(entry.revokedBy),
      u64(entry.revokedAt),
      u64(entry.seq),
    );
  }
  if (entry.method === 'self') {
    return concatBytes(header(label ?? TRUST_LEDGER_LABELS.inscription, userId), generationBytes(entry), u64(entry.approvedAt), u64(entry.seq));
  }
  return concatBytes(
    header(label ?? TRUST_LEDGER_LABELS.approval, userId),
    generationBytes(entry),
    generationBytes(entry.approvedBy),
    u64(entry.approvedAt),
    lengthPrefixed(utf8Bytes(entry.method)),
    u64(entry.seq),
    u64(entry.fromSeq ?? 0),
    Uint8Array.of(entry.sponsor === true ? 1 : 0),
  );
}

/**
 * La forme d'une clé d'identité DANS LE REGISTRE (§ 6.1, #19168) : 33 octets, `0x05` en tête,
 * base64 canonique, et le bit 0x80 de l'octet 32 nul — sans quoi la « jumelle » d'une clé
 * morte vivrait sous une pierre tombale qui compare des octets.
 */
export function ledgerIdentityKeyBytes(text: unknown): Uint8Array | null {
  const key = identityKeyBytes(text);
  return key !== null && ((key[32] ?? 0) & IDENTITY_KEY_TWIN_BIT) === 0 ? key : null;
}

/**
 * La forme d'une signature (§ 6.1) : 64 octets en base64 canonique, et le scalaire `s`
 * (octets 32 à 63, petit-boutien, bit 255 — le bit de signe de XEdDSA — effacé) < L.
 */
export function ledgerSignatureBytes(text: unknown): Uint8Array | null {
  const signature = canonicalBase64(text, TRUST_LEDGER_SIGNATURE_BYTES);
  if (signature === null) return null;
  const scalar = Array.from(signature.subarray(32)).reduceRight(
    (accumulator, byte, index) => (accumulator << 8n) | BigInt(index === 31 ? byte & 0x7f : byte),
    0n,
  );
  return scalar < ED25519_L ? signature : null;
}

const isInRange = (value: unknown, range: { readonly min: number; readonly max: number }): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;

/** Une génération bien formée : place 1…127, `registrationId` 1…16383, clé sans jumelle. */
export function isLedgerGeneration(value: unknown): value is LedgerGeneration {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isInRange(candidate.deviceId, DEVICE_ID_RANGE) &&
    isInRange(candidate.registrationId, REGISTRATION_ID_RANGE) &&
    ledgerIdentityKeyBytes(candidate.identityKey) !== null
  );
}

/**
 * Vérifie la signature d'une entrée BIEN FORMÉE sous la clé de son auteur, avec le compte qui
 * vérifie. La forme de la signature est contrôlée d'abord ; une exception du vérificateur vaut
 * refus (fail-closed).
 */
export function verifyLedgerEntrySignature(verifier: LedgerSignatureVerifier, userId: string, entry: LedgerEntry): boolean {
  const signature = ledgerSignatureBytes(entry.sig);
  const authorKey = ledgerIdentityKeyBytes(ledgerEntryAuthor(entry).identityKey);
  if (signature === null || authorKey === null) return false;
  try {
    return verifier(authorKey, ledgerSignedBytes(userId, entry), signature) === true;
  } catch {
    return false;
  }
}
