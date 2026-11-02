/**
 * Les tâches de la file de médias (#11264, défaut validé de #11249).
 *
 * Ce qui SORT de la requête HTTP : les rendus coûteux d'un média — vignette,
 * variantes WebP et AVIF, thumbhash (`thumb`) ; rendu H.264 de compatibilité
 * d'une vidéo HEVC (`transcode`, #11261). Ce qui y RESTE :
 * - la vérification et la persistance (signature, retrait des métadonnées,
 *   conversion d'un HEIC servi en JPEG — `fileUrl` doit être lisible dès la
 *   réponse) ;
 * - toute image de moins de 2 Mo : un ancien client attend sa vignette dans la
 *   réponse et n'écoute pas `attachment:ready` ;
 * - un vocal : sa normalisation change son URL (`.webm` → `.m4a`) ; différée,
 *   un ancien client garderait l'adresse d'origine. Il est petit.
 *
 * UNE tâche par pièce, qui porte ses rendus DANS L'ORDRE (vignette d'abord) :
 * la pièce est prête quand SA tâche finit, sans coordination entre tâches
 * sœurs (audit S9, défaut 6 — un drapeau « dernière tâche » suivait l'ordre
 * du tableau, pas l'achèvement). Une reprise saute les rendus déjà faits
 * (`progress` de la tâche).
 *
 * Priorité BullMQ (plus petit = plus urgent) : celle du rendu le plus urgent
 * de la pièce — une photo passe avant une vidéo à transcoder.
 */
export type MediaJobKind = 'thumb' | 'transcode';
export type MediaJobTarget = 'messageAttachment' | 'postMedia';

export type MediaJob = {
  readonly target: MediaJobTarget;
  readonly recordId: string;
  readonly kinds: readonly MediaJobKind[];
};

export const MEDIA_QUEUE_NAME = 'media-processing';
export const MEDIA_JOB_PRIORITY: Readonly<Record<MediaJobKind, number>> = { thumb: 2, transcode: 3 };
export const SYNCHRONOUS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const KINDS: readonly MediaJobKind[] = ['thumb', 'transcode'];
const TARGETS: readonly MediaJobTarget[] = ['messageAttachment', 'postMedia'];
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Identifiant de tâche : une pièce n'a qu'UNE tâche en file (BullMQ refuse `:`). */
export function mediaJobId(job: Pick<MediaJob, 'target' | 'recordId'>): string {
  return `media-${job.target}-${job.recordId}`;
}

export function mediaJobPriority(kinds: readonly MediaJobKind[]): number {
  return Math.min(...kinds.map((kind) => MEDIA_JOB_PRIORITY[kind]));
}

export function deferredMediaKinds(input: {
  readonly attachmentType: string;
  readonly fileSize: number;
  readonly queueEnabled: boolean;
  readonly compatRenditionEnabled: boolean;
}): readonly MediaJobKind[] {
  if (!input.queueEnabled) return [];
  if (input.attachmentType === 'image') return input.fileSize >= SYNCHRONOUS_IMAGE_MAX_BYTES ? ['thumb'] : [];
  if (input.attachmentType === 'video') return input.compatRenditionEnabled ? ['thumb', 'transcode'] : ['thumb'];
  return [];
}

export function mediaJobFor(target: MediaJobTarget, recordId: string, kinds: readonly MediaJobKind[]): MediaJob | null {
  return kinds.length > 0 ? { target, recordId, kinds } : null;
}

const isKind = (value: unknown): value is MediaJobKind => KINDS.includes(value as MediaJobKind);
const isTarget = (value: unknown): value is MediaJobTarget => TARGETS.includes(value as MediaJobTarget);

/**
 * La tâche lue dans la file — une donnée Redis, pas une donnée de confiance :
 * `target` indexe les délégués Prisma, `recordId` doit être un ObjectId. La
 * forme d'avant (`{ kind, final }`, une tâche par rendu) est encore lue, le
 * temps que les tâches déjà en file s'écoulent.
 */
export function readMediaJob(data: unknown): MediaJob | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  if (!isTarget(raw.target) || typeof raw.recordId !== 'string' || !OBJECT_ID.test(raw.recordId)) return null;
  const kinds = Array.isArray(raw.kinds) ? raw.kinds.filter(isKind) : isKind(raw.kind) ? [raw.kind] : [];
  return kinds.length > 0 ? { target: raw.target, recordId: raw.recordId, kinds: [...new Set(kinds)] } : null;
}

/** L'inverse de `mediaJobId`, pour un événement de file qui ne porte que l'identifiant. */
export function mediaJobRef(jobId: string): Pick<MediaJob, 'target' | 'recordId'> | null {
  const match = /^media-(messageAttachment|postMedia)-([0-9a-f]{24})$/i.exec(jobId);
  return match ? { target: match[1] as MediaJobTarget, recordId: match[2] } : null;
}
