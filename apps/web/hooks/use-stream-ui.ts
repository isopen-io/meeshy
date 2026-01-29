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
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            // Utiliser l'API Nominatim pour le reverse geocoding (ville, pays)
            const { latitude, longitude } = position.coords;
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=fr`
            );

            if (response.ok) {
              const data = await response.json();
              const address = data.address;

              // Extraire ville et pays
              const city = address.city || address.town || address.village || address.municipality;
              const country = address.country;

              // Ne définir location que si on a au moins la ville ou le pays
              if (city && country) {
                setLocation(`${city}, ${country}`);
              } else if (city) {
                setLocation(city);
              } else if (country) {
                setLocation(country);
              }
              // Si rien n'est disponible, location reste vide et ne s'affichera pas
            }
          } catch (error) {
            console.error('Erreur géolocalisation:', error);
            // En cas d'erreur, location reste vide
          }
        },
        (error) => {
          // Géolocalisation refusée ou erreur - location reste vide
          console.log('Géolocalisation non autorisée ou erreur:', error.message);
        }
      );
    }
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
