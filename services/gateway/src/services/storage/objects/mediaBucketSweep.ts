import { mediaRowStorageKeys, type MirrorRowSource } from './mediaMirror';

export type ListedObject = { readonly key: string; readonly lastModified: Date | null };

/** Ce que le balayage demande du seau : l'énumérer et en effacer une clé. */
export type ObjectLister = { list(): AsyncIterable<ListedObject> };
export type ObjectRemover = { remove(key: string): Promise<void> };

export type SweepCounts = { readonly kept: number; readonly removed: number; readonly 'would-remove': number; readonly young: number; readonly failed: number };

export type SweepReport =
  | { readonly kind: 'swept'; readonly counts: SweepCounts }
  | { readonly kind: 'refused'; readonly reason: 'no-referenced-key' | 'too-many-removals' };

/** Au-delà de cette part du seau, un passage est une configuration fausse plus probablement qu'une purge. */
const MAX_REMOVAL_SHARE = 0.5;

/**
 * Toutes les clés que les lignes vivantes nomment. Une page en échec fait
 * échouer la collecte : un ensemble PARTIEL ferait effacer des copies vivantes.
 */
export async function collectReferencedKeys(params: {
  readonly sources: readonly MirrorRowSource[];
  readonly uploadRoot: string;
  readonly pageSize: number;
}): Promise<ReadonlySet<string>> {
  const keys = new Set<string>();
  for (const source of params.sources) {
    let after: string | null = null;
    for (;;) {
      const rows = await source.page(after, params.pageSize);
      rows.forEach((row) => mediaRowStorageKeys(row, params.uploadRoot).forEach((key) => keys.add(key)));
      if (rows.length < params.pageSize) break;
      after = rows[rows.length - 1]!.id;
    }
  }
  return keys;
}

/**
 * Le seau ne garde que ce qu'une ligne vivante nomme (#11267). Deux passes :
 * l'énumération décide, puis seulement l'effacement — un refus n'a rien
 * effacé. Un objet plus récent que `graceMs` (ou sans date) est épargné :
 * l'écriture en double précède la ligne qui le nommera.
 */
export async function sweepBucket(params: {
  readonly lister: ObjectLister;
  readonly remover: ObjectRemover;
  readonly referenced: ReadonlySet<string>;
  readonly now: Date;
  readonly graceMs: number;
  readonly apply: boolean;
  readonly log?: (line: string) => void;
}): Promise<SweepReport> {
  if (params.referenced.size === 0) return { kind: 'refused', reason: 'no-referenced-key' };

  const listed: ListedObject[] = [];
  for await (const object of params.lister.list()) listed.push(object);

  const cutoff = params.now.getTime() - params.graceMs;
  const isYoung = (object: ListedObject) => object.lastModified === null || object.lastModified.getTime() > cutoff;
  const unreferenced = listed.filter((object) => !params.referenced.has(object.key));
  const doomed = unreferenced.filter((object) => !isYoung(object));
  if (doomed.length > listed.length * MAX_REMOVAL_SHARE) return { kind: 'refused', reason: 'too-many-removals' };

  const base = { kept: listed.length - unreferenced.length, young: unreferenced.length - doomed.length };
  if (!params.apply) return { kind: 'swept', counts: { ...base, removed: 0, 'would-remove': doomed.length, failed: 0 } };

  const outcomes = await doomed.reduce<Promise<{ removed: number; failed: number }>>(async (pending, object) => {
    const tally = await pending;
    try {
      await params.remover.remove(object.key);
      params.log?.(`effacée du seau : ${object.key}`);
      return { ...tally, removed: tally.removed + 1 };
    } catch (error: unknown) {
      params.log?.(`échec d'effacement : ${object.key} — ${error instanceof Error ? error.message : String(error)}`);
      return { ...tally, failed: tally.failed + 1 };
    }
  }, Promise.resolve({ removed: 0, failed: 0 }));

  return { kind: 'swept', counts: { ...base, ...outcomes, 'would-remove': 0 } };
}
