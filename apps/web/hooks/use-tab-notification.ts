'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useUnreadCount } from '@/stores/notification-store';

/**
 * SVG du favicon original (32x32, gradient bleu avec icône message)
 */
const ORIGINAL_FAVICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#gradient)"/>
  <path d="M8 12C8 10.8954 8.89543 10 10 10H22C23.1046 10 24 10.8954 24 12V20C24 21.1046 23.1046 22 22 22H10C8.89543 22 8 21.1046 8 20V12Z" fill="white" fill-opacity="0.9"/>
  <path d="M10 13H22M10 16H18M10 19H16" stroke="url(#gradient)" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

/**
 * Génère un SVG du favicon avec un badge de notification (point bleu en haut à droite)
 */
function createBadgeFaviconSvg(): string {
  return `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#gradient)"/>
  <path d="M8 12C8 10.8954 8.89543 10 10 10H22C23.1046 10 24 10.8954 24 12V20C24 21.1046 23.1046 22 22 22H10C8.89543 22 8 21.1046 8 20V12Z" fill="white" fill-opacity="0.9"/>
  <path d="M10 13H22M10 16H18M10 19H16" stroke="url(#gradient)" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="26" cy="6" r="5" fill="#3b82f6" stroke="white" stroke-width="1.5"/>
</svg>`;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ORIGINAL_TITLE = 'Meeshy - Messagerie multilingue en temps réel';

/**
 * Hook qui affiche un badge bleu sur le favicon et un compteur dans le titre
 * quand l'onglet n'est pas visible et qu'il y a des messages non lus.
 */
export function useTabNotification() {
  const unreadCount = useUnreadCount();
  const isTabVisibleRef = useRef(true);
  const faviconLinkRef = useRef<HTMLLinkElement | null>(null);

  const getFaviconLink = useCallback((): HTMLLinkElement => {
    if (faviconLinkRef.current) return faviconLinkRef.current;

    // Chercher le link SVG existant
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!link) {
      // Fallback : créer un link icon SVG
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    faviconLinkRef.current = link;
    return link;
  }, []);

  const updateFavicon = useCallback((showBadge: boolean) => {
    const link = getFaviconLink();
    link.href = showBadge
      ? svgToDataUrl(createBadgeFaviconSvg())
      : svgToDataUrl(ORIGINAL_FAVICON_SVG);
  }, [getFaviconLink]);

  const updateTitle = useCallback((count: number, visible: boolean) => {
    if (!visible && count > 0) {
      document.title = `(${count}) ${ORIGINAL_TITLE}`;
    } else {
      document.title = ORIGINAL_TITLE;
    }
  }, []);

  // Écouter le changement de visibilité de l'onglet
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      isTabVisibleRef.current = visible;

      if (visible) {
        // Restaurer le favicon et titre d'origine
        updateFavicon(false);
        updateTitle(0, true);
      } else if (unreadCount > 0) {
        // Tab caché + messages non lus → badge
        updateFavicon(true);
        updateTitle(unreadCount, false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [unreadCount, updateFavicon, updateTitle]);

  // Réagir aux changements de unreadCount quand le tab est caché
  useEffect(() => {
    if (isTabVisibleRef.current) return;

    if (unreadCount > 0) {
      updateFavicon(true);
      updateTitle(unreadCount, false);
    } else {
      updateFavicon(false);
      updateTitle(0, true);
    }
  }, [unreadCount, updateFavicon, updateTitle]);
}
