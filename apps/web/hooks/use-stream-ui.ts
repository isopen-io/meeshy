/**
 * Hook useStreamUI - Gestion de l'état UI pour BubbleStream
 *
 * Extrait de bubble-stream-page.tsx pour responsabilité unique.
 * Gère l'état mobile, galerie, attachments, typing, search, etc.
 *
 * @module hooks/use-stream-ui
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Attachment } from '@meeshy/shared/types';

interface UseStreamUIOptions {
  messages: any[];
  messagesContainerRef: React.RefObject<HTMLDivElement>;
}

interface UseStreamUIReturn {
  // Mobile
  isMobile: boolean;

  // Galerie d'images
  galleryOpen: boolean;
  selectedAttachmentId: string | null;
  imageAttachments: Attachment[];
  deletedAttachmentIds: string[];
  setGalleryOpen: (open: boolean) => void;
  handleImageClick: (attachmentId: string) => void;
  handleNavigateToMessageFromGallery: (messageId: string) => void;
  handleAttachmentDeleted: (attachmentId: string) => void;

  // Attachments du composer
  attachmentIds: string[];
  attachmentMimeTypes: string[];
  handleAttachmentsChange: (ids: string[], mimeTypes: string[]) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Location
  location: string;

  // Trending hashtags
  trendingHashtags: string[];
}

/**
 * Hook pour gérer l'état UI du BubbleStream
 */
export function useStreamUI({
  messages,
  messagesContainerRef,
}: UseStreamUIOptions): UseStreamUIReturn {

  // Détection mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // État pour la galerie d'images
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);

  // Handler pour supprimer un attachment
  const handleAttachmentDeleted = useCallback((attachmentId: string) => {
    setDeletedAttachmentIds(prev => [...prev, attachmentId]);
  }, []);

  // Extraire les attachments images pour la galerie
  const imageAttachments = useState(() => {
    const allAttachments: Attachment[] = [];

    messages.forEach((message: any) => {
      if (message.attachments && Array.isArray(message.attachments)) {
        const imageAtts = message.attachments.filter((att: Attachment) =>
          att.mimeType?.startsWith('image/') && !deletedAttachmentIds.includes(att.id)
        );
        allAttachments.push(...imageAtts);
      }
    });

    return allAttachments;
  })[0];

  // Handler pour ouvrir la galerie
  const handleImageClick = useCallback((attachmentId: string) => {
    setSelectedAttachmentId(attachmentId);
    setGalleryOpen(true);
  }, []);

  // Handler pour naviguer vers un message depuis la galerie
  const handleNavigateToMessageFromGallery = useCallback((messageId: string) => {
    setGalleryOpen(false);

    setTimeout(() => {
      const messageElement = document.getElementById(`message-${messageId}`);

      if (messageElement) {
        messageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

        messageElement.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
        setTimeout(() => {
          messageElement.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
        }, 2000);

      } else {
        console.warn('⚠️ Message non trouvé dans le DOM:', messageId);
      }
    }, 300);
  }, []);

  // État pour les attachments du composer
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentMimeTypes, setAttachmentMimeTypes] = useState<string[]>([]);

  // Refs pour éviter les updates inutiles
  const prevAttachmentIdsRef = useRef<string>('[]');
  const prevMimeTypesRef = useRef<string>('[]');

  // Handler pour les changements d'attachments (CRITIQUE: mémorisé pour éviter boucles)
  const handleAttachmentsChange = useCallback((ids: string[], mimeTypes: string[]) => {
    const idsString = JSON.stringify(ids);
    const mimeTypesString = JSON.stringify(mimeTypes);

    if (idsString !== prevAttachmentIdsRef.current) {
      setAttachmentIds(ids);
      prevAttachmentIdsRef.current = idsString;
    }

    if (mimeTypesString !== prevMimeTypesRef.current) {
      setAttachmentMimeTypes(mimeTypes);
      prevMimeTypesRef.current = mimeTypesString;
    }
  }, []);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Location (géolocalisation)
  const [location, setLocation] = useState<string>('');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;

    const resolveLocation = async (position: GeolocationPosition) => {
      try {
        const { latitude, longitude } = position.coords;
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=fr`
        );
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const address = data.address ?? {};
        const city = address.city || address.town || address.village || address.municipality;
        const country = address.country;
        if (cancelled) return;
        if (city && country) setLocation(`${city}, ${country}`);
        else if (city) setLocation(city);
        else if (country) setLocation(country);
      } catch {
        // location reste vide
      }
    };

    const requestPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => { if (!cancelled) void resolveLocation(position); },
        () => {
          // Géolocalisation indisponible (kCLErrorLocationUnknown, timeout,
          // refus utilisateur, etc.) — non bloquant, on laisse location vide.
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    };

    // Évite de déclencher une prompt de permission inutile à chaque ouverture
    // de conversation : on demande la position seulement si l'utilisateur a
    // déjà accordé la permission. Sinon il faudra une action explicite
    // (composer un message localisé) pour la demander.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (cancelled) return;
          if (status.state === 'granted') requestPosition();
        })
        .catch(() => {
          // Permissions API non disponible — on s'abstient pour ne pas
          // déclencher de prompt non sollicitée.
        });
    }

    return () => { cancelled = true; };
  }, []);

  // Trending hashtags
  const [trendingHashtags, setTrendingHashtags] = useState<string[]>([]);

  useEffect(() => {
    setTrendingHashtags([
      '#meeshy', '#multilingual', '#chat', '#translation', '#connect',
      '#realtime', '#languages', '#global', '#community', '#innovation',
      '#communication', '#technology', '#ai', '#international', '#diversity'
    ]);
  }, []);

  return {
    isMobile,
    galleryOpen,
    selectedAttachmentId,
    imageAttachments,
    deletedAttachmentIds,
    setGalleryOpen,
    handleImageClick,
    handleNavigateToMessageFromGallery,
    handleAttachmentDeleted,
    attachmentIds,
    attachmentMimeTypes,
    handleAttachmentsChange,
    searchQuery,
    setSearchQuery,
    location,
    trendingHashtags,
  };
}
