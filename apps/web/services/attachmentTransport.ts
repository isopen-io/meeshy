/**
 * Le port derrière lequel `useAttachmentUpload` cesse de parler DIRECTEMENT à
 * `AttachmentService` — la seule chose qui change, selon le contexte, entre
 * un composer de MESSAGE et un composer de PUBLICATION (post/reel/story/
 * status/commentaire).
 *
 * ─── POURQUOI CE FICHIER, PLUTÔT QU'UN SECOND HOOK ────────────────────────
 * `useAttachmentUpload` porte 700+ lignes de mécanique partagée (lots
 * parallèles, compression, déduplication, pièce jointe texte, glisser-
 * déposer, modale de plafond). Un hook jumeau pour les publications
 * dupliquerait cette mécanique et lui donnerait l'occasion de diverger — le
 * défaut que ce dépôt paie en boucle. Le contexte est donc un PARAMÈTRE du
 * hook existant, résolu ICI en un transport `{ validate, upload, remove }`.
 *
 * ─── LES DEUX TRANSPORTS ────────────────────────────────────────────────
 * MESSAGE (contexte absent) — un enrobage LITTÉRAL des appels d'aujourd'hui :
 * `AttachmentService.uploadFiles` / `.deleteAttachment` / `.validateFiles`,
 * sans aucune ligne nouvelle sur ce chemin.
 *
 * POST MEDIA (contexte présent) — force le chemin résumable
 * (`TusUploadService`, seul créateur de `PostMedia` côté upload ; voir
 * `routes/uploads/tus-handler.ts`) plutôt que `POST /attachments/upload`
 * (qui ne connaît aucun `uploadcontext` et créerait un `MessageAttachment`
 * même sous 50 Mo), tague chaque fichier du contexte demandé, et supprime via
 * `PostMediaService` (`DELETE /posts/media/:mediaId`) plutôt que
 * `AttachmentService.deleteAttachment` (qui ne connaît que
 * `MessageAttachment` et rendrait 404 sur un id de `PostMedia`).
 */

import { AttachmentService } from '@/services/attachmentService';
import {
  MAX_POST_MEDIA,
  type PostMediaUploadContext,
  type UploadedAttachmentResponse,
  type UploadMultipleResponse,
} from '@meeshy/shared/types/attachment';

export type AttachmentUploadContext = PostMediaUploadContext;

/** `(fileIndex, percentage)` — l'index porte sur les fichiers de CET appel. */
export type AttachmentUploadProgress = (fileIndex: number, percentage: number) => void;

export type AttachmentUploadMetadata = Record<string, unknown> & { duration?: number };
export type AttachmentUploadMetadataList = ReadonlyArray<AttachmentUploadMetadata | undefined>;

export interface AttachmentTransport {
  readonly validate: (files: File[]) => { valid: boolean; errors: string[] };
  readonly upload: (
    files: File[],
    token: string | undefined,
    metadataArray: AttachmentUploadMetadataList | undefined,
    onProgress?: AttachmentUploadProgress,
  ) => Promise<UploadMultipleResponse>;
  readonly remove: (attachmentId: string, token: string | undefined) => Promise<void>;
  /**
   * La pièce jointe TEXTE (« presse-papier ») — le membre du couple qui
   * manquait au port. `AttachmentService.uploadText` crée un
   * `MessageAttachment` : sous un contexte de PUBLICATION, son id entrerait
   * dans `mediaIds` où `claimableMediaWhere` ne le trouverait jamais (pièce
   * jointe disparue en silence), et son retrait passerait par la route
   * `PostMedia`, qui rendrait 404. CRÉER et DÉTRUIRE doivent rester du même
   * côté du port.
   *
   * @returns l'attachment créé, ou `undefined` si le serveur n'en a rendu aucun.
   */
  readonly createTextAttachment: (
    text: string,
    token: string | undefined,
  ) => Promise<UploadedAttachmentResponse | undefined>;
}

const messageTransport: AttachmentTransport = {
  validate: (files) => AttachmentService.validateFiles(files),
  upload: (files, token, metadataArray, onProgress) =>
    AttachmentService.uploadFiles(files, token, metadataArray as Record<string, unknown>[] | undefined, (percentage) => {
      if (!onProgress) return;
      // Une requête multipart n'expose qu'UN pourcentage pour toute la
      // requête — il vaut donc pour CHAQUE fichier qu'elle porte. Même
      // comportement qu'avant cette indirection, déplacé ici.
      files.forEach((_file, index) => onProgress(index, percentage));
    }),
  remove: (attachmentId, token) => AttachmentService.deleteAttachment(attachmentId, token),
  createTextAttachment: async (text, token) => {
    const response = await AttachmentService.uploadText(text, token);
    return response.success ? response.attachment : undefined;
  },
};

