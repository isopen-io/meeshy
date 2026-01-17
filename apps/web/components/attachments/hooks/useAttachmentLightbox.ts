/**
 * Hook pour gérer l'état des lightbox d'attachments
 */

'use client';

import { useState, useCallback } from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';

export interface LightboxState {
  isOpen: boolean;
  index: number;
  attachment: Attachment | null;
}

export function useAttachmentLightbox() {
  const [imageLightbox, setImageLightbox] = useState<LightboxState>({
    isOpen: false,
    index: 0,
    attachment: null,
  });

  const [videoLightbox, setVideoLightbox] = useState<LightboxState>({
    isOpen: false,
    index: 0,
    attachment: null,
  });

  const [pdfLightbox, setPdfLightbox] = useState<LightboxState>({
    isOpen: false,
    index: 0,
    attachment: null,
  });

  const [markdownLightbox, setMarkdownLightbox] = useState<LightboxState>({
    isOpen: false,
    index: 0,
    attachment: null,
  });

  const [textLightbox, setTextLightbox] = useState<LightboxState>({
    isOpen: false,
    index: 0,
    attachment: null,
  });

  const [pptxLightbox, setPptxLightbox] = useState<LightboxState>({
    isOpen: false,
    index: 0,
    attachment: null,
  });

  const openImageLightbox = useCallback((index: number) => {
    setImageLightbox({ isOpen: true, index, attachment: null });
  }, []);

  const closeImageLightbox = useCallback(() => {
    setImageLightbox({ isOpen: false, index: 0, attachment: null });
  }, []);

  const openVideoLightbox = useCallback((index: number) => {
    setVideoLightbox({ isOpen: true, index, attachment: null });
  }, []);

  const closeVideoLightbox = useCallback(() => {
    setVideoLightbox({ isOpen: false, index: 0, attachment: null });
  }, []);

  const openPdfLightbox = useCallback((attachment: Attachment) => {
    setPdfLightbox({ isOpen: true, index: 0, attachment });
  }, []);

  const closePdfLightbox = useCallback(() => {
    setPdfLightbox({ isOpen: false, index: 0, attachment: null });
  }, []);

  const openMarkdownLightbox = useCallback((attachment: Attachment) => {
    setMarkdownLightbox({ isOpen: true, index: 0, attachment });
  }, []);

  const closeMarkdownLightbox = useCallback(() => {
    setMarkdownLightbox({ isOpen: false, index: 0, attachment: null });
  }, []);

  const openTextLightbox = useCallback((attachment: Attachment) => {
    setTextLightbox({ isOpen: true, index: 0, attachment });
  }, []);

  const closeTextLightbox = useCallback(() => {
    setTextLightbox({ isOpen: false, index: 0, attachment: null });
  }, []);

  const openPptxLightbox = useCallback((attachment: Attachment) => {
    setPptxLightbox({ isOpen: true, index: 0, attachment });
  }, []);

  const closePptxLightbox = useCallback(() => {
    setPptxLightbox({ isOpen: false, index: 0, attachment: null });
  }, []);

  return {
    imageLightbox,
    openImageLightbox,
    closeImageLightbox,
    videoLightbox,
    openVideoLightbox,
    closeVideoLightbox,
    pdfLightbox,
    openPdfLightbox,
    closePdfLightbox,
    markdownLightbox,
    openMarkdownLightbox,
    closeMarkdownLightbox,
    textLightbox,
    openTextLightbox,
    closeTextLightbox,
    pptxLightbox,
    openPptxLightbox,
    closePptxLightbox,
  };
}
