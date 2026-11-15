import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { AttachmentTranscription, AttachmentTranslations } from '@meeshy/shared/types/attachment-audio';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AttachmentTranscriptionView = {
  attachment: any;
  transcription: any | null;
  translatedAudios: any[];
};

/**
 * LA VUE HÉRITÉE d'une pièce jointe audio — sa transcription et ses pistes
 * traduites, rendues dans la forme que les routes servaient AVANT que les deux
 * soient repliées en colonnes JSON (`MessageAttachment.transcription` /
 * `.translations`).
 *
 * Sortie de `AudioTranslateService` le 2026-09-05 : le service était repassé
 * au-dessus de sa dette (#4426) et cette méthode n'a rien d'un service — elle
 * LIT et CONVERTIT, sans état, sans ZMQ, sans événement. La classe garde sa
 * méthode (les témoins des routes la doublent par son nom) et lui délègue.
 *
 * `null` quand la pièce jointe n'existe pas — jamais une vue vide : une pièce
 * absente et une pièce sans transcription ne se répondent pas pareil (404 vs
 * 200 avec `transcription: null`).
 */
export async function attachmentTranscriptionView(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  attachmentId: string
): Promise<AttachmentTranscriptionView | null> {
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      messageId: true,
      fileName: true,
      fileUrl: true,
      mimeType: true,
      fileSize: true,
      duration: true,
      transcription: true,
      translations: true,
      createdAt: true
    }
  });

  if (!attachment) return null;

  const transcriptionData = attachment.transcription as unknown as AttachmentTranscription | null;
  const transcription = transcriptionData ? {
    id: attachmentId,
    attachmentId,
    text: transcriptionData.text,
    language: transcriptionData.language,
    confidence: transcriptionData.confidence,
    source: transcriptionData.source,
    segments: transcriptionData.segments,
    durationMs: transcriptionData.durationMs,
    createdAt: new Date()
  } : null;

  const translationsData = attachment.translations as unknown as AttachmentTranslations | undefined;
  const translatedAudios = translationsData ? Object.entries(translationsData).map(([lang, t]) => ({
    id: `${attachmentId}_${lang}`,
    attachmentId,
    targetLanguage: lang,
    translatedText: t.transcription,
    audioUrl: t.url || '',
    audioPath: t.path || '',
    durationMs: t.durationMs || 0,
    voiceCloned: t.cloned || false,
    voiceQuality: t.quality || 0,
    createdAt: new Date()
  })) : [];

  return { attachment, transcription, translatedAudios };
}
