/**
 * LA RÉCEPTION d'un contenu du registre de confiance, en six temps, et son ÉVALUATION
 * (#18906, #19182).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 6.2 :
 *   0. JSON strict (le clair d'un pair) ;              3. signatures sous la clé de l'AUTEUR, avec MON compte ;
 *   1. forme de chaque entrée ;                        4. une entrée signée par MA clé reçue d'un autre : ignorée,
 *   2. au plus 32 approbations, les plus petites          alerte « clé copiée » si je ne la tiens pas ;
 *      selon l'ordre total, AVANT toute vérification ; 5. union (doublon : la plus petite), puis RÉSERVE bornée
 *      toutes les pierres tombales ;                      des auteurs non admis.
 * Une seule entrée mal formée, ou une seule signature fausse, refuse le contenu ENTIER.
 *
 * Ce module n'écrit rien et n'émet rien : l'ÉMISSION (§ 6.4), « confirmé », « peut admettre »
 * et la transaction (§ 4.6) sont en revue (#19183). Un magasin est une valeur : chaque
 * réception en rend un nouveau.
 */
import { compareApprovals, compareLedgerEntries, compareRevocations, generationId, ledgerEntryId, parseLedgerApproval, parseLedgerRevocation } from './ledger-entry.js';
import { parseStrictLedgerJson, type StrictLedgerJsonProblem } from './ledger-json.js';
import {
  isLedgerRevocation,
  ledgerEntryAuthor,
  ledgerSignedBytes,
  verifyLedgerEntrySignature,
  type LedgerApproval,
  type LedgerEntry,
  type LedgerRevocation,
  type LedgerSignatureVerifier,
} from './ledger-signature.js';
import { admittedAuthors, evaluateLedgerState, type LedgerState, type LedgerViewpoint } from './ledger-state.js';

/** Bornes d'un contenu à la réception (§ 6.2, temps 2) et de la réserve (temps 5). */
export const TRUST_LEDGER_BOUNDS = {
  approvalsPerContent: 32,
  revocationsPerContent: 32,
  reserveAuthors: 16,
  reservePerAuthor: 32,
} as const;

export type LedgerStore = {
  readonly entries: ReadonlyMap<string, LedgerEntry>;
  /** Ordre TOTAL de première réception de chaque identité (« reçue le plus tôt », réserve). */
  readonly arrival: ReadonlyMap<string, number>;
  readonly refusedContents: number;
  /** Approbations ignorées au-delà de 32 dans un contenu (l'écran le signale). */
  readonly overBound: readonly LedgerApproval[];
  /** Entrées signées par MA clé, reçues d'un autre, que je ne tiens pas : « la clé de cet appareil a peut-être été copiée ». */
  readonly cloneAlerts: ReadonlyMap<string, LedgerEntry>;
};

export type LedgerRefusal = { readonly stage: 'json'; readonly problem: StrictLedgerJsonProblem } | { readonly stage: 'form' } | { readonly stage: 'signature' } | { readonly stage: 'own-store' };

/**
 * Un contenu reçu : le clair TEXTE d'un pair (il passe l'analyseur strict), ou mes propres
 * entrées, relues de mon magasin scellé — elles se vérifient comme les autres.
 */
export type ReceivedLedgerContent = { readonly origin: 'peer'; readonly text: string } | { readonly origin: 'self'; readonly content: unknown };

export type LedgerReception = { readonly store: LedgerStore; readonly refusal: LedgerRefusal | null };

export const emptyLedgerStore = (): LedgerStore => ({ entries: new Map(), arrival: new Map(), refusedContents: 0, overBound: [], cloneAlerts: new Map() });

type ParsedContent = { readonly approvals: readonly LedgerApproval[]; readonly revocations: readonly LedgerRevocation[] };

const listOf = (value: unknown): readonly unknown[] | null => (value === undefined ? [] : Array.isArray(value) ? value : null);

/** Temps 1 : chaque entrée bien formée, ou le contenu entier est refusé. */
function parseContent(content: unknown): ParsedContent | null {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return null;
  const record = content as Record<string, unknown>;
  const approvals = listOf(record.approvals);
  const revocations = listOf(record.revocations);
  if (approvals === null || revocations === null) return null;
  const parsedApprovals = approvals.map(parseLedgerApproval);
  const parsedRevocations = revocations.map(parseLedgerRevocation);
  if (parsedApprovals.some((parsed) => parsed.entry === null) || parsedRevocations.some((parsed) => parsed.entry === null)) return null;
  return {
    approvals: parsedApprovals.map((parsed) => parsed.entry as LedgerApproval),
    revocations: parsedRevocations.map((parsed) => parsed.entry as LedgerRevocation),
  };
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, index) => byte === b[index]);

const sameSignedContent = (userId: string, a: LedgerEntry, b: LedgerEntry): boolean =>
  isLedgerRevocation(a) === isLedgerRevocation(b) && sameBytes(ledgerSignedBytes(userId, a), ledgerSignedBytes(userId, b));

/**
 * Temps 5, la RÉSERVE : une entrée d'un auteur non admis n'a aucun effet ; on en garde au plus
 * 32 par auteur et 16 auteurs, en évinçant la PREMIÈRE reçue (pour un 17e auteur : l'auteur
 * entier dont la plus ancienne entrée gardée a été reçue le plus tôt).
 */
