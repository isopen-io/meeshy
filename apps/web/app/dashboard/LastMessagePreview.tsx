/**
 * LastMessagePreview - Composant mémorisé pour le rendu des derniers messages
 *
 * Extrait de dashboard/page.tsx pour éviter les re-renders inutiles.
 * Ce composant encapsule toute la logique complexe de rendu des messages
 * avec leurs attachements (images, vidéos, audio, PDF, markdown, code).
 *
 * Optimisation: React.memo() empêche les re-renders quand les props ne changent pas.
 */

'use client';

import React from 'react';
import type { Message } from '@/types';

interface LastMessagePreviewProps {
  message: Message | null | undefined;
  currentLanguage: string;
  t: (key: string, params?: any) => string;
}

/**
 * Formate la durée en millisecondes pour affichage (mm:ss.cc ou hh:mm:ss.cc)
 */
function formatDuration(milliseconds: number, includeHours = true): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const ms = Math.floor((milliseconds % 1000) / 10); // Centièmes
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  if (includeHours && hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Composant mémorisé pour le rendu du préview du dernier message
 */
export const LastMessagePreview = React.memo<LastMessagePreviewProps>(({
  message,
  currentLanguage,
  t
}) => {
  if (!message) {
    return null;
  }

  // Gérer les utilisateurs anonymes ET membres
  const sender = message.sender;
  const isAnonymous = false;

  const senderPrefix = sender ? (
    <span className="font-medium">
      {sender.displayName ||
       sender.username ||
       (sender.firstName && sender.lastName
         ? `${sender.firstName} ${sender.lastName}`.trim()
         : isAnonymous ? t('anonymous') || 'Anonyme' : 'Utilisateur')}
      {isAnonymous && ' (anonyme)'}
      :{' '}
    </span>
  ) : null;

  // Si le message a un attachement et pas de contenu texte
  if (message.attachments && message.attachments.length > 0 && !message.content) {
    const attachment = message.attachments[0];
    const mimeType = attachment.mimeType || '';

    return (
      <>
        {senderPrefix}
        <span className="inline-flex items-center gap-1.5">
          {(() => {
            // Images
            if (mimeType.startsWith('image/')) {
              return (
                <>
                  <span className="inline-flex text-blue-500">📷</span>
                  {attachment.width && attachment.height && (
                    <span className="text-xs">{attachment.width}×{attachment.height}</span>
                  )}
                </>
              );
            }

            // Vidéos
            if (mimeType.startsWith('video/')) {
              return (
                <>
                  <span className="inline-flex text-red-500">🎥</span>
                  {attachment.duration && (
                    <span className="text-xs">{formatDuration(attachment.duration)}</span>
                  )}
                  {attachment.width && attachment.height && (
                    <span className="text-xs">• {attachment.width}×{attachment.height}</span>
                  )}
                </>
              );
            }

            // Audio avec effets
            if (mimeType.startsWith('audio/')) {
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
                    <span className="text-xs ml-1">{formatDuration(attachment.duration, true)}</span>
                  )}
                  {effectDisplay && (
                    <span className="text-xs ml-1">• {effectDisplay}</span>
                  )}
                </>
              );
            }

            // PDF
            if (mimeType === 'application/pdf') {
              return (
                <>
                  <span className="inline-flex text-orange-500">📄</span>
                  {attachment.pageCount && (
                    <span className="text-xs">{attachment.pageCount} page{attachment.pageCount > 1 ? 's' : ''}</span>
                  )}
                </>
              );
            }

            // Markdown
            if (mimeType.includes('markdown') || (attachment.originalName && attachment.originalName.endsWith('.md'))) {
              return (
                <>
                  <span className="inline-flex text-blue-500">📝</span>
                  {attachment.lineCount && (
                    <span className="text-xs">{attachment.lineCount} ligne{attachment.lineCount > 1 ? 's' : ''}</span>
                  )}
                </>
              );
            }

            // Code
            if (mimeType.includes('code') || mimeType.includes('javascript') ||
                mimeType.includes('typescript') || mimeType.includes('python')) {
              return (
                <>
                  <span className="inline-flex text-green-500">💻</span>
                  {attachment.lineCount && (
                    <span className="text-xs">{attachment.lineCount} ligne{attachment.lineCount > 1 ? 's' : ''}</span>
                  )}
                </>
              );
            }

            // Autre
            return <span className="inline-flex text-gray-500">📎</span>;
          })()}

          {message.attachments.length > 1 && (
            <span className="text-xs font-medium">+{message.attachments.length - 1}</span>
          )}
        </span>
      </>
    );
  }

  // Sinon afficher le contenu texte normal
  return (
    <>
      {senderPrefix}
      {message.content}
    </>
  );
}, (prevProps, nextProps) => {
  // Comparaison personnalisée pour éviter les re-renders inutiles
  return (
    prevProps.message?.id === nextProps.message?.id &&
    prevProps.message?.content === nextProps.message?.content &&
    prevProps.message?.attachments?.length === nextProps.message?.attachments?.length &&
    prevProps.currentLanguage === nextProps.currentLanguage
  );
});

LastMessagePreview.displayName = 'LastMessagePreview';
