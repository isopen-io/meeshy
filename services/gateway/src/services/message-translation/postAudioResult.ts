/**
 * #19749 — le résultat audio d'un post ou d'une story rejoint son `PostMedia`.
 *
 * Le traducteur répond pour un post sous `messageId = attachmentId = postMediaId`.
 * Un traducteur récent nomme le post (`postId` / `postMediaId`) ; un ANCIEN ne le
 * fait pas, et le résultat tombait sur la voie message (« Attachment non
 * trouvé »). Le repli lit alors le `PostMedia` de cet id — une seule requête, et
 * seulement quand la pièce de message est absente.
 *
 * La piste traduite s'écrit comme celle d'un message, par `saveTranslatedTrack` :
 * un fichier de la PASSERELLE sous `translated/post/<postMediaId>_<langue>.<ext>`,
 * jamais l'URL ni le chemin du conteneur traducteur (son cache TTS peut rendre la
 * même URL à deux médias). Une piste non écrite n'annonce ni `path` ni `url`, et
 * `PostAudioService.handleAudioTranslationsReady` garde alors la précédente.
 *
 * Le sous-dossier `post/` est ce qui la fait servir comme le fichier d'origine
 * de son média : la route de fichiers ne reconnaît pour piste de MESSAGE que
 * `translated/<id>_…` (refus #9588 sans ligne), et toute autre clé suit le
 * régime d'un fichier qui n'est pas une pièce jointe de message — celui de
 * l'original d'un `PostMedia`. Un id de `PostMedia` n'ouvre donc jamais une
 * piste de message, et l'écriture se fait en clair (aucune ligne de message).
 *
 * Rien ne s'écrit avant d'avoir prouvé l'entrée — le PULL ZMQ n'est pas
 * authentifié : ids ObjectId, média existant dont le post est celui annoncé,
 * langue et extension dans des listes fermées.
 */
import * as path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { PostAudioService } from '../posts/PostAudioService';
import { saveTranslatedTrack } from './translatedTrackSave';

const logger = enhancedLogger.child({ module: 'postAudioResult' });

const TRACK_LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const TRACK_EXTENSIONS: ReadonlySet<string> = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'webm']);
const MIME_SUBTYPE_EXTENSION: Readonly<Record<string, string>> = { mpeg: 'mp3' };

export type PostAudioTarget = { readonly postId: string; readonly postMediaId: string };

type PostAudioReference = { readonly postId?: string; readonly postMediaId?: string };

export type PostTranslatedAudio = {
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioUrl: string | null;
  readonly durationMs: number;
  readonly voiceCloned: boolean;
  readonly voiceQuality: number;
  readonly _audioBinary?: Buffer | null;
  readonly audioMimeType?: string;
  readonly audioDataBase64?: string;
  readonly segments?: ReadonlyArray<{ readonly text: string; readonly startMs: number; readonly endMs: number }>;
  readonly textOnly?: boolean;
};

export function namesPostAudio(event: PostAudioReference): boolean {
  return Boolean(event.postId || event.postMediaId);
}

export async function postAudioTargetOfMedia(
  prisma: Pick<PrismaClient, 'postMedia'>,
  mediaId: string
): Promise<PostAudioTarget | null> {
  if (!isValidObjectId(mediaId)) return null;
  const media = await prisma.postMedia.findUnique({
    where: { id: mediaId },
    select: { id: true, postId: true, comment: { select: { postId: true } } },
  });
  const postId = media?.postId ?? media?.comment?.postId;
  return media && postId ? { postId, postMediaId: media.id } : null;
}

export async function verifiedPostAudioTarget(
  prisma: Pick<PrismaClient, 'postMedia'>,
  event: PostAudioReference
): Promise<PostAudioTarget | null> {
  const owner = isValidObjectId(event.postId) && event.postMediaId ? await postAudioTargetOfMedia(prisma, event.postMediaId) : null;
  if (owner?.postId === event.postId) return owner;
  logger.warn('résultat audio de post refusé : média inconnu ou post incohérent');
  return null;
}

function trackExtension(mimeType: string | undefined): string | null {
  const subtype = mimeType?.replace('audio/', '') || 'mp3';
  const extension = MIME_SUBTYPE_EXTENSION[subtype] ?? subtype;
  return TRACK_EXTENSIONS.has(extension) ? extension : null;
}

export async function persistPostAudioTranslations(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>,
  target: PostAudioTarget | null,
  translatedAudios: ReadonlyArray<PostTranslatedAudio>
): Promise<void> {
  const admitted = translatedAudios.flatMap((audio) => {
    const ext = trackExtension(audio.audioMimeType);
    return ext && TRACK_LANGUAGE.test(audio.targetLanguage) ? [{ audio, ext }] : [];
  });
  if (admitted.length < translatedAudios.length) logger.warn('piste de post refusée : langue ou format hors liste');
  if (!target || admitted.length === 0) return;
  const translatedDir = path.join(process.env.UPLOAD_PATH || '/app/uploads', 'translated');
  const entries = await Promise.all(admitted.map(async ({ audio, ext }) => {
    const track = await saveTranslatedTrack(prisma, {
      translatedDir,
      filename: `post/${target.postMediaId}_${audio.targetLanguage}.${ext}`,
      attachmentId: target.postMediaId,
      language: audio.targetLanguage,
      binary: audio._audioBinary,
      base64: audio.audioDataBase64,
      textOnly: audio.textOnly === true || !audio.audioUrl,
    });
    return [audio.targetLanguage, {
      type: 'audio',
      transcription: audio.translatedText,
      ...track,
      durationMs: audio.durationMs,
      format: audio.audioMimeType ?? 'audio/mp3',
      cloned: audio.voiceCloned,
      quality: audio.voiceQuality,
      ttsModel: 'chatterbox',
      segments: (audio.segments ?? []).map((s) => ({ text: s.text, startMs: s.startMs, endMs: s.endMs })),
    }] as const;
  }));
  await PostAudioService.shared.handleAudioTranslationsReady({ ...target, translations: Object.fromEntries(entries) });
}

type TranscriptionReadyInput = {
  readonly taskId: string;
  readonly messageId: string;
  readonly attachmentId: string;
  readonly processingTimeMs: number;
  readonly transcription: {
    readonly text: string;
    readonly language: string;
    readonly confidence: number;
    readonly source: string;
    readonly durationMs: number;
    readonly segments?: unknown;
    readonly speakerCount?: number;
    readonly primarySpeakerId?: string;
    readonly senderVoiceIdentified?: boolean;
    readonly senderSpeakerId?: string | null;
  };
};

export function postTranscriptionReadyEvent(data: TranscriptionReadyInput, target: PostAudioTarget) {
  return {
    taskId: data.taskId,
    messageId: data.messageId,
    attachmentId: data.attachmentId,
    transcription: {
      id: data.attachmentId,
      text: data.transcription.text,
      language: data.transcription.language,
      confidence: data.transcription.confidence,
      source: data.transcription.source,
      segments: data.transcription.segments,
      durationMs: data.transcription.durationMs,
      speakerCount: data.transcription.speakerCount,
      primarySpeakerId: data.transcription.primarySpeakerId,
      senderVoiceIdentified: data.transcription.senderVoiceIdentified,
      senderSpeakerId: data.transcription.senderSpeakerId,
    },
    processingTimeMs: data.processingTimeMs,
    ...target,
  };
}
