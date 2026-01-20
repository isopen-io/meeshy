/**
 * Composant pour afficher un attachment audio
 */

'use client';

import React, { useMemo } from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { SimpleAudioPlayer } from '@/components/audio/SimpleAudioPlayer';

export interface AudioAttachmentProps {
  attachment: Attachment;
  messageId?: string;
}

export const AudioAttachment = React.memo(function AudioAttachment({
  attachment,
  messageId,
}: AudioAttachmentProps) {

  // Extraire la transcription audio si elle existe
  const initialTranscription = useMemo(() => {
    if (!attachment.transcription) {
      return undefined;
    }

    // Note: AudioAttachment est déjà spécifique aux audios, pas besoin de vérifier le type
    // L'API retourne MessageAudioTranscription qui n'a pas de champ "type"
    const transcription = attachment.transcription as any;

    const text = transcription.transcribedText || transcription.text;

    // Si pas de texte, ne pas retourner de transcription
    if (!text) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('🎵 [AudioAttachment] Transcription sans texte:', transcription);
      }
      return undefined;
    }

    const result = {
      text,
      language: transcription.language,
      confidence: transcription.confidence,
      segments: transcription.segments,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('🎵 [AudioAttachment] Transcription extraite:', {
        ...result,
        segmentsCount: result.segments?.length || 0,
      });
    }

    return result;
  }, [attachment.transcription]);

  // Extraire les traductions audio depuis la nouvelle relation translatedAudios (Prisma MessageTranslatedAudio)
  // Utilise le type TranslatedAudioData unifié de @meeshy/shared/types
  const initialTranslatedAudios = useMemo(() => {
    // Préférer translatedAudios (nouvelle structure Prisma) sur translationsJson (legacy)
    if (attachment.translatedAudios && attachment.translatedAudios.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎵 [AudioAttachment] Audios traduits (nouvelle structure):', attachment.translatedAudios);
      }
      // Les données sont déjà au bon format TranslatedAudioData
      return attachment.translatedAudios;
    }

    // Fallback vers translationsJson (legacy) si translatedAudios n'est pas disponible
    if (attachment.translationsJson && Object.keys(attachment.translationsJson).length > 0) {
      const result = Object.values(attachment.translationsJson).map((translation: any) => ({
        id: translation.id || '',
        targetLanguage: translation.targetLanguage,
        translatedText: translation.translatedText || '',
        audioUrl: translation.audioUrl,
        durationMs: translation.durationMs,
        voiceCloned: translation.voiceCloned,
        voiceQuality: translation.voiceQuality || 0,
        format: translation.format,
        ttsModel: translation.ttsModel,
      }));

      if (process.env.NODE_ENV === 'development' && result.length > 0) {
        console.log('🎵 [AudioAttachment] Traductions extraites (legacy format):', result);
      }

      return result;
    }

    return undefined;
  }, [attachment.translatedAudios, attachment.translationsJson]);

  return (
    <SimpleAudioPlayer
      attachment={attachment as any}
      messageId={messageId || attachment.messageId}
      initialTranscription={initialTranscription}
      initialTranslatedAudios={initialTranslatedAudios}
    />
  );
});
