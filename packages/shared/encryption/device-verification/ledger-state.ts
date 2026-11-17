/**
 * L'ÉTAT EFFECTIF du registre de confiance, calculé depuis soi (#18906, #19182).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 6.2
 * (pseudo-code « État effectif », inchangé en v5) :
 *
 *   ancres(v, M)   = v, puis de proche en proche le sujet de chaque approbation sponsor écrite par une ancre
 *                    (sujet ≠ auteur, clé non morte, sujet qui n'est pas une copie de v) — F = 0
 *   membres(v, M)  = plus petit point fixe : une approbation de x COMPTE si son auteur est membre, ≠ x, clé(x) ∉ M,
 *                    x n'est pas une copie de v, et seq ≥ F(auteur) ; F(x) = plus petit fromSeq de ce qui compte
 *   admis          = membres(moi, ∅) ; comptées = pierres tombales de moi, ou d'un admis à un rang ≥ F_adm(auteur)
 *   effectifs      = membres(moi, mortes), recalculés sans les clés des places en conflit, SAUF MA CLÉ
 *   ancres étrangères = z ∈ ancres(moi, ∅), avec clé(z) ∈ mortes ou z ∈ ancres(moi, M final), tel qu'une ancre VIVANTE
 *                    y ≠ z donne z ∉ membres(y, mortes \ {clé(z)}) — les pierres tombales COMPTENT (relecture v5, V5-1) :
 *                    une approbation posthume signée par la clé d'un appareil retiré n'admet personne
 *
 * Le point fixe est monotone (les membres ne font que s'ajouter, F ne fait que baisser) :
 * il ne dépend pas de l'ordre de calcul. Les tables de travail sont locales à chaque appel.
 */
import {
  compareApprovals,
  compareGenerations,
  compareLedgerEntries,
  generationId,
  generationOf,
  slotOf,
} from './ledger-entry.js';
import {
  isLedgerRevocation,
  ledgerEntryAuthor,
  type LedgerApproval,
  type LedgerEntry,
  type LedgerGeneration,
  type LedgerRevocation,
} from './ledger-signature.js';

/** Au-delà de 256 pierres tombales COMPTÉES, l'appareil refuse d'ajouter une approbation (§ 6.2, bornes locales). */
export const COUNTED_TOMBSTONES_LIMIT = 256;

export type LedgerViewpoint = {
  /** Le compte qui vérifie : 24 caractères hexadécimaux minuscules. */
  readonly userId: string;
  readonly generation: LedgerGeneration;
};

type Solution = {
  readonly anchors: ReadonlyMap<string, LedgerGeneration>;
  readonly members: ReadonlyMap<string, LedgerGeneration>;
  readonly claimedCopies: ReadonlyMap<string, LedgerGeneration>;
  readonly floor: (id: string) => number;
};

const anchorsFrom = (viewer: LedgerGeneration, approvals: readonly LedgerApproval[], deadKeys: ReadonlySet<string>, isCopy: (g: LedgerGeneration) => boolean): Map<string, LedgerGeneration> => {
  const anchors = new Map<string, LedgerGeneration>();
  const queue: LedgerGeneration[] = deadKeys.has(viewer.identityKey) ? [] : [generationOf(viewer)];
  while (queue.length > 0) {
    const anchor = queue.shift() as LedgerGeneration;
    const id = generationId(anchor);
    if (anchors.has(id)) continue;
    anchors.set(id, anchor);
    approvals
      .filter((a) => a.sponsor === true && generationId(a.approvedBy) === id && generationId(a) !== id && !deadKeys.has(a.identityKey) && !isCopy(a))
      .forEach((a) => queue.push(generationOf(a)));
  }
  return anchors;
};

/**
 * `ancres(v, M)` et `membres(v, M)` vus DEPUIS `viewer` (moi, ou une de mes ancres pour les
 * ancres étrangères), et les COPIES réclamées : les générations qui portent la clé de
 * `viewer` sous une autre place et qu'une approbation qui compterait vise.
 */
