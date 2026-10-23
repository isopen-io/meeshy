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
 * Priorités BullMQ (plus petit = plus urgent) : la vignette passe avant le
 * rendu vidéo, qui peut prendre des minutes.
 */
export type MediaJobKind = 'thumb' | 'transcode';
export type MediaJobTarget = 'messageAttachment' | 'postMedia';

export type MediaJob = {
  readonly kind: MediaJobKind;
  readonly target: MediaJobTarget;
  readonly recordId: string;
  /** La dernière tâche différée de cette pièce : elle passe la ligne à `ready`. */
  readonly final: boolean;
};

export const MEDIA_QUEUE_NAME = 'media-processing';
export const MEDIA_JOB_PRIORITY: Readonly<Record<MediaJobKind, number>> = { thumb: 2, transcode: 3 };
export const SYNCHRONOUS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Identifiant de tâche : une pièce n'a qu'UNE tâche d'un genre en file (BullMQ refuse `:`). */
export function mediaJobId(job: Pick<MediaJob, 'kind' | 'target' | 'recordId'>): string {
  return `${job.kind}-${job.target}-${job.recordId}`;
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

export function mediaJobsFor(target: MediaJobTarget, recordId: string, kinds: readonly MediaJobKind[]): readonly MediaJob[] {
  return kinds.map((kind, index) => ({ kind, target, recordId, final: index === kinds.length - 1 }));
}
