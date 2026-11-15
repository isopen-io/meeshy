import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { AttachmentTranscription, AttachmentTranslations } from '@meeshy/shared/types/attachment-audio';
import { enhancedLogger } from '../../utils/logger-enhanced';

/* eslint-disable @typescript-eslint/no-explicit-any */

const logger = enhancedLogger.child({ module: 'AttachmentAudioRichView' });

export type AttachmentAudioRichView = {
  attachment: any;
  transcription: any | null;
  translatedAudios: any[];
};

/**
 * LA VUE RICHE d'une pièce jointe audio — la même forme héritée que
 * {@link attachmentTranscriptionView}, mais avec les MÉTADONNÉES DE PISTE que
 * l'autre ne lit pas.
 *
 * **CE SONT DEUX JUMELLES, ET ELLES ONT DÉJÀ DIVERGÉ.** Les deux services
 * portaient chacun une méthode `getAttachmentWithTranscription`, écrites
 * séparément et devenues DIFFÉRENTES sur cinq points observables :
 *
 * | | vue LÉGÈRE (`AudioTranslateService`) | vue RICHE (ici) |
 * |---|---|---|
 * | colonnes | 10 | 15 — `originalName`, `bitrate`, `sampleRate`, `codec`, `channels` |
 * | `transcription.createdAt` | `new Date()` (l'instant de la lecture) | `attachment.createdAt` (la vérité) |
 * | `transcription.attachmentId` | présent | absent |
 * | piste traduite | pas de `format`, `createdAt` refabriqué | `format` et `createdAt` PRÉSERVÉS |
 * | erreur | remonte | attrapée, `null` rendu |
 *
 * Elles ne sont donc PAS interchangeables : les unifier changerait ce que des
 * routes servent aujourd'hui. Les deux corps sont sortis de leur service le
 * 2026-09-05 (budget #4426) et posés CÔTE À CÔTE, dans le même dossier, pour
 * que la divergence se lise — c'est la première fois qu'elle est écrite
 * quelque part. Le lot qui les unira devra trancher chaque ligne du tableau
 * ci-dessus contre les témoins de routes des deux côtés.
 */
export async function attachmentAudioRichView(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  attachmentId: string
): Promise<AttachmentAudioRichView | null> {
  try {
    const attachment = await prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true, messageId: true, fileName: true, originalName: true, fileUrl: true,
        mimeType: true, fileSize: true, duration: true, bitrate: true, sampleRate: true,
        codec: true, channels: true, createdAt: true, transcription: true, translations: true
      }
    });

    if (!attachment) return null;

    const transcriptionData = attachment.transcription as unknown as AttachmentTranscription | null;
    const transcription = transcriptionData ? {
      id: attachmentId,
      text: transcriptionData.text,
      language: transcriptionData.language,
      confidence: transcriptionData.confidence,
      source: transcriptionData.source,
      segments: transcriptionData.segments,
      durationMs: transcriptionData.durationMs,
      createdAt: attachment.createdAt
    } : null;

    const translationsData = attachment.translations as unknown as AttachmentTranslations | undefined;
    const translatedAudios = translationsData ? Object.entries(translationsData).map(([lang, t]) => ({
      id: `${attachmentId}_${lang}`,
      targetLanguage: lang,
      translatedText: t.transcription,
      audioUrl: t.url || '',
      audioPath: t.path || '',
      durationMs: t.durationMs || 0,
      format: t.format || 'mp3',
      voiceCloned: t.cloned || false,
      voiceQuality: t.quality || 0,
      createdAt: typeof t.createdAt === 'string' ? new Date(t.createdAt) : t.createdAt
    })) : [];

    return {
      attachment: {
        id: attachment.id,
        messageId: attachment.messageId,
        fileName: attachment.fileName,
        originalName: attachment.originalName,
        fileUrl: attachment.fileUrl,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        duration: attachment.duration,
        bitrate: attachment.bitrate,
        sampleRate: attachment.sampleRate,
        codec: attachment.codec,
        channels: attachment.channels,
        createdAt: attachment.createdAt
      },
      transcription,
      translatedAudios
    };
  } catch (error) {
    logger.error(`❌ [TranslationService] Erreur get attachment: ${error}`);
    return null;
  }
}
