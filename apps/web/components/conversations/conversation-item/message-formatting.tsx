/**
 * Utilitaires pour formater l'affichage du dernier message d'une conversation
 */
import React from 'react';

/**
 * Formater la durée d'un fichier audio avec millisecondes
 */
function formatAudioDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const ms = Math.floor((milliseconds % 1000) / 10); // Centièmes
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Formater la durée d'une vidéo avec millisecondes
 */
function formatVideoDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const ms = Math.floor((milliseconds % 1000) / 10); // Centièmes
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Formater l'affichage d'une pièce jointe image
 */
function formatImageAttachment(attachment: any): React.JSX.Element {
  return (
    <>
      <span className="inline-flex text-blue-500">📷</span>
      {attachment.width && attachment.height && (
        <span className="text-xs">{attachment.width}×{attachment.height}</span>
      )}
    </>
  );
}

/**
 * Formater l'affichage d'une pièce jointe vidéo
 */
function formatVideoAttachment(attachment: any): React.JSX.Element {
  return (
    <>
      <span className="inline-flex text-red-500">🎥</span>
      {attachment.duration && (
        <span className="text-xs">{formatVideoDuration(attachment.duration)}</span>
      )}
      {attachment.width && attachment.height && (
        <span className="text-xs">• {attachment.width}×{attachment.height}</span>
      )}
      {attachment.fps && (
        <span className="text-xs">• {attachment.fps}fps</span>
      )}
    </>
  );
}

/**
 * Formater l'affichage d'une pièce jointe audio
 */
function formatAudioAttachment(attachment: any): React.JSX.Element {
  // Extraire les effets appliqués depuis la timeline
  const effectIcons: Record<string, string> = {
    'voice-coder': '🎤',
    'baby-voice': '👶',
    'demon-voice': '😈',
    'back-sound': '🎶',
  };
  const appliedEffects: string[] = [];
  const audioEffectsTimeline = (attachment as any).metadata?.audioEffectsTimeline;

  if (audioEffectsTimeline?.events) {
    const effects = new Set<string>();
    for (const event of audioEffectsTimeline.events) {
      if (event.action === 'activate') {
        effects.add(event.effectType);
      }
    }
    appliedEffects.push(...Array.from(effects));
  }

  let effectDisplay = '';
  if (appliedEffects.length === 1) {
    effectDisplay = effectIcons[appliedEffects[0]] || '🎚️';
  } else if (appliedEffects.length > 1) {
    effectDisplay = '🎚️';
  }

  return (
    <>
      <span className="inline-flex text-purple-500">🎵</span>
      {attachment.duration && (
        <span className="text-xs ml-1">{formatAudioDuration(attachment.duration)}</span>
      )}
      {effectDisplay && (
        <span className="text-xs ml-1">• {effectDisplay}</span>
      )}
      {attachment.bitrate && (
        <span className="text-xs">• {Math.round(attachment.bitrate / 1000)}kbps</span>
      )}
      {attachment.sampleRate && (
        <span className="text-xs">• {(attachment.sampleRate / 1000).toFixed(1)}kHz</span>
      )}
    </>
  );
}

/**
 * Formater l'affichage d'une pièce jointe PDF
 */
function formatPdfAttachment(attachment: any): React.JSX.Element {
  return (
    <>
      <span className="inline-flex text-orange-500">📄</span>
      {attachment.pageCount && (
        <span className="text-xs">{attachment.pageCount} page{attachment.pageCount > 1 ? 's' : ''}</span>
      )}
    </>
  );
}

/**
 * Formater l'affichage d'une pièce jointe Markdown
 */
function formatMarkdownAttachment(attachment: any): React.JSX.Element {
  return (
    <>
      <span className="inline-flex text-blue-500">📝</span>
      {attachment.lineCount && (
        <span className="text-xs">{attachment.lineCount} ligne{attachment.lineCount > 1 ? 's' : ''}</span>
      )}
    </>
  );
}

/**
 * Formater l'affichage d'une pièce jointe code
 */
function formatCodeAttachment(attachment: any): React.JSX.Element {
  return (
    <>
      <span className="inline-flex text-green-500">💻</span>
      {attachment.lineCount && (
        <span className="text-xs">{attachment.lineCount} ligne{attachment.lineCount > 1 ? 's' : ''}</span>
      )}
    </>
  );
}

/**
 * Formater l'affichage d'une pièce jointe générique
 */
function formatGenericAttachment(): React.JSX.Element {
  return <span className="inline-flex text-gray-500">📎</span>;
}

/**
 * Formater l'affichage du dernier message d'une conversation
 */
export function formatLastMessage(lastMessage: any): React.ReactNode {
  // Si le message a un attachement et pas de contenu texte, afficher les détails de l'attachement
  if (lastMessage.attachments && lastMessage.attachments.length > 0 && !lastMessage.content) {
    const attachment = lastMessage.attachments[0];
    const mimeType = attachment.mimeType || '';

    let attachmentDisplay: React.JSX.Element;

    if (mimeType.startsWith('image/')) {
      attachmentDisplay = formatImageAttachment(attachment);
    } else if (mimeType.startsWith('video/')) {
      attachmentDisplay = formatVideoAttachment(attachment);
    } else if (mimeType.startsWith('audio/')) {
      attachmentDisplay = formatAudioAttachment(attachment);
    } else if (mimeType === 'application/pdf') {
      attachmentDisplay = formatPdfAttachment(attachment);
    } else if (mimeType.includes('markdown') || (attachment.originalName && attachment.originalName.endsWith('.md'))) {
      attachmentDisplay = formatMarkdownAttachment(attachment);
    } else if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('python')) {
      attachmentDisplay = formatCodeAttachment(attachment);
    } else {
      attachmentDisplay = formatGenericAttachment();
    }

    return (
      <span className="flex items-center gap-1.5">
        {attachmentDisplay}
        {lastMessage.attachments.length > 1 && (
          <span className="text-xs font-medium">+{lastMessage.attachments.length - 1}</span>
        )}
      </span>
    );
  }

  return lastMessage.content;
}
