/**
 * Ce que le worker de médias fait d'UNE tâche (#11264).
 *
 * Il relit la ligne (une pièce supprimée entre-temps n'est plus rendue), rend
 * par la MÊME fabrique que la requête (`renderDeferred`), et écrit le résultat
 * sur la ligne. Rejouée (reprise après panne, tâche relancée), une tâche
 * réécrit les mêmes valeurs aux mêmes clés : les chemins des rendus sont
 * dérivés de la clé du fichier, et un rendu vidéo remplace celui de même codec
 * au lieu de s'ajouter.
 */
import type { MediaRendition } from '@meeshy/shared/types/attachment';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { imageVariantsJson, renderDeferred, renditionsJson, type RenditionDeps } from '../media-renditions.js';
import type { MediaJob, MediaJobKind, MediaJobTarget } from './jobs';

type MediaRow = {
  readonly id: string;
  readonly filePath: string | null;
  readonly mimeType: string;
  readonly fileSize: number | null;
  readonly thumbHash: string | null;
  readonly renditions: unknown;
};

type RowDelegate = {
  findUnique(args: { where: { id: string }; select: Record<string, true> }): Promise<MediaRow | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

export type ProcessJobDeps = RenditionDeps & {
  readonly prisma: { readonly messageAttachment: RowDelegate; readonly postMedia: RowDelegate };
};

export type MediaJobOutcome =
  | { readonly status: 'done'; readonly target: MediaJobTarget; readonly recordId: string; readonly kind: MediaJobKind }
  | { readonly status: 'gone' };

const ROW_SELECT = { id: true, filePath: true, mimeType: true, fileSize: true, thumbHash: true, renditions: true } as const;

function existingRenditions(value: unknown): readonly MediaRendition[] {
  return Array.isArray(value) ? (value as MediaRendition[]).filter((r) => r && typeof r.codec === 'string' && typeof r.url === 'string') : [];
}

export async function processMediaJob(deps: ProcessJobDeps, job: MediaJob): Promise<MediaJobOutcome> {
  const delegate = deps.prisma[job.target];
  const row = await delegate.findUnique({ where: { id: job.recordId }, select: ROW_SELECT });
  const relPath = row?.filePath ?? null;
  if (row === null || relPath === null) return { status: 'gone' };

  const source = { relPath, mimeType: row.mimeType, attachmentType: getAttachmentType(row.mimeType, relPath), fileSize: row.fileSize ?? 0 };
  const rendered = await renderDeferred(deps, source, job.kind);
  const data: Record<string, unknown> = rendered.kind === 'thumb'
    ? {
      thumbnailPath: rendered.thumbnailPath,
      thumbnailUrl: rendered.thumbnailPath,
      ...(rendered.imageVariants ? { imageVariants: imageVariantsJson(rendered.imageVariants) } : {}),
      ...(rendered.avifVariants ? { avifVariants: imageVariantsJson(rendered.avifVariants) } : {}),
      ...(row.thumbHash === null && rendered.thumbHash !== null ? { thumbHash: rendered.thumbHash } : {}),
    }
    : rendered.rendition === null
      ? {}
      : { renditions: renditionsJson([...existingRenditions(row.renditions).filter((r) => r.codec !== rendered.rendition?.codec), rendered.rendition]) };

  await delegate.update({ where: { id: job.recordId }, data: { ...data, ...(job.final ? { processingState: 'ready' } : {}) } });
  return { status: 'done', target: job.target, recordId: job.recordId, kind: job.kind };
}
