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
  // Extraire la transcription si elle existe
  const initialTranscription = useMemo(() => {
    if (!attachment.transcription) return undefined;

    return {
      text: attachment.transcription.transcribedText,
      language: attachment.transcription.language,
      confidence: attachment.transcription.confidence,
    };
  }, [attachment.transcription]);

  // Extraire les audios traduits si ils existent
  const initialTranslatedAudios = useMemo(() => {
    if (!attachment.translatedAudios || attachment.translatedAudios.length === 0) {
      return undefined;
    }

    return attachment.translatedAudios.map((ta) => ({
      language: ta.targetLanguage,
      audioUrl: ta.audioUrl,
      audioDuration: ta.durationMs,
      voiceCloned: ta.voiceCloned,
      modelUsed: ta.ttsModel,
    }));
  }, [attachment.translatedAudios]);

  return (
    <SimpleAudioPlayer
      attachment={attachment as any}
      messageId={messageId || attachment.messageId}
      initialTranscription={initialTranscription}
      initialTranslatedAudios={initialTranslatedAudios}
    />
  );
});
