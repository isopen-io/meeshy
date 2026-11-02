/**
 * Ce que le worker de médias fait d'UNE tâche (#11264).
 *
 * Pour chaque rendu de la pièce, dans l'ordre, il relit la ligne, rend par la
 * MÊME fabrique que la requête (`renderDeferred`, en mode STRICT : un rendu
 * raté lève, la file reprend), écrit, puis RELIT. Trois règles, chacune issue
 * de l'audit S9 :
 *
 * - l'écriture porte sur TOUTES les lignes qui partagent les octets (même
 *   `filePath`) : une copie de diffusion ou de transfert faite pendant le
 *   rendu reçoit la vignette et le rendu, au lieu de rester sans (défaut 4) ;
 * - si plus AUCUNE ligne ne cite ces octets après l'écriture — suppression,
 *   vue unique brûlée, éphémère expiré PENDANT le rendu —, ce qui vient d'être
 *   produit est effacé : un effacement ne laisse pas de copie dérivée
 *   (défaut 3). La purge efface ce que la ligne cite ; ce que le worker
 *   produisait à cet instant, la ligne ne le citait pas encore ;
 * - la pièce passe à `ready` à la fin de SA tâche, pas d'un drapeau d'ordre
 *   (défaut 6). Une reprise saute les rendus déjà faits (`done`).
 *
 * Rejouée, une tâche réécrit les mêmes valeurs aux mêmes clés : les chemins
 * des rendus dérivent de la clé du fichier, et un rendu vidéo remplace celui
 * de même codec au lieu de s'ajouter.
 */
import { promises as fs } from 'fs';
import type { MediaRendition } from '@meeshy/shared/types/attachment';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { imageVariantsJson, renderDeferred, renditionsJson, type DeferredRenditionFields, type RenditionDeps } from '../media-renditions.js';
import { derivedFileCandidates, resolveInsideUploadRoot } from '../derivedAttachmentFiles';
import type { MediaJob, MediaJobKind, MediaJobTarget } from './jobs';

type MediaRow = {
  readonly id: string;
  readonly filePath: string | null;
  readonly mimeType: string;
  readonly fileSize: number | null;
  readonly thumbHash: string | null;
  readonly renditions: unknown;
};

type Where = { id?: string; filePath?: string };

type RowDelegate = {
  findUnique(args: { where: { id: string }; select: Record<string, true> }): Promise<MediaRow | null>;
  findMany(args: { where: Where; select: { id: true } }): Promise<ReadonlyArray<{ id: string }>>;
  updateMany(args: { where: Where & { processingState?: string }; data: Record<string, unknown> }): Promise<{ count: number }>;
};

export type ProcessJobDeps = RenditionDeps & {
  readonly prisma: { readonly messageAttachment: RowDelegate; readonly postMedia: RowDelegate };
};

export type MediaJobOutcome =
  | { readonly status: 'done'; readonly target: MediaJobTarget; readonly recordIds: readonly string[]; readonly kinds: readonly MediaJobKind[] }
  | { readonly status: 'gone' };

export type ProcessJobHooks = {
  /** Les rendus déjà faits par un essai précédent : ils ne sont pas refaits. */
  readonly done?: readonly MediaJobKind[];
  /** Après chaque rendu écrit : la vignette se montre sans attendre le rendu vidéo. */
  readonly onRendered?: (progress: { readonly kind: MediaJobKind; readonly recordIds: readonly string[]; readonly done: readonly MediaJobKind[] }) => Promise<void>;
};

const ROW_SELECT = { id: true, filePath: true, mimeType: true, fileSize: true, thumbHash: true, renditions: true } as const;

function existingRenditions(value: unknown): readonly MediaRendition[] {
  return Array.isArray(value) ? (value as MediaRendition[]).filter((r) => r && typeof r.codec === 'string' && typeof r.url === 'string') : [];
}