/**
 * Les métadonnées TUS voyagent en CHAÎNES (en-tête `Upload-Metadata`), là où
 * `UploadProcessor` reçoit du JSON. Ce qui n'a pas de destinataire côté
 * handler est laissé de côté : il ne lit que `uploadcontext`,
 * `capturedinapp`, `thumbhash` — et `duration`, la seule mesure que le
 * navigateur possède et que le serveur ne peut pas refaire (l'en-tête d'un
 * WebM de `MediaRecorder` ne la porte pas ; sans elle la bulle vocale reste à
 * 0:00). Voir `clientMeasuredMetadata` dans `routes/uploads/tus-handler.ts`.
 */
function postMediaTusMetadata(
  context: AttachmentUploadContext,
  entry: AttachmentUploadMetadata | undefined,
): Record<string, string> {
  const duration = entry?.duration;
  return {
    uploadcontext: context,
    ...(typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? { duration: String(Math.round(duration)) }
      : {}),
  };
}

function postMediaTransport(context: AttachmentUploadContext): AttachmentTransport {
  return {
    validate: (files) => AttachmentService.validateFiles(files, MAX_POST_MEDIA),
    upload: async (files, token, metadataArray, onProgress) => {
      // Imports PARESSEUX, et c'est le seul endroit qui les demande : statiques,
      // ils faisaient entrer `tus-js-client` (~22 Ko gzip) dans le chunk de
      // TOUTE route portant le composer de MESSAGES, qui n'emprunte jamais ce
      // transport. Le chemin message ne doit rien payer pour celui-ci.
      const { TusUploadService } = await import('@/services/tusUploadService');

      // Une instance FRAÎCHE par appel : l'index de progression ci-dessous
      // dépend de l'ordre d'insertion DANS CET appel — une instance partagée
      // entre plusieurs sélections mélangerait les index.
      const service = new TusUploadService(token);
      if (onProgress) {
        service.onProgress((queue) => {
          queue.files.forEach((file, index) => onProgress(index, file.percentage));
        });
      }

      // `uploadFilesSettled`, jamais `uploadFiles` : un voisin en échec ne doit
      // pas emporter les fichiers déjà téléversés. Leur ligne `PostMedia`
      // existe déjà côté serveur — un rejet global la rendrait ORPHELINE, son
      // id parti avec l'exception. La forme rendue est celle du transport
      // MESSAGE (`success: true` + tableau plus COURT), pour que
      // l'appariement du hook (`pairUploads`) fasse le travail pour lequel il
      // a été écrit : ne purger que les fichiers réellement perdus.
      const settled = await service.uploadFilesSettled(
        files,
        files.map((_file, index) => postMediaTusMetadata(context, metadataArray?.[index])),
        { forceResumable: true, maxFiles: MAX_POST_MEDIA },
      );
      const attachments = settled.flatMap((outcome) =>
        outcome.status === 'fulfilled' ? [outcome.value] : [],
      );
      return { success: true, attachments };
    },
    remove: async (attachmentId, token) => {
      const { PostMediaService } = await import('@/services/postMediaService');
      return PostMediaService.deletePendingMedia(attachmentId, token);
    },
    createTextAttachment: async () => {
      // Aucune route ne crée un `PostMedia` depuis du texte brut. Refuser est
      // la seule réponse honnête : la variante silencieuse (créer un
      // `MessageAttachment`) rendrait la pièce jointe irréclamable à la
      // publication ET son retrait impossible, sans qu'aucun message
      // n'apparaisse.
      throw new Error('Text attachments are not supported on a publication composer');
    },
  };
}

/**
 * `undefined` ⇒ transport MESSAGE. C'est le défaut du hook
 * (`useAttachmentUpload({...})` sans `uploadContext`, comme
 * `useComposerState` le monte) — un composer de publication le déclare
 * explicitement.
 */
export function resolveAttachmentTransport(context?: AttachmentUploadContext): AttachmentTransport {
  return context ? postMediaTransport(context) : messageTransport;
}
