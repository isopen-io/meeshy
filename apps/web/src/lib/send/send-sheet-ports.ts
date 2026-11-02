import { forwardMessages } from '@/lib/api/forward';
import { apiDeps, postMediaUploadDeps } from '@/lib/api/deps';
import { createDirectConversation, createGroupConversation, type ConversationsDeps } from '@/lib/api/conversations';
import { uploadAttachments, uploadShortfall } from '@/lib/api/attachments';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { endToEndRegimeLedger, isEndToEndMode } from '@/lib/end-to-end-regime-ledger';
import { browserImagePreparer, type ImagePreparer } from '@/lib/media/prepare-image-upload';
import { servedMediaFile } from '@/lib/media/served-media';
import type { ApiResult } from '@/lib/api/http';
import { sendMessage } from '@/lib/api/messages';
import type { PostMediaUploadDeps } from '@/lib/api/post-media-upload';
import { createTextPost, publishFromAttachment, repostWithCaption } from '@/lib/api/share-publish';
import type { TusCheckpointStore } from '@/lib/api/tus-checkpoint';

import type { SendSheetPorts } from './send-sheet-run';
import { DIRECT_UPLOAD_LIMITS, uploadBatchesOf, type UploadBatch, type UploadBatchLimits } from './upload-batches';

/**
 * LES VRAIS PORTS DU MOTEUR D'ENVOI (#8884) — le branchement de
 * `SendSheetPorts` (`send-sheet-run.ts`) sur les ports de `lib/api`. Aucune
 * règle ici : chaque fonction traduit UN appel du moteur en UN appel réseau.
 *
 * Les routes lourdes (TUS, publication d'une scène) sont chargées à la
 * DEMANDE : la feuille s'ouvre pour un transfert de texte sans en payer le
 * poids.
 */
export type SendSheetPortsParams = {
  /** La langue d'origine des publications que le moteur compose. */
  readonly language: string;
  readonly deps?: ConversationsDeps;
  readonly media?: PostMediaUploadDeps;
  readonly fetchImpl?: typeof fetch;
  readonly online?: () => boolean;
  /** La préparation des photos avant téléversement (#11310) — le worker d'image par défaut. */
  readonly prepare?: ImagePreparer;
  /** Les bornes d'une requête directe (#12974) — celles de la passerelle par défaut. */
  readonly uploadLimits?: UploadBatchLimits;
  /** Les checkpoints de la reprise — IndexedDB par défaut, `null` pour les témoins. */
  readonly resumableCheckpoints?: TusCheckpointStore | null;
};

/**
 * #12949 — ouvrir un tête-à-tête rend la conversation EXISTANTE (la passerelle
 * déduplique), avec son régime : un mode e2ee servi est inscrit au registre
 * avant que le moteur ne téléverse quoi que ce soit vers elle.
 */
const learnServedRegime = (conversation: { readonly id: string; readonly encryptionMode?: string | null }): { readonly id: string } => {
  if (isEndToEndMode(conversation.encryptionMode)) endToEndRegimeLedger.getState().learnEndToEnd(conversation.id);
  return { id: conversation.id };
};

const browserOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

type UploadRoutes = {
  readonly deps: ConversationsDeps;
  readonly media: PostMediaUploadDeps;
  readonly prepare: ImagePreparer;
  readonly limits: UploadBatchLimits;
  readonly checkpoints?: TusCheckpointStore | null;
};

type Uploaded = ApiResult<{ readonly attachmentIds: readonly string[] }>;

/**
 * `POST attachments.upload` ne rend pas d'erreur par fichier : un fichier
 * refusé (MIME) disparaît de la réponse SOUS `success: true`. Moins de pièces
 * que de fichiers est un ÉCHEC d'envoi (`UPLOAD_PARTIAL`), jamais un message
 * amputé (même réconciliation que `perform-send.ts`).
 */
async function uploadBatch(routes: UploadRoutes, files: readonly File[], batch: UploadBatch): Promise<Uploaded> {
  if (batch.kind === 'resumable') {
    const file = files[batch.index];
    if (file === undefined) return { ok: false, status: 0, error: 'Fichier introuvable' };
    const { uploadMessageAttachment } = await import('@/lib/api/post-media-upload');
    const sent = await uploadMessageAttachment({ ...routes.media, file, ...(routes.checkpoints === undefined ? {} : { checkpoints: routes.checkpoints }) });
    return sent.ok ? { ok: true, data: { attachmentIds: [sent.data.attachmentId] } } : sent;
  }
  const pending = batch.indexes.flatMap((index) => (files[index] === undefined ? [] : [{ file: files[index] }]));
  const result = await uploadAttachments({ ...routes.deps, pending });
  const failure = uploadShortfall(pending.map((piece) => piece.file), result);
  if (failure !== null) return failure;
  if (!result.ok) return result;
  return { ok: true, data: { attachmentIds: result.data.attachments.map((attachment) => attachment.id) } };
}