function fieldsOf(rendered: DeferredRenditionFields, row: MediaRow): Record<string, unknown> {
  if (rendered.kind === 'thumb') {
    return {
      thumbnailPath: rendered.thumbnailPath,
      thumbnailUrl: rendered.thumbnailPath,
      ...(rendered.imageVariants ? { imageVariants: imageVariantsJson(rendered.imageVariants) } : {}),
      ...(rendered.avifVariants ? { avifVariants: imageVariantsJson(rendered.avifVariants) } : {}),
      ...(row.thumbHash === null && rendered.thumbHash !== null ? { thumbHash: rendered.thumbHash } : {}),
    };
  }
  return rendered.rendition === null
    ? {}
    : { renditions: renditionsJson([...existingRenditions(row.renditions).filter((r) => r.codec !== rendered.rendition?.codec), rendered.rendition]) };
}

/** Les fichiers qu'un rendu vient de poser sur le disque. */
function producedFiles(rendered: DeferredRenditionFields): readonly string[] {
  if (rendered.kind === 'transcode') return rendered.rendition ? [rendered.rendition.url] : [];
  return [
    ...(rendered.thumbnailPath ? [rendered.thumbnailPath] : []),
    ...derivedFileCandidates({ imageVariants: rendered.imageVariants, avifVariants: rendered.avifVariants }),
  ];
}

async function unlinkProduced(uploadBasePath: string, rendered: DeferredRenditionFields): Promise<void> {
  const absolute = producedFiles(rendered)
    .map((candidate) => resolveInsideUploadRoot(uploadBasePath, candidate))
    .filter((value): value is string => value !== null);
  await Promise.all(absolute.map((file) => fs.unlink(file).catch(() => undefined)));
}

/** Les lignes qui partagent les octets de la pièce (copies comprises) ; un média de post est seul. */
const sharingWhere = (target: MediaJobTarget, row: MediaRow & { filePath: string }): Where =>
  target === 'messageAttachment' ? { filePath: row.filePath } : { id: row.id };

export async function processMediaJob(deps: ProcessJobDeps, job: MediaJob, hooks: ProcessJobHooks = {}): Promise<MediaJobOutcome> {
  const delegate = deps.prisma[job.target];
  const done = new Set<MediaJobKind>(hooks.done ?? []);
  let recordIds: readonly string[] = [job.recordId];
  let written: Record<string, unknown> = {};

  for (const [index, kind] of job.kinds.entries()) {
    if (done.has(kind)) continue;
    const row = await delegate.findUnique({ where: { id: job.recordId }, select: ROW_SELECT });
    if (row === null || row.filePath === null) return { status: 'gone' };
    const where = sharingWhere(job.target, { ...row, filePath: row.filePath });

    const source = { relPath: row.filePath, mimeType: row.mimeType, attachmentType: getAttachmentType(row.mimeType, row.filePath), fileSize: row.fileSize ?? 0 };
    const rendered = await renderDeferred(deps, source, kind, { strict: true });
    const last = index === job.kinds.length - 1;

    const fields = fieldsOf(rendered, row);
    written = { ...written, ...fields };
    await delegate.updateMany({ where, data: fields });
    const survivors = await delegate.findMany({ where, select: { id: true } });
    if (survivors.length === 0) {
      await unlinkProduced(deps.uploadBasePath, rendered);
      return { status: 'gone' };
    }
    // Les champs rendus sont RÉAPPLIQUÉS avec `ready` : une copie lue avant la
    // première écriture et insérée après elle ne passe jamais prête sans
    // vignette (troisième passe d'audit, R2).
    if (last) await delegate.updateMany({ where: { ...where, processingState: 'pending' }, data: { ...written, processingState: 'ready' } });

    recordIds = survivors.map((survivor) => survivor.id);
    done.add(kind);
    if (!last && hooks.onRendered) await hooks.onRendered({ kind, recordIds, done: [...done] });
  }

  return { status: 'done', target: job.target, recordIds, kinds: job.kinds };
}

/** Après le dernier essai : la pièce et ses copies passent à `failed`, servies telles quelles. */
export async function markMediaJobFailed(deps: Pick<ProcessJobDeps, 'prisma'>, job: Pick<MediaJob, 'target' | 'recordId'>): Promise<readonly string[]> {
  const delegate = deps.prisma[job.target];
  const row = await delegate.findUnique({ where: { id: job.recordId }, select: ROW_SELECT });
  if (row === null || row.filePath === null) return [];
  const where = sharingWhere(job.target, { ...row, filePath: row.filePath });
  await delegate.updateMany({ where: { ...where, processingState: 'pending' }, data: { processingState: 'failed' } });
  const rows = await delegate.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}
