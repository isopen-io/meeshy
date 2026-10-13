import { useCallback, useEffect, useRef } from 'react';

import { currentCredential, httpTransport } from '@/lib/api/client';
import type { Credential } from '@/lib/api/http';
import { apiDeps } from '@/lib/api/deps';
import {
  createSocialEventsRecorder,
  newEngagementSessionId,
  type ContentSurface,
  type DwellContentType,
  type FlushOptions,
  type ImpressionSource,
  type SocialEvent,
} from '@/lib/api/social-events';
import { safeLocalStorage } from '@/lib/storage';

/**
 * **CE QUE LE LECTEUR A VU, DIT À LA PASSERELLE** (#10401) — le site unique
 * par lequel une surface web (navigateur, PWA, coque Android) déclare une
 * impression, une vue ou un temps de lecture. `record` est la seule porte :
 * un témoin l'observe, une surface l'appelle, jamais `fetch`.
 *
 * Sur fixtures (ni session ni passerelle) rien ne part — même garde que
 * `markStoryViewed`.
 */
const VISITOR_KEY = 'meeshy.reading.visitor';

type KeyStorage = Pick<Storage, 'getItem' | 'removeItem'>;

/**
 * La clé de visiteur n'a plus d'objet une fois un compte connecté (#10483 —
 * « purgée quand un compte se connecte ») : un uuid sans lien avec la
 * personne, qui ne doit pas survivre à côté de son compte.
 */
export function forgetVisitorKeyOnAccount(credential: Credential | null, storage: KeyStorage): void {
  if (credential?.kind !== 'registered') return;
  if (storage.getItem(VISITOR_KEY) === null) return;
  storage.removeItem(VISITOR_KEY);
}

/**
 * LA SORTIE DE PAGE NE PERD RIEN (#10483 W3) — `pagehide` et le passage en
 * arrière-plan vident la file en `keepalive` : la requête survit au
 * déchargement de l'onglet. Le retour en ligne rejoue la file normalement.
 */
export function bindPageExitFlush(
  flush: (options?: FlushOptions) => Promise<void>,
  targets: { readonly window: Pick<Window, 'addEventListener'>; readonly document: Pick<Document, 'addEventListener' | 'visibilityState'> },
): void {
  const leaving = () => void flush({ keepalive: true });
  targets.window.addEventListener('online', () => void flush());
  targets.window.addEventListener('pagehide', leaving);
  targets.document.addEventListener('visibilitychange', () => {
    if (targets.document.visibilityState === 'hidden') leaving();
  });
}

function visitorKey(): string {
  const storage = safeLocalStorage();
  const known = storage.getItem(VISITOR_KEY);
  if (known !== null && known.length > 0 && known.length <= 128) return known;
  const fresh = `visitor_${newEngagementSessionId()}`;
  storage.setItem(VISITOR_KEY, fresh);
  return fresh;
}

let live: ReturnType<typeof createSocialEventsRecorder> | null = null;

function liveRecorder(): ReturnType<typeof createSocialEventsRecorder> {
  if (live !== null) return live;
  const recorder = createSocialEventsRecorder({
    transport: httpTransport,
    credential: currentCredential,
    visitorKey,
    schedule: (run, delayMs) => {
      setTimeout(run, delayMs);
    },
  });
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    bindPageExitFlush(recorder.flush, { window, document });
  }
  live = recorder;
  return recorder;
}

export const readingTelemetry = {
  record(event: SocialEvent): void {
    if (__FIXTURES__ && apiDeps.source === 'fixtures') return;
    forgetVisitorKeyOnAccount(currentCredential(), safeLocalStorage());
    liveRecorder().record(event);
  },
};

/** Le type d'une séance `dwell` depuis le `Post.type` servi — `POST` par défaut. */
export function dwellContentTypeOf(type: string | undefined): DwellContentType {
  return type === 'REEL' || type === 'STORY' || type === 'STATUS' ? type : 'POST';
}

/** Une impression : au moins la moitié de la carte, une seconde d'affilée. */
export const IMPRESSION_VISIBLE_RATIO = 0.5;
export const IMPRESSION_DWELL_MS = 1000;

type ObserverCtor = new (
  callback: (entries: readonly { readonly isIntersecting: boolean; readonly intersectionRatio: number }[]) => void,
  options: { threshold: number[] },
) => { observe(node: Element): void; disconnect(): void };

/**
 * Observe un nœud et appelle `onImpression` UNE fois par APPARITION : la
 * carte doit rester visible à 50 % pendant une seconde ; elle ne recompte
 * qu'après être sortie de l'écran (un aller-retour de défilement est une
 * nouvelle impression, comme sur iOS). Sans `IntersectionObserver`, rien.
 */
