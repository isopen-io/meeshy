/**
 * Composant pour afficher un attachment audio
 */

'use client';

import React from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { SimpleAudioPlayer } from '@/components/audio/SimpleAudioPlayer';

export interface AudioAttachmentProps {
  attachment: Attachment;
}

export const AudioAttachment = React.memo(function AudioAttachment({
  attachment,
}: AudioAttachmentProps) {
  return <SimpleAudioPlayer attachment={attachment as any} />;
});