function boundReserve(local: LedgerViewpoint, entries: ReadonlyMap<string, LedgerEntry>, arrival: ReadonlyMap<string, number>): Map<string, LedgerEntry> {
  const admitted = admittedAuthors(local.generation, [...entries.values()]);
  const order = (id: string): number => arrival.get(id) ?? Number.POSITIVE_INFINITY;
  const byAuthor = [...entries.entries()]
    .filter(([, entry]) => !admitted.has(generationId(ledgerEntryAuthor(entry))))
    .reduce((groups, [id, entry]) => {
      const author = generationId(ledgerEntryAuthor(entry));
      return new Map(groups).set(author, [...(groups.get(author) ?? []), id]);
    }, new Map<string, readonly string[]>());
  const kept = [...byAuthor.values()]
    .map((ids) => [...ids].sort((a, b) => order(a) - order(b)).slice(-TRUST_LEDGER_BOUNDS.reservePerAuthor))
    .filter((ids) => ids.length > 0)
    .sort((a, b) => order(a[0] as string) - order(b[0] as string));
  const evicted = new Set([
    ...[...byAuthor.values()].flat(),
  ].filter((id) => !kept.slice(-TRUST_LEDGER_BOUNDS.reserveAuthors).some((ids) => ids.includes(id))));
  return new Map([...entries.entries()].filter(([id]) => !evicted.has(id)));
}

const refuse = (store: LedgerStore, refusal: LedgerRefusal): LedgerReception => ({ store: { ...store, refusedContents: store.refusedContents + 1 }, refusal });

/** Reçoit UN contenu (§ 6.2, temps 0 à 5) et rend le nouveau magasin, ou le refus et le magasin inchangé (compteur de refus compris). */
export function receiveLedgerContent(local: LedgerViewpoint, store: LedgerStore, received: ReceivedLedgerContent, verify: LedgerSignatureVerifier): LedgerReception {
  const json = received.origin === 'peer' ? parseStrictLedgerJson(received.text) : { ok: true as const, value: received.content };
  if (!json.ok) return refuse(store, { stage: 'json', problem: json.problem });
  const content = parseContent(json.value);
  if (content === null) return refuse(store, { stage: 'form' });
  const approvals = [...content.approvals].sort(compareApprovals);
  const kept = approvals.slice(0, TRUST_LEDGER_BOUNDS.approvalsPerContent);
  const all: readonly LedgerEntry[] = [...kept, ...[...content.revocations].sort(compareRevocations)];
  if (!all.every((entry) => verifyLedgerEntrySignature(verify, local.userId, entry))) return refuse(store, { stage: 'signature' });
  const me = generationId(local.generation);
  if (received.origin === 'self' && all.some((entry) => generationId(ledgerEntryAuthor(entry)) !== me)) return refuse(store, { stage: 'own-store' });
  const mine = (entry: LedgerEntry): boolean => received.origin === 'peer' && ledgerEntryAuthor(entry).identityKey === local.generation.identityKey;
  const held = (entry: LedgerEntry): boolean => {
    const prior = generationId(ledgerEntryAuthor(entry)) === me ? store.entries.get(ledgerEntryId(entry)) : undefined;
    return prior !== undefined && sameSignedContent(local.userId, prior, entry);
  };
  const cloneAlerts = all
    .filter((entry) => mine(entry) && !held(entry))
    .reduce((alerts, entry) => {
      const prior = alerts.get(ledgerEntryId(entry));
      return prior !== undefined && compareLedgerEntries(prior, entry) <= 0 ? alerts : new Map(alerts).set(ledgerEntryId(entry), entry);
    }, store.cloneAlerts);
  const accepted = all.filter((entry) => !mine(entry));
  const arrival = accepted.reduce((order, entry) => (order.has(ledgerEntryId(entry)) ? order : new Map(order).set(ledgerEntryId(entry), order.size)), store.arrival);
  const merged = accepted.reduce((entries, entry) => {
    const prior = entries.get(ledgerEntryId(entry));
    return prior !== undefined && compareLedgerEntries(prior, entry) <= 0 ? entries : new Map(entries).set(ledgerEntryId(entry), entry);
  }, store.entries);
  return {
    refusal: null,
    store: {
      entries: boundReserve(local, merged, arrival),
      arrival,
      refusedContents: store.refusedContents,
      overBound: [...store.overBound, ...approvals.slice(TRUST_LEDGER_BOUNDS.approvalsPerContent)],
      cloneAlerts,
    },
  };
}

export type LedgerEvaluation = LedgerState & {
  readonly refusedContents: number;
  readonly overBound: readonly LedgerApproval[];
  readonly cloneAlerts: readonly LedgerEntry[];
};

/** L'état du magasin (§ 6.2), avec ce que la réception a signalé. */
export function evaluateLedger(local: LedgerViewpoint, store: LedgerStore): LedgerEvaluation {
  return {
    ...evaluateLedgerState(local, [...store.entries.values()]),
    refusedContents: store.refusedContents,
    overBound: [...store.overBound].sort(compareLedgerEntries),
    cloneAlerts: [...store.cloneAlerts.values()].sort(compareLedgerEntries),
  };
}

/** Reçoit les contenus dans l'ordre donné, depuis un magasin vide, et évalue. */
export function replayLedger(local: LedgerViewpoint, contents: readonly ReceivedLedgerContent[], verify: LedgerSignatureVerifier): LedgerEvaluation {
  return evaluateLedger(
    local,
    contents.reduce((store, content) => receiveLedgerContent(local, store, content, verify).store, emptyLedgerStore()),
  );
}
