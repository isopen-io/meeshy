/**
 * #13100 — le FORMAT d'un fichier de pièce jointe scellé au repos (modes
 * `server` et `hybrid`). Aucune primitive maison : c'est AES-GCM-HKDF Streaming
 * de Tink, octet pour octet (https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming),
 * instance de la construction STREAM (Hoang, Reyhanitabar, Rogaway, Vizár,
 * « Online Authenticated-Encryption and its Nonce-Reuse Misuse-Resistance »,
 * CRYPTO 2015). Les témoins ouvrent des fichiers scellés par Tink lui-même.
 *
 * - En-tête : `longueur (1 octet) ‖ sel (32) ‖ préfixe de nonce (7)`, 40 octets.
 * - Clé du fichier : HKDF-SHA256 (RFC 5869), IKM = clé de données de la
 *   conversation, sel = celui de l'en-tête, info = les données associées.
 * - Segments : AES-256-GCM (NIST SP 800-38D), nonce = préfixe ‖ rang (32 bits
 *   gros-boutiste) ‖ drapeau de dernier segment, étiquette de 16 octets. Le
 *   premier segment est raccourci de la longueur de l'en-tête.
 *
 * Pourquoi un format par segments et non un seul GCM : une vidéo se lit par
 * plages (`Range`, 206) et ne tient pas en mémoire ; chaque segment s'ouvre et
 * s'authentifie seul. Le drapeau de dernier segment et le rang dans le nonce
 * rendent la troncature, la permutation et le recollage détectables.
 *
 * Aucun octet n'est rendu avant que l'étiquette de SON segment ne soit vérifiée.
 */
import * as crypto from 'crypto';

export const SEALED_FILE_FORMAT = 'tink-aes256-gcm-hkdf-sha256-streaming-v1';

const KEY_BYTES = 32;
const NONCE_PREFIX_BYTES = 7;
const TAG_BYTES = 16;

export const SEALED_FILE_HEADER_LENGTH = 1 + KEY_BYTES + NONCE_PREFIX_BYTES;

/** 64 Kio : la granularité d'une lecture par plage, pour 0,02 % de surcoût. */
export const DEFAULT_CIPHERTEXT_SEGMENT_SIZE = 65536;

export type SealedFileParams = {
  /** La clé de données de la conversation (32 octets), IKM de HKDF. */
  readonly mainKey: Buffer;
  /** Ce que le fichier est, et à qui : il ne s'ouvre que sous ces mêmes octets. */
  readonly associatedData: Buffer;
  readonly ciphertextSegmentSize: number;
  /** Les octets aléatoires (sel, préfixe) ; injectable pour un témoin déterministe. */
  readonly random?: (size: number) => Buffer;
};

export class SealedFileError extends Error {
  constructor(readonly reason: 'malformed-header' | 'size-mismatch' | 'authentication-failed' | 'range' | 'short-read') {
    super(`Fichier scellé illisible (${reason})`);
    this.name = 'SealedFileError';
  }
}

const plaintextSegmentSize = (cs: number): number => cs - TAG_BYTES;
const firstPlaintextSegmentSize = (cs: number): number => cs - TAG_BYTES - SEALED_FILE_HEADER_LENGTH;

function assertSegmentSize(cs: number): void {
  if (!Number.isInteger(cs) || firstPlaintextSegmentSize(cs) <= 0) throw new SealedFileError('malformed-header');
}

/** Le nombre de segments d'un clair de cette taille ; un clair vide en a un. */
function segmentCount(plaintextSize: number, cs: number): number {
  const first = firstPlaintextSegmentSize(cs);
  return plaintextSize <= first ? 1 : 1 + Math.ceil((plaintextSize - first) / plaintextSegmentSize(cs));
}

export function ciphertextSizeFor(plaintextSize: number, cs: number): number {
  assertSegmentSize(cs);
  return SEALED_FILE_HEADER_LENGTH + plaintextSize + TAG_BYTES * segmentCount(plaintextSize, cs);
}

