/**
 * Hook de gestion de l'UI de conversation
 * Gère: mobile, sidebar resize, modals, galerie
 *
 * @module hooks/conversations/useConversationUI
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseConversationUIOptions {
  /** ID de conversation sélectionnée */
  selectedConversationId: string | null;
}

interface UseConversationUIReturn {
  // Mobile
  isMobile: boolean;
  showConversationList: boolean;
  setShowConversationList: (show: boolean) => void;

  // Sidebar resize
  conversationListWidth: number;
  isResizing: boolean;
  handleResizeMouseDown: (e: React.MouseEvent) => void;

  // Modals
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  isDetailsOpen: boolean;
  setIsDetailsOpen: (open: boolean) => void;

  // Gallery
  galleryOpen: boolean;
  setGalleryOpen: (open: boolean) => void;
  selectedAttachmentId: string | null;
  setSelectedAttachmentId: (id: string | null) => void;
  handleImageClick: (attachmentId: string) => void;
}

// Constantes
const DEFAULT_LIST_WIDTH = 384; // 96 * 4 (lg:w-96)
const MIN_LIST_WIDTH = 280;
const MAX_LIST_WIDTH = 600;
const MOBILE_BREAKPOINT = 768;
const RESIZE_DEBOUNCE_MS = 150;

/**
 * Parse et valide une largeur depuis localStorage
 */
function parseStoredWidth(stored: string | null): number {
  if (!stored) return DEFAULT_LIST_WIDTH;
  const parsed = parseInt(stored, 10);
  if (isNaN(parsed)) return DEFAULT_LIST_WIDTH;
  return Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, parsed));
}

/**
 * Hook pour gérer l'état UI des conversations
 */
export function useConversationUI({
  selectedConversationId,
}: UseConversationUIOptions): UseConversationUIReturn {
  // ========== Mobile detection ==========
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);

  // ========== Sidebar resize ==========
  const [conversationListWidth, setConversationListWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LIST_WIDTH;
    return parseStoredWidth(localStorage.getItem('conversationListWidth'));
  });
  const [isResizing, setIsResizing] = useState(false);

  // ========== Modals ==========
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // ========== Gallery ==========
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);

  // ========== Effects ==========

  // Mobile detection avec debounce
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    checkMobile();

    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMobile, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Mobile list visibility automatique
  useEffect(() => {
    if (isMobile) {
      // Mobile: masquer liste si conversation sélectionnée
      setShowConversationList(!selectedConversationId);
    } else {
      // Desktop: toujours afficher la liste
      setShowConversationList(true);
    }
  }, [isMobile, selectedConversationId]);

  // Resize handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Resize mouse move/up
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, e.clientX));
      setConversationListWidth(newWidth);
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Persist width to localStorage
  useEffect(() => {
    localStorage.setItem('conversationListWidth', conversationListWidth.toString());
  }, [conversationListWidth]);

  // ========== Handlers ==========

  // Image click handler pour la galerie
  const handleImageClick = useCallback((attachmentId: string) => {
    setSelectedAttachmentId(attachmentId);
    setGalleryOpen(true);
  }, []);

  return {
    // Mobile
    isMobile,
    showConversationList,
    setShowConversationList,

    // Sidebar
    conversationListWidth,
    isResizing,
    handleResizeMouseDown,

    // Modals
    isCreateModalOpen,
    setIsCreateModalOpen,
    isDetailsOpen,
    setIsDetailsOpen,

    // Gallery
    galleryOpen,
    setGalleryOpen,
    selectedAttachmentId,
    setSelectedAttachmentId,
    handleImageClick,
  };
}
