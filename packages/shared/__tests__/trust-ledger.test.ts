// packages/shared/__tests__/trust-ledger.test.ts
//
// #19182 (#18906) — l'ÉVALUATION du registre de confiance de mes appareils, rejouée sur les
// cas communs : spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`,
// § 6.2 (réception en six temps, réserve, copies, conflits, ancres étrangères — pierres
// tombales comptées depuis la relecture v5, V5-1 —, état effectif, bornes locales), et
// `fixtures/e2ee-device-verification/trust-ledger-v1.cases.json`.
//
// Chaque cas est rejoué dans l'ordre publié (attendus comparés champ par champ), puis dans
// tous les ordres d'arrivée (au-delà de six contenus reçus : l'ordre inverse, chaque rotation
// et 24 ordres d'une graine fixe, comme le générateur) et chaque contenu en double. Les
// attendus d'ÉMISSION et d'ADMISSION (`confirmed`, `mayAdmit`, `transmits`) sont EN REVUE
// (#19183) : ils ne sont pas rejoués ici.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@signalapp/libsignal-client';
import {
  compareApprovals,
  compareRevocations,
  generationId,
  ledgerEntryAuthor,
  parseLedgerApproval,
  parseLedgerRevocation,
  replayLedger,
  slotOf,
  type LedgerApproval,
  type LedgerEvaluation,
  type LedgerGeneration,
  type LedgerRevocation,
  type LedgerSignatureVerifier,
  type ReceivedLedgerContent,
} from '../encryption/device-verification/index.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/e2ee-device-verification/', import.meta.url));

type Message = { readonly from?: unknown; readonly approvals?: readonly unknown[]; readonly revocations?: readonly unknown[]; readonly raw?: string };
type Case = {
  readonly name: string;
  readonly local: { readonly userId: string; readonly generation: LedgerGeneration; readonly root: boolean };
  readonly messages: readonly Message[];
  readonly emissionInput?: unknown;
  readonly expected: Record<string, unknown>;
};
type Ledger = {
  readonly cases: readonly Case[];
  readonly totalOrder: { readonly approvals: readonly unknown[]; readonly expectedSorted: readonly unknown[]; readonly revocations: readonly unknown[]; readonly expectedSortedRevocations: readonly unknown[] };
};

const ledger = JSON.parse(readFileSync(join(FIXTURES, 'trust-ledger-v1.cases.json'), 'utf8')) as Ledger;