/** La taille du clair d'un chiffré de cette taille, ou `null` si aucune n'y mène. */
export function plaintextSizeFor(ciphertextSize: number, cs: number): number | null {
  assertSegmentSize(cs);
  if (ciphertextSize < SEALED_FILE_HEADER_LENGTH + TAG_BYTES) return null;
  const segments = Math.ceil(ciphertextSize / cs);
  const plaintextSize = ciphertextSize - SEALED_FILE_HEADER_LENGTH - TAG_BYTES * segments;
  return plaintextSize >= 0 && ciphertextSizeFor(plaintextSize, cs) === ciphertextSize ? plaintextSize : null;
}

function segmentKey(params: SealedFileParams, salt: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', params.mainKey, salt, params.associatedData, KEY_BYTES));
}

function nonceFor(prefix: Buffer, index: number, last: boolean): Buffer {
  const nonce = Buffer.alloc(NONCE_PREFIX_BYTES + 5);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(index, NONCE_PREFIX_BYTES);
  nonce[NONCE_PREFIX_BYTES + 4] = last ? 1 : 0;
  return nonce;
}

function sealSegment(key: Buffer, prefix: Buffer, index: number, last: boolean, plaintext: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonceFor(prefix, index, last), { authTagLength: TAG_BYTES });
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}

function openSegment(key: Buffer, prefix: Buffer, index: number, last: boolean, segment: Buffer): Buffer {
  if (segment.length < TAG_BYTES) throw new SealedFileError('short-read');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonceFor(prefix, index, last), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(segment.subarray(segment.length - TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(segment.subarray(0, segment.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new SealedFileError('authentication-failed');
  }
}

/**
 * Scelle un flux de clair en flux de chiffré. Un segment ne part que quand le
 * suivant est certain d'exister : le dernier, seul, porte le drapeau.
 */
export async function* sealSegments(source: AsyncIterable<Buffer>, params: SealedFileParams): AsyncGenerator<Buffer> {
  const cs = params.ciphertextSegmentSize;
  assertSegmentSize(cs);
  const random = params.random ?? crypto.randomBytes;
  const salt = random(KEY_BYTES);
  const prefix = random(NONCE_PREFIX_BYTES);
  const key = segmentKey(params, salt);
  yield Buffer.concat([Buffer.from([SEALED_FILE_HEADER_LENGTH]), salt, prefix]);

  let pending = Buffer.alloc(0);
  let index = 0;
  const sizeOf = (i: number) => (i === 0 ? firstPlaintextSegmentSize(cs) : plaintextSegmentSize(cs));
  try {
    for await (const chunk of source) {
      pending = pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, chunk]);
      while (pending.length > sizeOf(index)) {
        yield sealSegment(key, prefix, index, false, pending.subarray(0, sizeOf(index)));
        pending = pending.subarray(sizeOf(index));
        index += 1;
      }
    }
    yield sealSegment(key, prefix, index, true, pending);
  } finally {
    key.fill(0);
  }
}

/** Les bornes (fin exclue) du segment `index` dans le chiffré. */
function segmentBounds(index: number, cs: number, ciphertextSize: number): { start: number; end: number } {
  return { start: index === 0 ? SEALED_FILE_HEADER_LENGTH : index * cs, end: Math.min((index + 1) * cs, ciphertextSize) };
}

/** Le segment qui porte l'octet de clair `offset`, et sa position dans ce segment. */
function locate(offset: number, cs: number): { index: number; within: number } {
  const first = firstPlaintextSegmentSize(cs);
  if (offset < first) return { index: 0, within: offset };
  const rest = offset - first;
  return { index: 1 + Math.floor(rest / plaintextSegmentSize(cs)), within: rest % plaintextSegmentSize(cs) };
}

export type OpenSealedRangeParams = SealedFileParams & {
  /** La taille du clair, telle que la passerelle l'a inscrite au scellement. */
  readonly plaintextSize: number;
  /** Lit les octets `[start, end)` du chiffré ; rend moins seulement en fin de fichier. */
  readonly readCiphertext: (start: number, end: number) => Promise<Buffer>;
  /** Plage de clair, bornes INCLUSES (sémantique HTTP) ; absente = tout le fichier. */
  readonly range?: { readonly start: number; readonly end: number };
  /** Segments lus par appel à `readCiphertext` (16 = 1 Mio) : un seau ne paie pas une requête par segment. */
  readonly segmentsPerRead?: number;
};

/**
 * Ouvre un fichier scellé, entier ou par plage. Chaque segment est authentifié
 * avant que ses octets ne sortent ; la taille inscrite doit être celle que le
 * chiffré implique, sans quoi rien ne sort.
 */
export async function* openSealedRange(params: OpenSealedRangeParams): AsyncGenerator<Buffer> {
  const cs = params.ciphertextSegmentSize;
  assertSegmentSize(cs);
  const ciphertextSize = ciphertextSizeFor(params.plaintextSize, cs);
  const range = params.range ?? { start: 0, end: params.plaintextSize - 1 };
  if (params.plaintextSize === 0 && params.range === undefined) {
    yield* openWhole(params, ciphertextSize);
    return;
  }
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start || range.end >= params.plaintextSize) {
    throw new SealedFileError('range');
  }

  const header = await params.readCiphertext(0, SEALED_FILE_HEADER_LENGTH);
  const { key, prefix } = readHeader(params, header);
  const lastIndex = segmentCount(params.plaintextSize, cs) - 1;
  const from = locate(range.start, cs);
  const to = locate(range.end, cs);
  const batch = Math.max(1, params.segmentsPerRead ?? 16);
  try {
    for (let first = from.index; first <= to.index; first += batch) {
      const last = Math.min(to.index, first + batch - 1);
      const span = { start: segmentBounds(first, cs, ciphertextSize).start, end: segmentBounds(last, cs, ciphertextSize).end };
      const bytes = await params.readCiphertext(span.start, span.end);
      if (bytes.length !== span.end - span.start) throw new SealedFileError('short-read');
      for (let index = first; index <= last; index += 1) {
        const bounds = segmentBounds(index, cs, ciphertextSize);
        const segment = bytes.subarray(bounds.start - span.start, bounds.end - span.start);
        const plain = openSegment(key, prefix, index, index === lastIndex, segment);
        const sliceStart = index === from.index ? from.within : 0;
        const sliceEnd = index === to.index ? to.within + 1 : plain.length;
        yield plain.subarray(sliceStart, sliceEnd);
      }
    }
    if (to.index === lastIndex) await assertNothingAfter(params, ciphertextSize);
  } finally {
    key.fill(0);
  }
}