export function observeImpression(
  node: Element,
  onImpression: () => void,
  deps: {
    readonly Observer?: ObserverCtor | undefined;
    readonly setTimer?: (run: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
  } = {},
): () => void {
  const Observer = deps.Observer ?? (globalThis as { IntersectionObserver?: ObserverCtor }).IntersectionObserver;
  if (typeof Observer !== 'function') return () => undefined;
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let armed: unknown = null;
  const observer = new Observer((entries) => {
    const last = entries[entries.length - 1];
    if (last === undefined) return;
    const visible = last.isIntersecting && last.intersectionRatio >= IMPRESSION_VISIBLE_RATIO;
    if (visible && armed === null) {
      armed = setTimer(onImpression, IMPRESSION_DWELL_MS);
      return;
    }
    if (!visible && armed !== null) {
      clearTimer(armed);
      armed = null;
    }
  }, { threshold: [0, IMPRESSION_VISIBLE_RATIO] });
  observer.observe(node);
  return () => {
    observer.disconnect();
    if (armed !== null) clearTimer(armed);
    armed = null;
  };
}

/**
 * La référence à poser sur une carte : une impression `source` par
 * apparition, dite depuis l'écran `surface` (#10483 § 8). `source === null`
 * ou `postId` absent ⇒ rien n'est observé. `oncePerMount` : un contenu qui
 * reste monté ne recompte pas à chaque retour à l'écran (l'humeur d'un
 * avatar, répétée de bulle en bulle). Aucun état React : la carte ne se
 * re-rend pas pour être observée.
 */
export function useImpressionRef(
  postId: string | undefined,
  source: ImpressionSource | null,
  surface?: ContentSurface,
  options: { readonly oncePerMount?: boolean } = {},
): (node: Element | null) => void {
  const stop = useRef<(() => void) | null>(null);
  const counted = useRef<Set<string>>(new Set());
  const once = options.oncePerMount === true;
  return useCallback((node: Element | null) => {
    stop.current?.();
    stop.current = null;
    if (node === null || postId === undefined || postId === '' || source === null) return;
    if (once && counted.current.has(postId)) return;
    stop.current = observeImpression(node, () => {
      if (once) {
        if (counted.current.has(postId)) return;
        counted.current.add(postId);
      }
      readingTelemetry.record({ type: 'impression', postId, source, ...(surface === undefined ? {} : { surface }) });
    });
  }, [postId, source, surface, once]);
}

/** Deux références posées sur le MÊME nœud (la story d'une tuile ET son humeur). */
export function useMergedRefs(...refs: readonly ((node: Element | null) => void)[]): (node: Element | null) => void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((node: Element | null) => refs.forEach((ref) => ref(node)), refs);
}

/**
 * **UNE SÉANCE DE LECTURE** — un contenu ouvert en plein (détail d'un post,
 * réel actif, story à l'écran). À l'ouverture : l'impression `source` et, si
 * `openView`, la vue (comptée tout de suite, sans seuil). À la sortie : la vue
 * reprise avec sa durée (la passerelle garde la plus longue) et la séance
 * `dwell`, temps passé compris. Pour un visiteur, la vue de sortie part
 * aussi (sa durée) ; la séance `dwell`, réservée aux comptes, est écartée
 * par l'émetteur.
 */
export function useReadingSession(params: {
  readonly postId: string | undefined;
  readonly active: boolean;
  readonly contentType: DwellContentType;
  readonly surface: ContentSurface;
  readonly impressionSource: ImpressionSource | null;
  readonly openView: boolean;
  readonly now?: () => number;
}): void {
  const { postId, active, contentType, surface, impressionSource, openView } = params;
  const now = params.now ?? Date.now;
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    if (!active || postId === undefined) return;
    const startedAt = nowRef.current();
    if (impressionSource !== null) readingTelemetry.record({ type: 'impression', postId, source: impressionSource, surface });
    if (openView) readingTelemetry.record({ type: 'view', postId, surface });
    return () => {
      const dwellMs = Math.max(0, nowRef.current() - startedAt);
      readingTelemetry.record({ type: 'view', postId, durationMs: dwellMs, surface });
      readingTelemetry.record({
        type: 'dwell',
        sessionId: newEngagementSessionId(),
        postId,
        contentType,
        surface,
        startedAt: new Date(startedAt).toISOString(),
        dwellMs,
        completed: false,
      });
    };
  }, [postId, active, contentType, surface, impressionSource, openView]);
}

/**
 * La source d'une ouverture de détail (#10483 W5) — une notification pose
 * `?from=notification`, un lien partagé `?via=<jeton>` ; sinon `detail`.
 */
export function detailImpressionSourceOf(search: URLSearchParams): ImpressionSource {
  if (search.get('from') === 'notification') return 'notification';
  if ((search.get('via') ?? '') !== '') return 'shared_link';
  return 'detail';
}
