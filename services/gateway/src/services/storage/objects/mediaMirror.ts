/**
 * LA COPIE DES MÉDIAS DU DISQUE VERS LE SEAU (#11267) — un seul outil pour deux
 * usages :
 * - la MIGRATION PAR LOTS de l'historique (`mediaMirrorCli.ts`, à blanc par
 *   défaut, reprise par curseur) ;
 * - le MIROIR CONTINU (`--follow`), qui recopie ce que les écrivains d'avant
 *   l'interface `MediaObjectStore` posent encore sur le disque.
 *
 * Une clé n'est recopiée que si le seau ne l'a pas déjà À LA MÊME TAILLE : on
 * peut rejouer un lot autant de fois qu'on veut. Le disque reste la référence ;
 * rien n'est effacé du disque ici.
 */
import path from 'node:path';
import { imageVariantKeys, derivedFileCandidates } from '../../attachments/derivedAttachmentFiles';
import { storageKeyFromMediaUrl } from '../../attachments/mediaStorageKey';
import type { LocalObjectStore } from './LocalObjectStore';
import { isSafeStorageKey, type MediaObjectStore } from './MediaObjectStore';

export type MediaRow = {
  readonly id?: string;
  readonly filePath?: string | null;
  readonly fileUrl?: string | null;
  readonly thumbnailUrl?: string | null;
  readonly imageVariants?: unknown;
  readonly translations?: unknown;
};

/** Une clé à partir d'une valeur de colonne : adresse servie, clé nue, ou chemin absolu SOUS la racine. */
function keyOf(value: string | null | undefined, uploadRoot: string): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (path.isAbsolute(value)) {
    const root = path.resolve(uploadRoot);
    const resolved = path.resolve(value);
    if (!resolved.startsWith(root + path.sep)) return null;
    const relative = path.relative(root, resolved).split(path.sep).join('/');
    return isSafeStorageKey(relative) ? relative : null;
  }
  const key = storageKeyFromMediaUrl(value);
  return key !== null && isSafeStorageKey(key) ? key : null;
}

export function mediaRowStorageKeys(row: MediaRow, uploadRoot: string): readonly string[] {
  const candidates = [
    row.filePath,
    row.fileUrl,
    row.thumbnailUrl,
    ...imageVariantKeys(row.imageVariants),
    ...derivedFileCandidates({ translations: row.translations }),
  ];
  return [...new Set(candidates.map((value) => keyOf(value, uploadRoot)).filter((key): key is string => key !== null))];
}

export type MirrorOutcome = 'copied' | 'already' | 'would-copy' | 'missing-local' | 'failed';

export async function mirrorKey(params: {
  readonly local: LocalObjectStore;
  readonly mirror: MediaObjectStore;
  readonly key: string;
  readonly apply: boolean;
}): Promise<MirrorOutcome> {
  const { local, mirror, key, apply } = params;
  const source = await local.head(key);
  if (source === null) return 'missing-local';
  try {
    const existing = await mirror.head(key);
    if (existing !== null && existing.size === source.size) return 'already';
    if (!apply) return 'would-copy';
    const body = await local.read(key);
    if (body === null) return 'missing-local';
    await mirror.write(key, { body, size: source.size });
    return 'copied';
  } catch {
    return 'failed';
  }
}

export type MirrorRowSource = {
  readonly name: string;
  /** Les lignes d'identifiant STRICTEMENT supérieur à `after`, dans l'ordre des identifiants. */
  page(after: string | null, take: number): Promise<readonly (MediaRow & { readonly id: string })[]>;
};

export type MirrorCounts = Record<MirrorOutcome, number>;

export const emptyMirrorCounts = (): MirrorCounts => ({ copied: 0, already: 0, 'would-copy': 0, 'missing-local': 0, failed: 0 });

export async function runMirrorBatch(params: {
  readonly source: MirrorRowSource;
  readonly uploadRoot: string;
  readonly local: LocalObjectStore;
  readonly mirror: MediaObjectStore;
  readonly after: string | null;
  readonly batchSize: number;
  readonly apply: boolean;
}): Promise<{ readonly rows: number; readonly nextCursor: string | null; readonly done: boolean; readonly counts: MirrorCounts }> {
  const rows = await params.source.page(params.after, params.batchSize);
  const keys = rows.flatMap((row) => mediaRowStorageKeys(row, params.uploadRoot));
  const outcomes: MirrorOutcome[] = [];
  for (const key of keys) outcomes.push(await mirrorKey({ local: params.local, mirror: params.mirror, key, apply: params.apply }));
  const counts = outcomes.reduce<MirrorCounts>((total, outcome) => ({ ...total, [outcome]: total[outcome] + 1 }), emptyMirrorCounts());
  const last = rows[rows.length - 1];
  return { rows: rows.length, nextCursor: last === undefined ? params.after : last.id, done: rows.length < params.batchSize, counts };
}
