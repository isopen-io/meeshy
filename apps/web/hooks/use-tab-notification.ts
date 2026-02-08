'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useUnreadCount } from '@/stores/notification-store';

// Pre-computed SVG data URLs (hoisted, never recreated)
const ORIGINAL_FAVICON_URL = `data:image/svg+xml,${encodeURIComponent(
  `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#gradient)"/>
  <path d="M8 12C8 10.8954 8.89543 10 10 10H22C23.1046 10 24 10.8954 24 12V20C24 21.1046 23.1046 22 22 22H10C8.89543 22 8 21.1046 8 20V12Z" fill="white" fill-opacity="0.9"/>
  <path d="M10 13H22M10 16H18M10 19H16" stroke="url(#gradient)" stroke-width="1.5" stroke-linecap="round"/>
</svg>`
)}`;

const BADGE_FAVICON_URL = `data:image/svg+xml,${encodeURIComponent(
  `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
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
</svg>`
)}`;

const ORIGINAL_TITLE = 'Meeshy - Messagerie multilingue en temps réel';

/**
 * Hook qui affiche un badge bleu sur le favicon et un compteur dans le titre
 * quand l'onglet n'est pas visible et qu'il y a des messages non lus.
 */
export function useTabNotification() {
  const unreadCount = useUnreadCount();
  const hasUnread = unreadCount > 0;
  const isTabVisibleRef = useRef(true);
  const faviconLinkRef = useRef<HTMLLinkElement | null>(null);

  const getFaviconLink = useCallback((): HTMLLinkElement => {
    if (faviconLinkRef.current) return faviconLinkRef.current;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    faviconLinkRef.current = link;
    return link;
  }, []);

  const setFavicon = useCallback((badge: boolean) => {
    getFaviconLink().href = badge ? BADGE_FAVICON_URL : ORIGINAL_FAVICON_URL;
  }, [getFaviconLink]);

  // Favicon: dépend seulement du booléen hasUnread (pas du nombre exact)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      isTabVisibleRef.current = visible;
      setFavicon(!visible && hasUnread);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Sync immédiat si tab déjà caché
    if (!isTabVisibleRef.current) {
      setFavicon(hasUnread);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasUnread, setFavicon]);

  // Titre: dépend du nombre exact (pour afficher le compteur)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      isTabVisibleRef.current = visible;
      document.title = !visible && unreadCount > 0
        ? `(${unreadCount}) ${ORIGINAL_TITLE}`
        : ORIGINAL_TITLE;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Sync immédiat si tab déjà caché
    if (!isTabVisibleRef.current) {
      document.title = unreadCount > 0
        ? `(${unreadCount}) ${ORIGINAL_TITLE}`
        : ORIGINAL_TITLE;
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.title = ORIGINAL_TITLE;
    };
  }, [unreadCount]);
}
