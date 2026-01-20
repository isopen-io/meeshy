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
      speakerCount: transcription.speakerCount,
      primarySpeakerId: transcription.primarySpeakerId,
      senderVoiceIdentified: transcription.senderVoiceIdentified,
      senderSpeakerId: transcription.senderSpeakerId,
      speakerAnalysis: transcription.speakerAnalysis,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('🎵 [AudioAttachment] Transcription extraite:', {
        text: result.text.substring(0, 50) + '...',
        language: result.language,
        confidence: result.confidence,
        segmentsCount: result.segments?.length || 0,
        speakerCount: result.speakerCount,
        senderVoiceIdentified: result.senderVoiceIdentified,
        firstSegment: result.segments?.[0],
      });
    }

    return result;
  }, [attachment.transcription]);

  // Extraire les traductions audio directement depuis translations (structure BD)
  const initialTranslations = useMemo(() => {
    if (attachment.translations && Object.keys(attachment.translations).length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎵 [AudioAttachment] Traductions audio:', {
          languages: Object.keys(attachment.translations),
          details: attachment.translations
        });
      }
      return attachment.translations;
    }

    return undefined;
  }, [attachment.translations]);

  return (
    <SimpleAudioPlayer
      attachment={attachment as any}
      messageId={messageId || attachment.messageId}
      initialTranscription={initialTranscription}
      initialTranslations={initialTranslations}
    />
  );
});
