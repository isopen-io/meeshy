/**
 * Accessibility hooks and utilities
 * Provides reduced motion detection and sound feedback for better UX
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// REDUCED MOTION HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to detect user's prefers-reduced-motion setting
 * Returns true if user prefers reduced motion
 *
 * @example
 * const reducedMotion = useReducedMotion();
 * <div className={reducedMotion ? '' : 'animate-spin'} />
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOUND FEEDBACK UTILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sound feedback utility using Web Audio API
 * Provides audio cues for important actions
 *
 * All sounds are subtle, non-intrusive, and respect user preferences
 */
export const SoundFeedback = {
  audioContext: null as AudioContext | null,
  enabled: true,

  /**
   * Get or create the AudioContext
   * Lazy initialization to avoid autoplay restrictions
   */
  getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('[SoundFeedback] Web Audio API not supported');
        return null;
      }
    }
    return this.audioContext;
  },

  /**
   * Enable or disable sound feedback
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  },

  /**
   * Play a simple tone
   * @param frequency - Frequency in Hz
   * @param duration - Duration in seconds
   * @param type - Oscillator type
   * @param volume - Volume (0-1)
   */
  playTone(
    frequency: number,
    duration: number = 0.1,
    type: OscillatorType = 'sine',
    volume: number = 0.15
  ) {
    if (!this.enabled) return;

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      // Silently fail - audio is enhancement, not critical
    }
  },

  /**
   * Success sound - Two ascending tones
   * Use for: save success, profile created, action completed
   */
  playSuccess() {
    this.playTone(523.25, 0.1); // C5
    setTimeout(() => this.playTone(659.25, 0.15), 100); // E5
  },

  /**
   * Error sound - Low descending tone
   * Use for: save failed, validation error, action failed
   */
  playError() {
    this.playTone(220, 0.2, 'triangle', 0.2); // A3
  },

  /**
   * Click/tap sound - Quick subtle click
   * Use for: button clicks, toggle switches, selections
   */
  playClick() {
    this.playTone(800, 0.05, 'sine', 0.1);
  },

  /**
   * Toggle on sound - Ascending tone
   * Use for: switch enabled, checkbox checked
   */
  playToggleOn() {
    this.playTone(440, 0.08); // A4
    setTimeout(() => this.playTone(554.37, 0.08), 60); // C#5
  },

  /**
   * Toggle off sound - Descending tone
   * Use for: switch disabled, checkbox unchecked
   */
  playToggleOff() {
    this.playTone(554.37, 0.08); // C#5
    setTimeout(() => this.playTone(440, 0.08), 60); // A4
  },

  /**
   * Navigation sound - Soft blip
   * Use for: tab change, section navigation
   */
  playNavigate() {
    this.playTone(600, 0.06, 'sine', 0.08);
  },

  /**
   * Warning sound - Attention tone
   * Use for: confirmations, warnings before destructive actions
   */
  playWarning() {
    this.playTone(440, 0.15, 'triangle', 0.15);
  },

  /**
   * Recording start sound - Ascending sweep
   * Use for: microphone activated, recording started
   */
  playRecordingStart() {
    this.playTone(330, 0.1); // E4
    setTimeout(() => this.playTone(440, 0.1), 80); // A4
    setTimeout(() => this.playTone(550, 0.12), 160); // C#5
  },

  /**
   * Recording stop sound - Descending sweep
   * Use for: microphone deactivated, recording stopped
   */
  playRecordingStop() {
    this.playTone(550, 0.1); // C#5
    setTimeout(() => this.playTone(440, 0.1), 80); // A4
    setTimeout(() => this.playTone(330, 0.12), 160); // E4
  },

  /**
   * Delete/remove sound - Short low thud
   * Use for: item deleted, content removed
   */
  playDelete() {
    this.playTone(180, 0.12, 'triangle', 0.15);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FOCUS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to manage focus trap within a container
 * Useful for modals, dialogs, and dropdown menus
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement.focus();

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, isActive]);
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for arrow key navigation in lists/grids
 * Useful for navigating between cards, tabs, or menu items
 */
export function useArrowNavigation(
  items: HTMLElement[] | null,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
    onSelect?: (index: number) => void;
  } = {}
) {
  const { orientation = 'vertical', loop = true, onSelect } = options;

  const handleKeyDown = useCallback((e: KeyboardEvent, currentIndex: number) => {
    if (!items || items.length === 0) return;

    let nextIndex = currentIndex;
    const isVertical = orientation === 'vertical' || orientation === 'both';
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';

    switch (e.key) {
      case 'ArrowUp':
        if (isVertical) {
          e.preventDefault();
          nextIndex = currentIndex > 0 ? currentIndex - 1 : (loop ? items.length - 1 : 0);
        }
        break;
      case 'ArrowDown':
        if (isVertical) {
          e.preventDefault();
          nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : (loop ? 0 : items.length - 1);
        }
        break;
      case 'ArrowLeft':
        if (isHorizontal) {
          e.preventDefault();
          nextIndex = currentIndex > 0 ? currentIndex - 1 : (loop ? items.length - 1 : 0);
        }
        break;
      case 'ArrowRight':
        if (isHorizontal) {
          e.preventDefault();
          nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : (loop ? 0 : items.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect?.(currentIndex);
        return;
      default:
        return;
    }

    if (nextIndex !== currentIndex && items[nextIndex]) {
      items[nextIndex].focus();
    }
  }, [items, orientation, loop, onSelect]);

  return handleKeyDown;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN READER ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to announce messages to screen readers
 * Uses a live region to make announcements
 */
export function useAnnounce() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (typeof document === 'undefined') return;

    // Find or create the live region
    let liveRegion = document.getElementById('sr-live-region');

    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'sr-live-region';
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(liveRegion);
    }

    // Update priority if needed
    liveRegion.setAttribute('aria-live', priority);

    // Clear and set message (allows same message to be announced again)
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      liveRegion!.textContent = message;
    });
  }, []);

  return announce;
}
