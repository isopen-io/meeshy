import { MAX_DIRECT_UPLOAD_FILES, SMALL_FILE_THRESHOLD } from '@meeshy/shared/types/attachment';

/**
 * LES LOTS D'UN TÉLÉVERSEMENT DE PIÈCES JOINTES (#12974) — un partage emporte
 * jusqu'à 100 fichiers et 5 Go (`SHARE_LIMITS`), ce qu'aucune requête unique de
 * la passerelle n'accepte :
 *
 * - la voie DIRECTE (`POST /attachments/upload`) refuse plus de
 *   `MAX_DIRECT_UPLOAD_FILES` fichiers par requête (413), et tient chacun en
 *   mémoire (`part.toBuffer()`) : un lot direct pèse `SMALL_FILE_THRESHOLD` au
 *   plus ;
 * - un fichier plus lourd part SEUL par la REPRISE (TUS), qui écrit sur disque
 *   tranche par tranche.
 *
 * Les lots gardent l'ordre des fichiers : les identifiants se recomposent par
 * rang, et le message garde l'ordre choisi.
 */
export type UploadBatch =
  | { readonly kind: 'direct'; readonly indexes: readonly number[] }
  | { readonly kind: 'resumable'; readonly index: number };

export type UploadBatchLimits = { readonly maxFiles: number; readonly maxBytes: number };

export const DIRECT_UPLOAD_LIMITS: UploadBatchLimits = { maxFiles: MAX_DIRECT_UPLOAD_FILES, maxBytes: SMALL_FILE_THRESHOLD };

type Open = { readonly indexes: readonly number[]; readonly bytes: number };

export function uploadBatchesOf(sizes: readonly number[], limits: UploadBatchLimits = DIRECT_UPLOAD_LIMITS): readonly UploadBatch[] {
  const flush = (open: Open | null): readonly UploadBatch[] => (open === null ? [] : [{ kind: 'direct', indexes: open.indexes }]);
  const folded = sizes.reduce<{ readonly done: readonly UploadBatch[]; readonly open: Open | null }>(
    (acc, size, index) => {
      if (size > limits.maxBytes) return { done: [...acc.done, ...flush(acc.open), { kind: 'resumable', index }], open: null };
      const fits = acc.open !== null && acc.open.indexes.length < limits.maxFiles && acc.open.bytes + size <= limits.maxBytes;
      if (fits && acc.open !== null) return { done: acc.done, open: { indexes: [...acc.open.indexes, index], bytes: acc.open.bytes + size } };
      return { done: [...acc.done, ...flush(acc.open)], open: { indexes: [index], bytes: size } };
    },
    { done: [], open: null },
  );
  return [...folded.done, ...flush(folded.open)];
}
