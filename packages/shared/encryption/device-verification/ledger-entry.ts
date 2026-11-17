/**
 * LA FORME d'une entrée du registre de confiance, son IDENTITÉ et l'ORDRE TOTAL (#18906, #19182).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 6.1 et
 * § 6.2 (temps 1, ordre total). Une entrée reçue est d'abord une valeur inconnue : elle n'entre
 * dans le registre que bien formée, et réduite à ses champs connus — un champ inconnu est
 * ignoré, jamais refusé, et n'entre pas dans les octets signés.
 */
import { canonicalBase64, utf8Bytes } from './descriptor.js';
import {
  isLedgerGeneration,
  isLedgerRevocation,
  LEDGER_METHODS,
  ledgerSignatureBytes,
  type LedgerApproval,
  type LedgerEntry,
  type LedgerGeneration,
  type LedgerMethod,
  type LedgerRevocation,
} from './ledger-signature.js';

export type LedgerEntryProblem =
  | 'type'
  | 'generation'
  | 'seq'
  | 'sig'
  | 'approvedAt'
  | 'revokedAt'
  | 'method'
  | 'self'
  | 'self-seq'
  | 'fromSeq'
  | 'sponsor'
  | 'kind';

export type ParsedLedgerEntry<T extends LedgerEntry> = { readonly entry: T; readonly problem: null } | { readonly entry: null; readonly problem: LedgerEntryProblem };

const METHODS: ReadonlySet<string> = new Set(LEDGER_METHODS);
const WITH_FROM_SEQ: ReadonlySet<LedgerMethod> = new Set(['sas', 'qr', 'reattested']);
const WITH_SPONSOR: ReadonlySet<LedgerMethod> = new Set(['sas', 'qr']);

const isSafeAtLeast = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

export const generationOf = (value: LedgerGeneration): LedgerGeneration => ({
  deviceId: value.deviceId,
  registrationId: value.registrationId,
  identityKey: value.identityKey,
});

/** L'identifiant d'une génération : place, `registrationId` et clé (base64 canonique, donc une seule écriture). */
export const generationId = (generation: LedgerGeneration): string => `${generation.deviceId}:${generation.registrationId}:${generation.identityKey}`;

/** La place d'une génération, telle que les attendus et l'écran la nomment : `deviceId:registrationId`. */
export const slotOf = (generation: LedgerGeneration): string => `${generation.deviceId}:${generation.registrationId}`;

/**
 * L'identité d'une entrée (§ 6.1) : une approbation est désignée par sa génération ET son
 * auteur ; une pierre tombale par la CLÉ qu'elle vise et son auteur. La signature n'en fait
 * pas partie : la même entrée signée deux fois reste UNE entrée.
 */
export const ledgerEntryId = (entry: LedgerEntry): string =>
  isLedgerRevocation(entry)
    ? `T|${entry.identityKey}|${generationId(entry.revokedBy)}`
    : `A|${generationId(entry)}|${generationId(entry.approvedBy)}`;

const fail = <T extends LedgerEntry>(problem: LedgerEntryProblem): ParsedLedgerEntry<T> => ({ entry: null, problem });

/** Les champs communs : sujet et auteur bien formés, rang, signature de la forme du § 6.1. */
function commonProblem(record: Record<string, unknown>, author: unknown): LedgerEntryProblem | null {
  const generationsWellFormed = [record, author].every((generation: unknown) => isLedgerGeneration(generation));
  if (!generationsWellFormed) return 'generation';
  if (!isSafeAtLeast(record.seq, 1)) return 'seq';
  return ledgerSignatureBytes(record.sig) === null ? 'sig' : null;
}

/** Une approbation reçue (temps 1 du § 6.2) : bien formée, réduite à ses champs connus — ou la raison du refus. */
export function parseLedgerApproval(value: unknown): ParsedLedgerEntry<LedgerApproval> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('type');
  const record = value as Record<string, unknown>;
  if ('revokedBy' in record) return fail('kind');
  const common = commonProblem(record, record.approvedBy);
  if (common !== null) return fail(common);
  const subject = generationOf(record as LedgerGeneration);
  const author = generationOf(record.approvedBy as LedgerGeneration);
  if (!isSafeAtLeast(record.approvedAt, 0)) return fail('approvedAt');
  if (typeof record.method !== 'string' || !METHODS.has(record.method)) return fail('method');
  const method = record.method as LedgerMethod;
  if ((method === 'self') !== (generationId(subject) === generationId(author))) return fail('self');
  if (method === 'self' && record.seq !== 1) return fail('self-seq');
  if (WITH_FROM_SEQ.has(method) !== (record.fromSeq !== undefined)) return fail('fromSeq');
  if (record.fromSeq !== undefined && !isSafeAtLeast(record.fromSeq, 1)) return fail('fromSeq');
  if (record.sponsor !== undefined && (record.sponsor !== true || !WITH_SPONSOR.has(method))) return fail('sponsor');
  return {
    problem: null,
    entry: {
      ...subject,
      approvedBy: author,
      approvedAt: record.approvedAt,
      method,
      seq: record.seq as number,
      ...(record.fromSeq !== undefined ? { fromSeq: record.fromSeq as number } : {}),
      ...(record.sponsor === true ? { sponsor: true as const } : {}),
      sig: record.sig as string,
    },
  };
}