const memo = new Map<string, boolean>();
/** libsignal, mémorisé par (clé, octets, signature) : chaque cas se rejoue des centaines de fois. */
const verify: LedgerSignatureVerifier = (identityKey, message, signature) => {
  const key = `${Buffer.from(identityKey).toString('hex')}|${Buffer.from(message).toString('hex')}|${Buffer.from(signature).toString('hex')}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  const verdict = PublicKey.deserialize(identityKey).verify(message, signature);
  memo.set(key, verdict);
  return verdict;
};

const contentOf = (message: Message): ReceivedLedgerContent => {
  if (message.from === 'self') return { origin: 'self', content: { approvals: message.approvals ?? [], revocations: message.revocations ?? [] } };
  if (typeof message.raw === 'string') return { origin: 'peer', text: message.raw };
  return { origin: 'peer', text: JSON.stringify({ approvals: message.approvals ?? [], revocations: message.revocations ?? [] }) };
};

const permutationsOf = <T>(items: readonly T[]): T[][] =>
  items.length <= 1 ? [[...items]] : items.flatMap((item, index) => permutationsOf([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));

/** Les ordres du générateur : tous jusqu'à six contenus reçus ; au-delà, l'inverse, chaque rotation et 24 tirages d'une graine fixe (xorshift32). */
function ordersOf<T>(received: readonly T[], name: string): T[][] {
  if (received.length <= 6) return permutationsOf(received);
  const seed = { value: [...name].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 2166136261) || 1 };
  const next = (): number => {
    seed.value ^= seed.value << 13;
    seed.value >>>= 0;
    seed.value ^= seed.value >>> 17;
    seed.value ^= seed.value << 5;
    seed.value >>>= 0;
    return seed.value / 2 ** 32;
  };
  const shuffled = Array.from({ length: 24 }, () => {
    const order = [...received];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [order[i], order[j]] = [order[j] as T, order[i] as T];
    }
    return order;
  });
  const rotations = received.map((_, k) => [...received.slice(k), ...received.slice(0, k)]);
  return [[...received].reverse(), ...rotations, ...shuffled];
}

const replay = (entry: Case, messages: readonly Message[]): LedgerEvaluation => replayLedger(entry.local, messages.map(contentOf), verify);

/** Ce qui ne doit dépendre ni de l'ordre d'arrivée ni des doublons (les alertes, en nombre seulement). */
const stable = (result: LedgerEvaluation): string =>
  JSON.stringify({
    effective: result.effective,
    conflicts: result.conflicts,
    revokedSelf: result.revokedSelf,
    sponsorsRevoked: result.sponsorsRevoked,
    foreignAnchors: result.foreignAnchors,
    cloneGenerations: result.cloneGenerations,
    proposed: result.proposed,
    retained: [...result.retained].map((entry) => JSON.stringify(entry)).sort(),
    cloneAlerts: result.cloneAlerts.length,
    approvalsBlocked: result.approvalsBlocked,
    reserved: result.reserved,
    deadGenerations: result.deadGenerations,
  });

const EVALUATION_FIELDS = [
  'effective',
  'conflicts',
  'revokedSelf',
  'sponsorsRevoked',
  'foreignAnchors',
  'cloneGenerations',
  'proposed',
  'refusedContents',
  'overBound',
  'cloneAlerts',
  'approvalsBlocked',
  'reserved',
] as const;

describe('les cas communs du registre : attendus d’évaluation (§ 6.2)', () => {
  it('85 cas, dont celui de la relecture v5 (V5-1)', () => {
    expect(ledger.cases.length).toBe(85);
    expect(ledger.cases.some((entry) => entry.name === 'NEUF-1-approbation-posthume-d-une-cle-retiree-vue-de-N')).toBe(true);
  });

  it.each(ledger.cases.map((entry) => [entry.name, entry] as const))('%s', (_name, entry) => {
    const own = entry.messages.filter((message) => message.from === 'self');
    const received = entry.messages.filter((message) => message.from !== 'self');
    const result = replay(entry, [...own, ...received]);
    EVALUATION_FIELDS.forEach((field) => expect({ field, value: result[field] }).toEqual({ field, value: entry.expected[field] }));
    if (entry.expected.deadGenerations !== undefined) expect(result.deadGenerations).toEqual(entry.expected.deadGenerations);
    const reference = stable(result);
    ordersOf(received, entry.name).forEach((order) => expect(stable(replay(entry, [...own, ...order]))).toBe(reference));
    expect(stable(replay(entry, [...own, ...received, ...received]))).toBe(reference);
  }, 60_000);
});

describe('des témoins qui rougissent (§ 6.2)', () => {
  const byName = (name: string): Case => ledger.cases.find((entry) => entry.name === name) as Case;

  it('la même approbation reçue sous deux signatures valides reste UNE entrée', () => {
    const entry = byName('doublon-signe-deux-fois-une-seule-entree');
    const result = replay(entry, entry.messages);
    expect(result.retained.filter((stored) => !('revokedBy' in stored) && slotOf(stored) === '3:15022' && stored.method !== 'self').length).toBe(1);
  });

  it('un octet de signature retouché dans un contenu reçu refuse le contenu ENTIER', () => {
    const entry = byName('propagation-par-un-appareil-effectif');
    const tampered = entry.messages.map((message, index) => {
      if (index !== 1) return message;
      const [first, ...rest] = message.approvals as readonly { readonly sig: string }[];
      const sig = Buffer.from(first?.sig ?? '', 'base64');
      sig[5] = (sig[5] ?? 0) ^ 0x01;
      return { ...message, approvals: [{ ...first, sig: sig.toString('base64') }, ...rest] };
    });
    const result = replay(entry, tampered);
    expect(result.refusedContents).toBe(1);
    expect(result.effective.map(slotOf)).toEqual(['1:4211', '2:9054']);
  });

  it('jugée en ignorant les pierres tombales (lecture v5), l’ancre étrangère de NEUF-1 disparaîtrait : le cas la tient', () => {
    const entry = byName('NEUF-1-approbation-posthume-d-une-cle-retiree-vue-de-N');
    const result = replay(entry, entry.messages);
    expect(result.foreignAnchors.map((anchor) => `${slotOf(anchor)}${anchor.dead ? '!' : ''}`)).toEqual(['5:777']);
    expect(result.deadKeys.length).toBe(2);
  });

  it('une entrée signée par MA clé, reçue d’un autre, n’est jamais rangée', () => {
    const entry = byName('cle-copiee-entree-a-mon-nom-valide');
    const result = replay(entry, entry.messages);
    expect(result.cloneAlerts.length).toBe(1);
    expect(result.retained.some((stored) => generationId(ledgerEntryAuthor(stored)) !== generationId(entry.local.generation) && ledgerEntryAuthor(stored).identityKey === entry.local.generation.identityKey)).toBe(false);
  });
});

describe('l’ordre total de départage (§ 6.2)', () => {
  const parseApproval = (value: unknown): LedgerApproval => parseLedgerApproval(value).entry as LedgerApproval;
  const parseRevocation = (value: unknown): LedgerRevocation => parseLedgerRevocation(value).entry as LedgerRevocation;

  it('les approbations', () => {
    const sorted = ledger.totalOrder.approvals.map(parseApproval).sort(compareApprovals);
    expect(sorted).toEqual(ledger.totalOrder.expectedSorted.map(parseApproval));
  });

  it('les pierres tombales', () => {
    const sorted = ledger.totalOrder.revocations.map(parseRevocation).sort(compareRevocations);
    expect(sorted).toEqual(ledger.totalOrder.expectedSortedRevocations.map(parseRevocation));
  });
});
