/**
 * Hook personnalisé pour le lazy loading d'images avec Intersection Observer
 * Améliore les performances en chargeant les images uniquement quand elles sont visibles
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface UseLazyImageOptions {
  /**
   * Marge avant de charger l'image (en pixels ou pourcentage)
   * @default "100px"
   */
  rootMargin?: string;
  /**
   * Seuil de visibilité pour déclencher le chargement (0 à 1)
   * @default 0.01
   */
  threshold?: number;
}

interface UseLazyImageReturn {
  /**
   * Ref à attacher à l'élément img
   */
  ref: React.RefObject<HTMLImageElement>;
  /**
   * URL de l'image à utiliser (placeholder ou vraie image)
   */
  src: string;
  /**
   * Indique si l'image est chargée
   */
  isLoaded: boolean;
  /**
   * Indique si l'image est en cours de chargement
   */
  isLoading: boolean;
}

/**
 * Hook pour lazy loading d'images
 *
 * @example
 * ```tsx
 * const { ref, src, isLoaded } = useLazyImage(imageSrc, { rootMargin: "200px" });
 *
 * return (
 *   <img
 *     ref={ref}
 *     src={src}
 *     alt="..."
 *     className={isLoaded ? 'loaded' : 'loading'}
 *   />
 * );
 * ```
 */
export function useLazyImage(
  imageSrc: string,
  options: UseLazyImageOptions = {}
): UseLazyImageReturn {
  const { rootMargin = '100px', threshold = 0.01 } = options;

  const ref = useRef<HTMLImageElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Observer pour détecter la visibilité
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Si Intersection Observer n'est pas supporté, charger directement
    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold]);

  // Charger l'image quand elle devient visible
  useEffect(() => {
    if (!isInView || isLoaded || isLoading) return;

    setIsLoading(true);

    const img = new Image();
    img.src = imageSrc;

    img.onload = () => {
      setIsLoaded(true);
      setIsLoading(false);
    };

    img.onerror = () => {
      setIsLoading(false);
      // En cas d'erreur, on marque quand même comme "chargé" pour arrêter les tentatives
      setIsLoaded(true);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [isInView, imageSrc, isLoaded, isLoading]);

  // Générer un placeholder simple en SVG (gris)
  const placeholderSrc = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23e5e7eb' width='400' height='300'/%3E%3C/svg%3E`;

  return {
    ref,
    src: isLoaded ? imageSrc : placeholderSrc,
    isLoaded,
    isLoading,
  };
}

/**
 * Hook pour lazy loading avec image de preview basse résolution
 * Charge d'abord une image basse résolution, puis la haute résolution
 *
 * @example
 * ```tsx
 * const { ref, src, isHighResLoaded } = useLazyImageWithPreview(
 *   thumbnailUrl,
 *   fullImageUrl
 * );
 *
 * return (
 *   <img
 *     ref={ref}
 *     src={src}
 *     className={isHighResLoaded ? 'sharp' : 'blurred'}
 *   />
 * );
 * ```
 */
export function useLazyImageWithPreview(
  previewSrc: string,
  fullSrc: string,
  options: UseLazyImageOptions = {}
): UseLazyImageReturn & { isHighResLoaded: boolean } {
  const { rootMargin = '100px', threshold = 0.01 } = options;

  const ref = useRef<HTMLImageElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [highResLoaded, setHighResLoaded] = useState(false);

  // Observer pour détecter la visibilité
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold]);

  // Charger la preview d'abord
  useEffect(() => {
    if (!isInView || !previewSrc) return;

    const img = new Image();
    img.src = previewSrc;

    img.onload = () => {
      setPreviewLoaded(true);
    };

    return () => {
      img.onload = null;
    };
  }, [isInView, previewSrc]);

  // Charger la haute résolution après la preview
  useEffect(() => {
    if (!previewLoaded || !fullSrc) return;

    const img = new Image();
    img.src = fullSrc;

    img.onload = () => {
      setHighResLoaded(true);
    };

    return () => {
      img.onload = null;
    };
  }, [previewLoaded, fullSrc]);

  const placeholderSrc = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23e5e7eb' width='400' height='300'/%3E%3C/svg%3E`;

  let currentSrc = placeholderSrc;
  if (highResLoaded) {
    currentSrc = fullSrc;
  } else if (previewLoaded) {
    currentSrc = previewSrc;
  }

  return {
    ref,
    src: currentSrc,
    isLoaded: previewLoaded || highResLoaded,
    isLoading: isInView && !previewLoaded,
    isHighResLoaded: highResLoaded,
  };
}