/** Une pierre tombale reçue (temps 1 du § 6.2) : bien formée, réduite à ses champs connus — ou la raison du refus. */
export function parseLedgerRevocation(value: unknown): ParsedLedgerEntry<LedgerRevocation> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('type');
  const record = value as Record<string, unknown>;
  if ('approvedBy' in record) return fail('kind');
  const common = commonProblem(record, record.revokedBy);
  if (common !== null) return fail(common);
  if (!isSafeAtLeast(record.revokedAt, 0)) return fail('revokedAt');
  return {
    problem: null,
    entry: {
      ...generationOf(record as LedgerGeneration),
      revokedBy: generationOf(record.revokedBy as LedgerGeneration),
      revokedAt: record.revokedAt,
      seq: record.seq as number,
      sig: record.sig as string,
    },
  };
}

const compareNumbers = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

const compareByteArrays = (a: Uint8Array, b: Uint8Array): number => {
  const length = Math.min(a.length, b.length);
  const differing = Array.from({ length }, (_, index) => index).find((index) => a[index] !== b[index]);
  return differing === undefined ? compareNumbers(a.length, b.length) : compareNumbers(a[differing] ?? 0, b[differing] ?? 0);
};

/** Deux chaînes base64 comparées par leurs OCTETS décodés (§ 6.2), jamais par leur texte. */
export const compareBase64 = (a: string, b: string): number => compareByteArrays(canonicalBase64(a) ?? new Uint8Array(), canonicalBase64(b) ?? new Uint8Array());

export const compareGenerations = (a: LedgerGeneration, b: LedgerGeneration): number =>
  compareNumbers(a.deviceId, b.deviceId) || compareNumbers(a.registrationId, b.registrationId) || compareBase64(a.identityKey, b.identityKey);

/**
 * Ordre total des approbations (§ 6.2) : `approvedAt`, `approvedBy` (place, `registrationId`,
 * clé en octets), `method` en octets UTF-8, `seq`, `fromSeq` (absent = 0), `sponsor` (absent
 * d'abord), le sujet, puis la signature en octets.
 */
export const compareApprovals = (a: LedgerApproval, b: LedgerApproval): number =>
  compareNumbers(a.approvedAt, b.approvedAt) ||
  compareGenerations(a.approvedBy, b.approvedBy) ||
  compareByteArrays(utf8Bytes(a.method), utf8Bytes(b.method)) ||
  compareNumbers(a.seq, b.seq) ||
  compareNumbers(a.fromSeq ?? 0, b.fromSeq ?? 0) ||
  compareNumbers(a.sponsor === true ? 1 : 0, b.sponsor === true ? 1 : 0) ||
  compareGenerations(a, b) ||
  compareBase64(a.sig, b.sig);

/** Ordre total des pierres tombales (§ 6.2) : `revokedAt`, `revokedBy`, `seq`, la génération retirée, la signature. */
export const compareRevocations = (a: LedgerRevocation, b: LedgerRevocation): number =>
  compareNumbers(a.revokedAt, b.revokedAt) ||
  compareGenerations(a.revokedBy, b.revokedBy) ||
  compareNumbers(a.seq, b.seq) ||
  compareGenerations(a, b) ||
  compareBase64(a.sig, b.sig);

/** Les approbations d'abord, puis les pierres tombales, chacune selon son ordre total. */
export function compareLedgerEntries(a: LedgerEntry, b: LedgerEntry): number {
  if (isLedgerRevocation(a) && isLedgerRevocation(b)) return compareRevocations(a, b);
  if (!isLedgerRevocation(a) && !isLedgerRevocation(b)) return compareApprovals(a, b);
  return isLedgerRevocation(a) ? 1 : -1;
}

