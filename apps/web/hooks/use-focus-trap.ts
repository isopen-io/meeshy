'use client';

import { useEffect, useRef } from 'react';

/**
 * Selector matching the natively-tabbable elements we keep focus within.
 * Mirrors the WAI-ARIA "Dialog (Modal)" pattern focusable set.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keyboard focus trap for hand-rolled `role="dialog"` / `aria-modal="true"`
 * overlays (those NOT built on a library that already traps focus).
 *
 * While `active` is true it:
 *  - moves focus into the dialog (first focusable element, or the container
 *    itself as a fallback — give the container `tabIndex={-1}`);
 *  - cycles Tab / Shift+Tab within the dialog so focus never escapes to the
 *    obscured background content (WCAG 2.4.3);
 *  - restores focus to the element that had it before opening, on close.
 *
 * Returns a ref to attach to the dialog container.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );

    // Move focus into the dialog if it is not already there.
    if (!container.contains(document.activeElement)) {
      const focusable = getFocusable();
      (focusable[0] ?? container).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey) {
        // Wrap backward off the first element (or container) to the last.
        if (activeEl === first || activeEl === container || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        // Wrap forward off the last element back to the first.
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever opened the dialog (if still in the document).
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}
