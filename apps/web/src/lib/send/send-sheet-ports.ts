import { forwardMessages } from '@/lib/api/forward';
import { apiDeps, postMediaUploadDeps } from '@/lib/api/deps';
import { createDirectConversation, type ConversationsDeps } from '@/lib/api/conversations';
import { uploadAttachments } from '@/lib/api/attachments';
import { newClientMessageId } from '@/lib/api/client-message-id';
import type { ApiResult } from '@/lib/api/http';
import { sendMessage } from '@/lib/api/messages';
import type { PostMediaUploadDeps } from '@/lib/api/post-media-upload';
import { createTextPost, publishFromAttachment, repostWithCaption } from '@/lib/api/share-publish';

import type { SendSheetPorts } from './send-sheet-run';

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
};

const browserOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * `POST attachments.upload` ne rend pas d'erreur par fichier : un fichier
 * refusé (MIME) disparaît de la réponse SOUS `success: true`. Moins de pièces
 * que de fichiers est un ÉCHEC d'envoi (`UPLOAD_PARTIAL`), jamais un message
 * amputé (même réconciliation que `perform-send.ts`).
 */
async function uploadFiles(deps: ConversationsDeps, files: readonly File[]): Promise<ApiResult<{ readonly attachmentIds: readonly string[] }>> {
  const result = await uploadAttachments({ ...deps, pending: files.map((file) => ({ file })) });
  if (!result.ok) return result;
  if (result.data.attachments.length < files.length) {
    return { ok: false, status: 200, error: 'Lot de pièces jointes incomplet', code: 'UPLOAD_PARTIAL' };
  }
  return { ok: true, data: { attachmentIds: result.data.attachments.map((attachment) => attachment.id) } };
}

async function downloadFile(
  fetchImpl: typeof fetch,
  media: { readonly url: string; readonly mime: string; readonly name: string },
): Promise<File | null> {
  try {
    const response = await fetchImpl(media.url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], media.name, { type: media.mime !== '' ? media.mime : blob.type });
  } catch {
    return null;
  }
}

export function createSendSheetPorts(params: SendSheetPortsParams): SendSheetPorts {
  const deps = params.deps ?? apiDeps;
  const mediaDeps = params.media ?? postMediaUploadDeps;
  const fetchImpl = params.fetchImpl ?? fetch;

  return {
    online: params.online ?? browserOnline,
    openDirect: async (userId) => {
      const result = await createDirectConversation(deps, userId);
      return result.ok ? { ok: true, data: { id: result.data.id } } : result;
    },
    forward: (forward) => forwardMessages({ ...deps, ...forward }),
    sendMessage: (message) => sendMessage({ ...deps, ...message }),
    uploadFiles: (files) => uploadFiles(deps, files),
    fetchFile: (media) => downloadFile(fetchImpl, media),
    uploadMedia: async (file) => {
      const { uploadPostMedia } = await import('@/lib/api/post-media-upload');
      const result = await uploadPostMedia({ ...mediaDeps, file, uploadContext: 'story' });
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
