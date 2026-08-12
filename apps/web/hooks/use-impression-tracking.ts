'use client';

import { useCallback, useEffect, useRef } from 'react';
import { postsService, type ImpressionSource } from '@/services/posts.service';

interface UseImpressionTrackingOptions {
  /** Surface reported to the gateway (`feed`, `profile`, …). */
  readonly source: ImpressionSource;
  /** Turn tracking off entirely (e.g. anonymous routes). Defaults to true. */
  readonly enabled?: boolean;
  /** Visibility ratio that counts as an impression. Defaults to 0.5. */
  readonly threshold?: number;
  /** Debounce before a pending batch is flushed. Defaults to 1500ms. */
  readonly flushDelayMs?: number;
}

export interface ImpressionTracker {
  /**
   * `ref` callback for a list item (feed / profile grid). Pass the rendered
   * element and its post id; the post is recorded once it crosses `threshold`.
   * Called with `null` on unmount — the element is then unobserved.
   */
  readonly observe: (element: Element | null, postId: string) => void;
  /**
   * Imperatively record an impression for a single visible post (reels, where
   * one item is on screen at a time). Deduplicated like {@link observe}.
   */
  readonly record: (postId: string) => void;
}

/**
 * Batches post impressions and reports them to the gateway, mirroring the iOS
 * clients (`ReelsViewModel` / `ProfileUserPostsList`): one impression per
 * APPEARANCE on screen — a card scrolled away and back counts again — coalesced
 * into a single `/posts/impressions/batch` call after a short debounce (plus an
 * immediate flush on unmount or when the tab is hidden, so nothing is lost on
 * navigation). Elements stay observed after their first intersection, so the
 * observer re-fires on every re-entry; the gateway groups repeated ids and
 * increments `impressionCount` by the number of occurrences.
 *
 * Reporting is fire-and-forget — a failed impression must never surface to the
 * user or block rendering.
 */
export function useImpressionTracking(options: UseImpressionTrackingOptions): ImpressionTracker {
  const { source, enabled = true, threshold = 0.5, flushDelayMs = 1500 } = options;

  const pendingRef = useRef<string[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const idByElement = useRef<WeakMap<Element, string>>(new WeakMap());
  const elementById = useRef<Map<string, Element>>(new Map());

  const flush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingRef.current.length === 0) return;
    const ids = pendingRef.current;
    pendingRef.current = [];
    void postsService.recordImpressions(ids, source).catch(() => {});
  }, [source]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flush, flushDelayMs);
  }, [flush, flushDelayMs]);

  const enqueue = useCallback(
    (postId: string) => {
      if (!enabled || !postId) return;
      pendingRef.current.push(postId);
      scheduleFlush();
    },
    [enabled, scheduleFlush],
  );

  const ensureObserver = useCallback((): IntersectionObserver | null => {
    if (observerRef.current) return observerRef.current;
    if (typeof IntersectionObserver === 'undefined') return null;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = idByElement.current.get(entry.target);
          if (!id) continue;
          // L'élément reste observé : une sortie puis un retour à l'écran est
          // une NOUVELLE impression. `unobserve` ici plafonnait le compteur à
          // une impression par carte et par montage de la liste.
          enqueue(id);
        }
      },
      { threshold },
    );
    return observerRef.current;
  }, [threshold, enqueue]);

  const observe = useCallback(
    (element: Element | null, postId: string) => {
      if (!enabled || !postId) return;
      if (element === null) {
        const known = elementById.current.get(postId);
        if (known) {
          observerRef.current?.unobserve(known);
          idByElement.current.delete(known);
          elementById.current.delete(postId);
        }
        return;
      }
      if (elementById.current.has(postId)) return;
      const observer = ensureObserver();
      if (!observer) return;
      idByElement.current.set(element, postId);
      elementById.current.set(postId, element);
      observer.observe(element);
    },
    [enabled, ensureObserver],
  );

  const record = useCallback((postId: string) => enqueue(postId), [enqueue]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
      observerRef.current?.disconnect();
      observerRef.current = null;
      idByElement.current = new WeakMap();
      elementById.current.clear();
    };
  }, [flush]);

  return { observe, record };
}
