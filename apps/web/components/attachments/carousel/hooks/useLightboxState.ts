/**
 * Hook pour gérer l'état des différentes lightbox
 */

import { useState, useCallback } from 'react';
import { LightboxState } from '../types';

export function useLightboxState() {
  const [state, setState] = useState<LightboxState>({
    imageLightboxIndex: -1,
    videoLightboxIndex: -1,
    pdfLightboxFile: null,
    textLightboxFile: null,
    pptxLightboxFile: null,
    markdownLightboxFile: null,
  });

  const openImageLightbox = useCallback((index: number) => {
    setState(prev => ({ ...prev, imageLightboxIndex: index }));
  }, []);

  const closeImageLightbox = useCallback(() => {
    setState(prev => ({ ...prev, imageLightboxIndex: -1 }));
  }, []);

  const openVideoLightbox = useCallback((index: number) => {
    setState(prev => ({ ...prev, videoLightboxIndex: index }));
  }, []);

  const closeVideoLightbox = useCallback(() => {
    setState(prev => ({ ...prev, videoLightboxIndex: -1 }));
  }, []);

  const openPdfLightbox = useCallback((file: File) => {
    setState(prev => ({ ...prev, pdfLightboxFile: file }));
  }, []);

  const closePdfLightbox = useCallback(() => {
    setState(prev => ({ ...prev, pdfLightboxFile: null }));
  }, []);

  const openTextLightbox = useCallback((file: File) => {
    setState(prev => ({ ...prev, textLightboxFile: file }));
  }, []);

  const closeTextLightbox = useCallback(() => {
    setState(prev => ({ ...prev, textLightboxFile: null }));
  }, []);

  const openPptxLightbox = useCallback((file: File) => {
    setState(prev => ({ ...prev, pptxLightboxFile: file }));
  }, []);

  const closePptxLightbox = useCallback(() => {
    setState(prev => ({ ...prev, pptxLightboxFile: null }));
  }, []);

  const openMarkdownLightbox = useCallback((file: File) => {
    setState(prev => ({ ...prev, markdownLightboxFile: file }));
  }, []);

  const closeMarkdownLightbox = useCallback(() => {
    setState(prev => ({ ...prev, markdownLightboxFile: null }));
  }, []);

  return {
    state,
    openImageLightbox,
    closeImageLightbox,
    openVideoLightbox,
    closeVideoLightbox,
    openPdfLightbox,
    closePdfLightbox,
    openTextLightbox,
    closeTextLightbox,
    openPptxLightbox,
    closePptxLightbox,
    openMarkdownLightbox,
    closeMarkdownLightbox,
  };
}
