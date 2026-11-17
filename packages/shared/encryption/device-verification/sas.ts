/**
 * L'ENGAGEMENT, la TRANSCRIPTION, le CODE et l'ACCUSÉ — confirmation d'un appareil par
 * code court (#18906, #19154).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 4.4 :
 *
 *   C   = SHA-256( LP("…|commitment") ‖ LP(tx) ‖ LP(enc(I)) ‖ LP(nonce_I) )
 *   T   = LP("…|transcript") ‖ LP(tx) ‖ LP(enc(I)) ‖ LP(enc(R)) ‖ LP(C)
 *   OKM = HKDF-SHA-256(IKM = nonce_I ‖ nonce_R, sel = 32 octets nuls, info = "…|sas" ‖ SHA-256(T), L = 8)
 *   code = OKM[0..5] ; accusé = OKM[6..7]
 *
 * Aucune primitive maison : SHA-256 et HKDF viennent de WebCrypto (`crypto.subtle`), seul.
 * Son ABSENCE (contexte non sûr : page servie hors HTTPS) est un REFUS de comparer, jamais
 * un repli (§ 3.3) : `DeviceVerificationUnavailableError`.
 *
 * Ce module ne journalise rien. `nonce_I` est un secret jusqu'à `reveal` : il n'entre dans
 * aucun message d'erreur ni aucune trace (§ 4.4).
 */
import {
  concatBytes,
  DEVICE_VERIFICATION_PROTOCOL,
  DEVICE_VERIFICATION_SIZES,
  DeviceVerificationFormError,
  encodeDescriptor,
  lengthPrefixed,
  utf8Bytes,
  type DeviceDescriptor,
} from './descriptor.js';

export const DEVICE_VERIFICATION_LABELS = {
  commitment: `${DEVICE_VERIFICATION_PROTOCOL}|commitment`,
  transcript: `${DEVICE_VERIFICATION_PROTOCOL}|transcript`,
  sas: `${DEVICE_VERIFICATION_PROTOCOL}|sas`,
} as const;

/** Le sel de la RFC 5869 « vide » s'écrit en 32 octets nuls partout : HMAC rend le même résultat, et la JCE refuse une clé vide. */
const SAS_SALT = new Uint8Array(32);

/** `crypto.subtle` est absent : aucune comparaison ne démarre. */
export class DeviceVerificationUnavailableError extends Error {
  constructor() {
    super('device verification: WebCrypto (crypto.subtle) is unavailable in this context');
    this.name = 'DeviceVerificationUnavailableError';
  }
}

/** La fabrique WebCrypto du contexte courant, ou un refus. Lue à chaque appel : jamais mise en cache. */
export function webCryptoOrRefuse(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle === undefined || subtle === null) throw new DeviceVerificationUnavailableError();
  return subtle;
}

/** Une copie détachée : WebCrypto exige un `ArrayBuffer` qui n'est pas partagé. */
const owned = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await webCryptoOrRefuse().digest('SHA-256', owned(bytes)));
}

/** HKDF-SHA-256 (RFC 5869) par WebCrypto ; `length` en octets. */
export async function hkdfSha256(params: {
  readonly ikm: Uint8Array;
  readonly salt: Uint8Array;
  readonly info: Uint8Array;
  readonly length: number;
}): Promise<Uint8Array> {
  const subtle = webCryptoOrRefuse();
  const key = await subtle.importKey('raw', owned(params.ikm), 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: owned(params.salt), info: owned(params.info) },
    key,
    params.length * 8,
  );
  return new Uint8Array(bits);
}

const assertSize = (bytes: Uint8Array, size: number, field: string): Uint8Array => {
  if (bytes.length !== size) throw new DeviceVerificationFormError(field);
  return bytes;
};

/** Ce que l'initiateur fige dans son engagement : la transaction, son descripteur, son aléa. */
export type CommitmentInputs = {
  readonly tx: Uint8Array;
  readonly initiator: DeviceDescriptor;
  readonly initiatorNonce: Uint8Array;
};