function solveFrom(viewer: LedgerGeneration, approvals: readonly LedgerApproval[], deadKeys: ReadonlySet<string>): Solution {
  const viewerId = generationId(viewer);
  const isCopy = (g: LedgerGeneration): boolean => g.identityKey === viewer.identityKey && generationId(g) !== viewerId;
  const anchors = anchorsFrom(viewer, approvals, deadKeys, isCopy);
  const members = new Map(anchors);
  const floors = new Map<string, number>([...anchors.keys()].map((id) => [id, 0]));
  const floor = (id: string): number => floors.get(id) ?? Number.POSITIVE_INFINITY;
  const counts = (a: LedgerApproval): boolean => {
    const author = generationId(a.approvedBy);
    return members.has(author) && author !== generationId(a) && !deadKeys.has(a.identityKey) && a.seq >= floor(author);
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of approvals) {
      if (isCopy(a) || !counts(a)) continue;
      const subject = generationId(a);
      const contribution = a.method === 'migrated' ? 0 : (a.fromSeq ?? 0);
      if (!members.has(subject) || contribution < floor(subject)) {
        members.set(subject, members.get(subject) ?? generationOf(a));
        floors.set(subject, Math.min(contribution, floor(subject)));
        changed = true;
      }
    }
  }
  const claimedCopies = new Map(approvals.filter((a) => isCopy(a) && counts(a)).map((a) => [generationId(a), generationOf(a)] as const));
  return { anchors, members, claimedCopies, floor };
}

const approvalsOf = (entries: readonly LedgerEntry[]): LedgerApproval[] =>
  entries.filter((entry): entry is LedgerApproval => !isLedgerRevocation(entry) && entry.method !== 'self');

/** Les auteurs ADMIS (membres, pierres tombales ignorées) depuis `viewer` : seules leurs entrées ont un effet. */
export const admittedAuthors = (viewer: LedgerGeneration, entries: readonly LedgerEntry[]): ReadonlySet<string> =>
  new Set(solveFrom(viewer, approvalsOf(entries), new Set()).members.keys());

export type EffectiveGeneration = LedgerGeneration & {
  /** « parrain » pour une ancre autre que moi ; sinon la place de l'auteur de la plus petite approbation qui compte ; `null` pour moi. */
  readonly addedBy: string | null;
};

export type ForeignAnchor = LedgerGeneration & { readonly dead: boolean };

