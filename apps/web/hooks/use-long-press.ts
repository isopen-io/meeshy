/**
 * Hook pour détecter une pression longue (long press)
 * Support mobile (touch) et desktop (mouse)
 *
 * @param callback - Fonction appelée après une pression longue
 * @param options - Options de configuration
 */

import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
  /**
   * Durée minimale de la pression en ms (défaut: 500ms)
   */
  threshold?: number;

  /**
   * Si true, empêche le comportement par défaut du navigateur
   */
  preventDefault?: boolean;

  /**
   * Callback appelé quand la pression démarre
   */
  onStart?: () => void;

  /**
   * Callback appelé quand la pression est annulée (relâchée trop tôt)
   */
  onCancel?: () => void;

  /**
   * Callback appelé pendant la pression (appelé chaque frame)
   */
  onProgress?: (progress: number) => void;
}

export function useLongPress<T extends HTMLElement = HTMLElement>(
  callback: (event: React.TouchEvent<T> | React.MouseEvent<T>, position: { x: number; y: number }) => void,
  options: UseLongPressOptions = {}
) {
  const {
    threshold = 500,
    preventDefault = true,
    onStart,
    onCancel,
    onProgress,
  } = options;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const eventRef = useRef<React.TouchEvent<T> | React.MouseEvent<T> | null>(null);
  const positionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressTimerRef.current !== null) {
      cancelAnimationFrame(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    isLongPressRef.current = false;
    startTimeRef.current = 0;
    eventRef.current = null;
  }, []);

  const updateProgress = useCallback(() => {
    if (!startTimeRef.current || !onProgress) return;

    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(elapsed / threshold, 1);

    onProgress(progress);

    if (progress < 1) {
      progressTimerRef.current = requestAnimationFrame(updateProgress);
    }
  }, [threshold, onProgress]);

  const start = useCallback(
    (event: React.TouchEvent<T> | React.MouseEvent<T>) => {
      if (preventDefault && event.target) {
        event.preventDefault();
      }

      // Capturer la position de l'événement
      const position = {
        x: 'clientX' in event ? event.clientX : event.touches[0].clientX,
        y: 'clientY' in event ? event.clientY : event.touches[0].clientY,
      };

      eventRef.current = event;
      positionRef.current = position;
      startTimeRef.current = Date.now();
      isLongPressRef.current = false;

      onStart?.();

      // Démarrer le suivi de progression si demandé
      if (onProgress) {
        updateProgress();
      }

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        callback(event, position);
        clear();
      }, threshold);
    },
    [callback, threshold, preventDefault, onStart, onProgress, updateProgress, clear]
  );

  const cancel = useCallback(() => {
    if (timerRef.current && !isLongPressRef.current) {
      onCancel?.();
    }
    clear();
  }, [clear, onCancel]);

  // Handlers pour touch events (mobile)
  const onTouchStart = useCallback(
    (event: React.TouchEvent<T>) => {
      start(event);
    },
    [start]
  );

  const onTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  const onTouchMove = useCallback(() => {
    cancel();
  }, [cancel]);

  // Handlers pour mouse events (desktop)
  const onMouseDown = useCallback(
    (event: React.MouseEvent<T>) => {
      start(event);
    },
    [start]
  );

  const onMouseUp = useCallback(() => {
    cancel();
  }, [cancel]);

  const onMouseLeave = useCallback(() => {
    cancel();
  }, [cancel]);

  // Handler onClick qui vérifie si un long press vient de se produire
  const onClick = useCallback((event: React.MouseEvent<T>) => {
    // Si un long press vient de se produire, bloquer le clic
    if (isLongPressRef.current) {
      event.preventDefault();
      event.stopPropagation();
      isLongPressRef.current = false; // Reset pour le prochain événement
    }
  }, []);

  return {
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onClick,
  };
}