/**
 * UN PARTAGE PART EN LOTS (#12974) — jusqu'à 100 fichiers et 5 Go
 * (`SHARE_LIMITS`), qu'aucune requête unique de la passerelle n'accepte : des
 * requêtes directes de 30 fichiers et 50 Mo au plus, et la reprise (TUS) pour
 * chaque fichier plus lourd (`uploadBatchesOf`). Les lots partent l'un après
 * l'autre, et le premier refus arrête tout : un message ne part jamais amputé.
 */
async function uploadFiles(routes: UploadRoutes, files: readonly File[]): Promise<Uploaded> {
  const pending = await routes.prepare.prepareUploads(files.map((file) => ({ file })));
  const prepared = pending.map((piece) => piece.file);
  const batches = uploadBatchesOf(prepared.map((file) => file.size), routes.limits);
  const ids: string[] = [];
  for (const batch of batches) {
    const sent = await uploadBatch(routes, prepared, batch);
    if (!sent.ok) return sent;
    ids.push(...sent.data.attachmentIds);
  }
  return { ok: true, data: { attachmentIds: ids } };
}

async function downloadFile(
  fetchImpl: typeof fetch,
  media: { readonly url: string; readonly mime: string; readonly name: string },
): Promise<File | null> {
  try {
    const response = await fetchImpl(media.url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return servedMediaFile(blob, media.name, { type: media.mime !== '' ? media.mime : blob.type });
  } catch {
    return null;
  }
}

export function createSendSheetPorts(params: SendSheetPortsParams): SendSheetPorts {
  const deps = params.deps ?? apiDeps;
  const mediaDeps = params.media ?? postMediaUploadDeps;
  const fetchImpl = params.fetchImpl ?? fetch;
  const prepare = params.prepare ?? browserImagePreparer;

  return {
    online: params.online ?? browserOnline,
    openDirect: async (userId) => {
      const result = await createDirectConversation(deps, userId);
      return result.ok ? { ok: true, data: learnServedRegime(result.data) } : result;
    },
    openGroup: async ({ userIds, title }) => {
      const result = await createGroupConversation(deps, { title, participantIds: userIds });
      return result.ok ? { ok: true, data: learnServedRegime(result.data) } : result;
    },
    forward: (forward) => forwardMessages({ ...deps, ...forward }),
    sendMessage: (message) => sendMessage({ ...deps, ...message }),
    uploadFiles: (files) =>
      uploadFiles({
        deps,
        media: mediaDeps,
        prepare,
        limits: params.uploadLimits ?? DIRECT_UPLOAD_LIMITS,
        ...(params.resumableCheckpoints === undefined ? {} : { checkpoints: params.resumableCheckpoints }),
      }, files),
    fetchFile: (media) => downloadFile(fetchImpl, media),
    uploadMedia: async (file) => {
      const { uploadPostMedia } = await import('@/lib/api/post-media-upload');
      const result = await uploadPostMedia({ ...mediaDeps, file: await prepare.prepare(file), uploadContext: 'story' });
      return result.ok ? { ok: true, data: result.data } : result;
    },
    publishMedia: async ({ format, media, caption }) => {
      const [{ buildStoryCanvasEffects, studioMediaKindOf }, { publishStory }, { storyMediaCaptionPayload }] = await Promise.all([
        import('@/lib/stories/story-document'),
        import('@/lib/api/stories-publish'),
        import('@/lib/stories/media-caption'),
      ]);
      const canvas = buildStoryCanvasEffects({
        texts: [],
        background: {
          source: { postMediaId: media.postMediaId, fileUrl: media.fileUrl, ...(media.thumbHash === undefined ? {} : { thumbHash: media.thumbHash }) },
          mediaType: studioMediaKindOf(media.mimeType),
        },
      });
      if (canvas === null) return { ok: false, status: 0, error: 'Média illisible' };
      /* LA LÉGENDE SUIT LE FORMAT COMME AU STUDIO (`studioPublicationContent`) :
         le corps n'existe que sous un POST ; une story et un réel portent la
         leur sur le MÉDIA de fond (`PostMedia.caption`), jamais sur `content`. */
      const onBody = format === 'POST' && caption !== undefined;
      const mediaCaption = format === 'POST' ? undefined : storyMediaCaptionPayload([{ postMediaId: media.postMediaId, caption }]);
      return publishStory({
        ...deps,
        type: format,
        storyEffects: canvas,
        mediaIds: [media.postMediaId],
        ...(onBody ? { content: caption, originalLanguage: params.language } : {}),
        ...(mediaCaption === undefined ? {} : { mediaCaption, originalLanguage: params.language }),
      });
    },
    publishFromAttachment: ({ attachmentId, target, content }) =>
      publishFromAttachment({ ...deps, attachmentId, target, ...(content === undefined ? {} : { content }) }),
    repost: ({ postId, targetType, content, isQuote }) =>
      repostWithCaption({ ...deps, postId, targetType, ...(content === undefined ? {} : { content }), isQuote }),
    createTextPost: ({ type, content }) => createTextPost({ ...deps, type, content }),
    newClientMessageId,
  };
}