export type LedgerState = {
  readonly effective: readonly EffectiveGeneration[];
  readonly conflicts: readonly string[];
  readonly revokedSelf: boolean;
  readonly sponsorsRevoked: readonly string[];
  readonly foreignAnchors: readonly ForeignAnchor[];
  readonly cloneGenerations: readonly string[];
  readonly proposed: readonly LedgerEntry[];
  readonly approvalsBlocked: boolean;
  /** Entrées dont l'auteur n'est pas admis : sans effet sur tout ce qui précède. */
  readonly reserved: number;
  /** Clés visées par une pierre tombale COMPTÉE. */
  readonly deadKeys: readonly string[];
  /** Générations nommées dans mon registre (sujets et auteurs) dont la clé est morte, moi exclu — place ET clé. */
  readonly deadGenerations: readonly LedgerGeneration[];
  /** Les entrées RETENUES : celles d'un auteur admis, dans l'ordre de leur identité. */
  readonly retained: readonly LedgerEntry[];
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort();

/** Les places qui portent au moins deux clés parmi les effectifs et les copies réclamées. */
function conflictingSlots(solution: Solution): string[] {
  const keysBySlot = [...solution.members.values(), ...solution.claimedCopies.values()].reduce((bySlot, g) => {
    const keys = bySlot.get(slotOf(g)) ?? new Set<string>();
    return new Map(bySlot).set(slotOf(g), new Set([...keys, g.identityKey]));
  }, new Map<string, ReadonlySet<string>>());
  return [...keysBySlot.entries()].filter(([, keys]) => keys.size > 1).map(([slot]) => slot).sort();
}

/**
 * L'état effectif, calculé depuis `local.generation` sur les seules entrées rangées (§ 6.2).
 * Aucune provenance n'entre ici : une entrée vaut par sa signature, vérifiée à la réception.
 */
export function evaluateLedgerState(local: LedgerViewpoint, entries: readonly LedgerEntry[]): LedgerState {
  const me = generationId(local.generation);
  const approvals = approvalsOf(entries);
  const tombs = entries.filter(isLedgerRevocation);
  const admitted = solveFrom(local.generation, approvals, new Set());
  const counted = tombs.filter((t: LedgerRevocation) => {
    const author = generationId(t.revokedBy);
    return author === me || (admitted.members.has(author) && t.seq >= admitted.floor(author));
  });
  const dead = new Set(counted.map((t) => t.identityKey));
  const first = solveFrom(local.generation, approvals, dead);
  const conflicts = conflictingSlots(first);
  const conflictKeys = [...first.members.values()].filter((g) => conflicts.includes(slotOf(g)) && g.identityKey !== local.generation.identityKey).map((g) => g.identityKey);
  const effective = conflictKeys.length > 0 ? solveFrom(local.generation, approvals, new Set([...dead, ...conflictKeys])) : first;
  const revokedSelf = dead.has(local.generation.identityKey);
  const addedBy = (g: LedgerGeneration): string | null => {
    const id = generationId(g);
    if (id === me) return null;
    if (effective.anchors.has(id)) return 'parrain';
    const counting = approvals
      .filter((a) => generationId(a) === id && effective.members.has(generationId(a.approvedBy)) && generationId(a.approvedBy) !== id && a.seq >= effective.floor(generationId(a.approvedBy)))
      .sort(compareApprovals);
    return counting[0] === undefined ? null : slotOf(counting[0].approvedBy);
  };
  const liveAnchors = revokedSelf ? [] : [...effective.anchors.values()].filter((y) => generationId(y) !== me);
  const admits = (y: LedgerGeneration, z: LedgerGeneration): boolean =>
    solveFrom(y, approvals, new Set([...dead].filter((key) => key !== z.identityKey))).members.has(generationId(z));
  const judged = (z: LedgerGeneration): boolean => dead.has(z.identityKey) || effective.anchors.has(generationId(z));
  const foreignAnchors = revokedSelf
    ? []
    : [...admitted.anchors.values()]
        .filter((z) => generationId(z) !== me && judged(z) && liveAnchors.some((y) => generationId(y) !== generationId(z) && !admits(y, z)))
        .map((z) => ({ ...generationOf(z), dead: dead.has(z.identityKey) }))
        .sort(compareGenerations);
  const proposed = [...approvals, ...tombs].filter((entry) => {
    const author = generationId(ledgerEntryAuthor(entry));
    return !effective.anchors.has(author) && effective.members.has(author) && entry.seq < effective.floor(author);
  });
  const named = entries.flatMap((entry) => [generationOf(entry), ledgerEntryAuthor(entry)]);
  return {
    effective: (revokedSelf ? [] : [...effective.members.values()]).map((g) => ({ ...g, addedBy: addedBy(g) })).sort(compareGenerations),
    conflicts,
    revokedSelf,
    sponsorsRevoked: uniqueSorted(approvals.filter((a) => a.sponsor === true && generationId(a.approvedBy) === me && dead.has(a.identityKey)).map(slotOf)),
    foreignAnchors,
    cloneGenerations: revokedSelf ? [] : uniqueSorted([...effective.claimedCopies.values()].map(slotOf)),
    proposed: [...proposed].sort(compareLedgerEntries),
    approvalsBlocked: counted.length > COUNTED_TOMBSTONES_LIMIT,
    reserved: entries.filter((entry) => !admitted.members.has(generationId(ledgerEntryAuthor(entry)))).length,
    deadKeys: [...dead].sort(),
    deadGenerations: [...new Map(named.filter((g) => dead.has(g.identityKey) && generationId(g) !== me).map((g) => [generationId(g), generationOf(g)] as const)).values()].sort(compareGenerations),
    retained: entries.filter((entry) => admitted.members.has(generationId(ledgerEntryAuthor(entry)))),
  };
}
