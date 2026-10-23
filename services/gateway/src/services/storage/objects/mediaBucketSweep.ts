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
 * Le seau ne garde que ce qu'une ligne vivante nomme (#11267). Deux passes EN
 * FLUX, jamais le seau entier en mémoire (audit D5) : la première compte et
 * décide, la seconde efface — un refus n'a rien effacé. Seules les clés
 * vivantes de la base sont tenues en mémoire. Un objet plus récent que `graceMs` (ou sans date) est épargné :
 * l'écriture en double précède la ligne qui le nommera.
 */
export async function sweepBucket(params: {
  readonly lister: ObjectLister;
  readonly remover: ObjectRemover;
  readonly referenced: ReadonlySet<string>;
  readonly now: Date;
  readonly graceMs: number;
  readonly apply: boolean;
  /** La sortie documentée du refus « plus de la moitié » : une purge massive se demande, elle ne se devine pas. */
  readonly allowMassRemoval?: boolean;
  readonly log?: (line: string) => void;
}): Promise<SweepReport> {
  if (params.referenced.size === 0) return { kind: 'refused', reason: 'no-referenced-key' };

  const cutoff = params.now.getTime() - params.graceMs;
  const isYoung = (object: ListedObject) => object.lastModified === null || object.lastModified.getTime() > cutoff;
  const isDoomed = (object: ListedObject) => !params.referenced.has(object.key) && !isYoung(object);

  let listed = 0;
  let unreferenced = 0;
  let doomed = 0;
  for await (const object of params.lister.list()) {
    listed += 1;
    if (params.referenced.has(object.key)) continue;
    unreferenced += 1;
    if (!isYoung(object)) doomed += 1;
  }
  if (params.allowMassRemoval !== true && doomed > listed * MAX_REMOVAL_SHARE) return { kind: 'refused', reason: 'too-many-removals' };

  const base = { kept: listed - unreferenced, young: unreferenced - doomed };
  if (!params.apply) return { kind: 'swept', counts: { ...base, removed: 0, 'would-remove': doomed, failed: 0 } };

  let removed = 0;
  let failed = 0;
  for await (const object of params.lister.list()) {
    if (!isDoomed(object)) continue;
    try {
      await params.remover.remove(object.key);
      removed += 1;
      params.log?.(`effacée du seau : ${object.key}`);
    } catch (error: unknown) {
      failed += 1;
      params.log?.(`échec d'effacement : ${object.key} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { kind: 'swept', counts: { ...base, removed, failed, 'would-remove': 0 } };
}
