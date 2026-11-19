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
 * un fichier de la PASSERELLE sous `translated/<postMediaId>_<langue>.<ext>`,
 * jamais l'URL ni le chemin du conteneur traducteur (son cache TTS peut rendre la
 * même URL à deux médias). Une piste non écrite n'annonce ni `path` ni `url`, et
 * `PostAudioService.handleAudioTranslationsReady` garde alors la précédente.
 * Un id de `PostMedia` n'est jamais celui d'une `MessageAttachment` : l'écriture
 * y est en clair, les médias de post n'étant pas scellés au repos.
 */
import * as path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostAudioService } from '../posts/PostAudioService';
import { saveTranslatedTrack } from './translatedTrackSave';

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

export function namedPostAudioTarget(event: PostAudioReference): PostAudioTarget | null {
  return event.postId && event.postMediaId ? { postId: event.postId, postMediaId: event.postMediaId } : null;
}

export async function postAudioTargetOfMedia(
  prisma: Pick<PrismaClient, 'postMedia'>,
  mediaId: string
): Promise<PostAudioTarget | null> {
  const media = await prisma.postMedia.findUnique({
    where: { id: mediaId },
    select: { id: true, postId: true, comment: { select: { postId: true } } },
  });
  const postId = media?.postId ?? media?.comment?.postId;
  return media && postId ? { postId, postMediaId: media.id } : null;
}

export async function persistPostAudioTranslations(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>,
  target: PostAudioTarget,
  translatedAudios: ReadonlyArray<PostTranslatedAudio>
): Promise<void> {
  if (translatedAudios.length === 0) return;
  const translatedDir = path.join(process.env.UPLOAD_PATH || '/app/uploads', 'translated');
  const entries = await Promise.all(translatedAudios.map(async (audio) => {
    const ext = audio.audioMimeType?.replace('audio/', '') || 'mp3';
    const track = await saveTranslatedTrack(prisma, {
      translatedDir,
      filename: `${target.postMediaId}_${audio.targetLanguage}.${ext}`,
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