async function* openWhole(params: OpenSealedRangeParams, ciphertextSize: number): AsyncGenerator<Buffer> {
  const header = await params.readCiphertext(0, SEALED_FILE_HEADER_LENGTH);
  const { key, prefix } = readHeader(params, header);
  try {
    const segment = await params.readCiphertext(SEALED_FILE_HEADER_LENGTH, ciphertextSize);
    if (segment.length !== ciphertextSize - SEALED_FILE_HEADER_LENGTH) throw new SealedFileError('short-read');
    openSegment(key, prefix, 0, true, segment);
    await assertNothingAfter(params, ciphertextSize);
  } finally {
    key.fill(0);
  }
}

/** Des octets APRÈS le dernier segment : la taille inscrite ment, rien n'est admis. */
async function assertNothingAfter(params: OpenSealedRangeParams, ciphertextSize: number): Promise<void> {
  const trailing = await params.readCiphertext(ciphertextSize, ciphertextSize + 1);
  if (trailing.length > 0) throw new SealedFileError('size-mismatch');
}

function readHeader(params: SealedFileParams, header: Buffer): { key: Buffer; prefix: Buffer } {
  if (header.length !== SEALED_FILE_HEADER_LENGTH || header[0] !== SEALED_FILE_HEADER_LENGTH) throw new SealedFileError('malformed-header');
  const salt = header.subarray(1, 1 + KEY_BYTES);
  const prefix = Buffer.from(header.subarray(1 + KEY_BYTES, SEALED_FILE_HEADER_LENGTH));
  return { key: segmentKey(params, salt), prefix };
}