export async function commitmentOf(inputs: CommitmentInputs): Promise<Uint8Array> {
  return sha256(
    concatBytes(
      lengthPrefixed(utf8Bytes(DEVICE_VERIFICATION_LABELS.commitment)),
      lengthPrefixed(assertSize(inputs.tx, DEVICE_VERIFICATION_SIZES.tx, 'tx')),
      lengthPrefixed(encodeDescriptor(inputs.initiator)),
      lengthPrefixed(assertSize(inputs.initiatorNonce, DEVICE_VERIFICATION_SIZES.nonce, 'nonce')),
    ),
  );
}

/** Égalité d'octets ; le temps constant n'est pas exigé ici : rien de secret n'y entre (§ 4.4). */
export const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

/**
 * Le répondeur recalcule `C` depuis la `request` reçue et le `nonce` de `reveal` : un
 * libellé réécrit, un aléa forgé ou un `tx` rejoué ne l'ouvrent pas (`commitment-mismatch`).
 */
export async function opensCommitment(inputs: CommitmentInputs & { readonly commitment: Uint8Array }): Promise<boolean> {
  return sameBytes(await commitmentOf(inputs), inputs.commitment);
}

export type VerificationTranscriptInputs = CommitmentInputs & {
  readonly responder: DeviceDescriptor;
  readonly responderNonce: Uint8Array;
};

export type VerificationOutput = {
  readonly initiatorDescriptor: Uint8Array;
  readonly responderDescriptor: Uint8Array;
  readonly commitment: Uint8Array;
  readonly transcriptSha256: Uint8Array;
  readonly okm: Uint8Array;
  /** Les 6 premiers octets : le code que les deux écrans comparent. */
  readonly code: Uint8Array;
  /** Les octets 6 et 7 : l'accusé, que le répondeur n'affiche qu'après le BON toucher. */
  readonly ack: Uint8Array;
};

/**
 * Tout ce qu'un appareil calcule une fois `C` ouvert. L'initiateur est en premier dans `T`
 * et dans l'IKM : échanger les rôles change le code (vecteur `inversion-des-roles`).
 */
export async function deriveVerification(inputs: VerificationTranscriptInputs): Promise<VerificationOutput> {
  const initiatorDescriptor = encodeDescriptor(inputs.initiator);
  const responderDescriptor = encodeDescriptor(inputs.responder);
  const commitment = await commitmentOf(inputs);
  const transcriptSha256 = await sha256(
    concatBytes(
      lengthPrefixed(utf8Bytes(DEVICE_VERIFICATION_LABELS.transcript)),
      lengthPrefixed(inputs.tx),
      lengthPrefixed(initiatorDescriptor),
      lengthPrefixed(responderDescriptor),
      lengthPrefixed(commitment),
    ),
  );
  const okm = await hkdfSha256({
    ikm: concatBytes(inputs.initiatorNonce, assertSize(inputs.responderNonce, DEVICE_VERIFICATION_SIZES.nonce, 'nonce')),
    salt: SAS_SALT,
    info: concatBytes(utf8Bytes(DEVICE_VERIFICATION_LABELS.sas), transcriptSha256),
    length: DEVICE_VERIFICATION_SIZES.okm,
  });
  return {
    initiatorDescriptor,
    responderDescriptor,
    commitment,
    transcriptSha256,
    okm,
    code: okm.slice(0, DEVICE_VERIFICATION_SIZES.code),
    ack: okm.slice(DEVICE_VERIFICATION_SIZES.code, DEVICE_VERIFICATION_SIZES.okm),
  };
}

/**
 * Les octets aléatoires d'une transaction (`tx`, `nonce_I`, `nonce_R`) : le générateur sûr
 * de la plateforme, ou un refus. Jamais un aléa nul ni un repli sur `Math.random`.
 */
export function secureRandomBytes(length: number): Uint8Array {
  const source = (globalThis as { crypto?: { getRandomValues?: <T extends ArrayBufferView>(array: T) => T } }).crypto;
  if (typeof source?.getRandomValues !== 'function') throw new DeviceVerificationUnavailableError();
  return source.getRandomValues(new Uint8Array(length));
}
