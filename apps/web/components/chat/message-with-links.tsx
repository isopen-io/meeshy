'use client';

import React, { useMemo, useCallback } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseMessageLinks,
  recordTrackingLinkClick,
  generateDeviceFingerprint,
} from '@/lib/utils/link-parser';
import type { ParsedLink } from '@/lib/utils/link-parser';

export interface MessageWithLinksProps {
  content: string;
  className?: string;
  linkClassName?: string;
  textClassName?: string;
  onLinkClick?: (url: string, isTracking: boolean) => void;
  enableTracking?: boolean; // Si true, enregistre les clics sur les liens de tracking
}

/**
 * Composant pour afficher un message avec des liens cliquables et trackables
 */
export function MessageWithLinks({
  content,
  className,
  linkClassName,
  textClassName,
  onLinkClick,
  enableTracking = true,
}: MessageWithLinksProps) {
  // Parser le message pour extraire les liens
  const parsedParts = useMemo(() => {
    const parts = parseMessageLinks(content);
    return parts;
  }, [content]);

  // Gérer le clic sur un lien
  const handleLinkClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>, part: ParsedLink) => {
      const isTracking = part.type === 'tracking-link' || part.type === 'mshy-link';

      // Si c'est un lien de tracking (mshy:// ou meeshy.me/l/<token>) et que le tracking est activé
      if (isTracking && enableTracking && part.token) {
        e.preventDefault();

        try {
          // Enregistrer le clic
          const deviceFingerprint = generateDeviceFingerprint();
          const result = await recordTrackingLinkClick(part.token, {
            referrer: document.referrer,
            deviceFingerprint,
          });

          if (result.success && result.originalUrl) {
            // Essayer d'ouvrir dans un nouvel onglet, sinon naviguer directement
            const newWindow = window.open(result.originalUrl, '_blank', 'noopener,noreferrer');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
              // Si l'ouverture d'un nouvel onglet échoue, naviguer directement
              window.location.href = result.originalUrl;
            }
          } else {
            console.error('Failed to record tracking link click:', result.error);
            // Fallback: ouvrir le lien de tracking directement
            const fallbackUrl = part.type === 'mshy-link' ? part.trackingUrl! : part.content;
            const newWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
              window.location.href = fallbackUrl;
            }
          }
        } catch (error) {
          console.error('Error handling tracking link click:', error);
          // Fallback: ouvrir le lien de tracking directement
          const fallbackUrl = part.type === 'mshy-link' ? part.trackingUrl! : part.content;
          const newWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            window.location.href = fallbackUrl;
          }
        }
      }

      // Appeler le callback si fourni
      if (onLinkClick) {
        const url =
          part.type === 'tracking-link' || part.type === 'mshy-link' ? part.trackingUrl! : part.originalUrl!;
        onLinkClick(url, isTracking);
      }
    },
    [enableTracking, onLinkClick]
  );

  // Render un part du message
  const renderPart = useCallback(
    (part: ParsedLink, index: number) => {
      if (part.type === 'text') {
        return (
          <span key={index} className={cn('whitespace-pre-wrap', textClassName)}>
            {part.content}
          </span>
        );
      }

      // Gérer les liens m+<token> (créés par le backend)
      if (part.type === 'mshy-link') {
        return (
          <a
            key={index}
            href={part.trackingUrl!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleLinkClick(e, part)}
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold underline decoration-2 transition-all',
              'cursor-pointer pointer-events-auto hover:scale-105',
              linkClassName
            )}
            title={`Open the link :${part.trackingUrl}`}
          >
            <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-mono text-xs">{part.content}</span>
          </a>
        );
      }

      const isTracking = part.type === 'tracking-link';
      const url = isTracking ? part.trackingUrl! : part.originalUrl!;
      const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleLinkClick(e, part)}
          className={cn(
            'inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline decoration-blue-500/30 hover:decoration-blue-500/60 transition-colors',
            'break-all cursor-pointer pointer-events-auto',
            linkClassName
          )}
          title={url}
        >
          <span className="inline-flex items-center gap-1">
            {isTracking ? (
              <Link2 className="h-3 w-3 flex-shrink-0 inline" />
            ) : (
              <ExternalLink className="h-3 w-3 flex-shrink-0 inline" />
            )}
            <span className="break-all">{displayUrl}</span>
          </span>
        </a>
      );
    },
    [handleLinkClick, linkClassName, textClassName]
  );

  return (
    <div className={cn('text-sm', className)} style={{ position: 'relative', zIndex: 1 }}>
      {parsedParts.map((part, index) => renderPart(part, index))}
    </div>
  );
}

/**
 * Hook pour créer automatiquement des liens de tracking lors de l'envoi de messages
 */
export function useAutoTrackingLinks(options: {
  conversationId?: string;
  enabled?: boolean;
}) {
  const { conversationId, enabled = true } = options;

  const processMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!enabled) {
        return message;
      }

      // Parser le message
      const parts = parseMessageLinks(message);
      
      // Pour l'instant, on ne remplace pas automatiquement les liens
      // car cela nécessite une requête API pour chaque lien
      // On peut activer cette fonctionnalité plus tard si nécessaire
      
      return message;
    },
    [enabled, conversationId]
  );

  return { processMessage };
}

/**
 * Composant simple pour afficher un lien de tracking
 */
export function TrackingLink({
  token,
  children,
  className,
  onClickTracked,
}: {
  token: string;
  children?: React.ReactNode;
  className?: string;
  onClickTracked?: () => void;
}) {
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();

      try {
        const deviceFingerprint = generateDeviceFingerprint();
        const result = await recordTrackingLinkClick(token, {
          referrer: document.referrer,
          deviceFingerprint,
        });

        if (result.success && result.originalUrl) {
          const newWindow = window.open(result.originalUrl, '_blank', 'noopener,noreferrer');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            window.location.href = result.originalUrl;
          }
          onClickTracked?.();
        } else {
          console.error('Failed to record tracking link click:', result.error);
          const fallbackUrl = `https://meeshy.me/l/${token}`;
          const newWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            window.location.href = fallbackUrl;
          }
        }
      } catch (error) {
        console.error('Error handling tracking link click:', error);
        const fallbackUrl = `https://meeshy.me/l/${token}`;
        const newWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          window.location.href = fallbackUrl;
        }
      }
    },
    [token, onClickTracked]
  );

  return (
    <a
      href={`https://meeshy.me/l/${token}`}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline decoration-blue-500/30 hover:decoration-blue-500/60 transition-colors',
        className
      )}
    >
      <Link2 className="h-3 w-3 flex-shrink-0" />
      {children || `meeshy.me/l/${token}`}
    </a>
  );
}

