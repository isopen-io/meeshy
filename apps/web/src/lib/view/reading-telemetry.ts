import { useCallback, useEffect, useRef } from 'react';

import { currentCredential, httpTransport } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import {
  createSocialEventsRecorder,
  newEngagementSessionId,
  type DwellContentType,
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
  if (typeof window !== 'undefined') window.addEventListener('online', () => void recorder.flush());
  watchPageLifecycle();
  live = recorder;
  return recorder;
}

/**
 * **CE QUI EST EN COURS DE LECTURE QUAND LA PAGE S'EN VA** (#10519) — le
 * nettoyage d'un effet ne tourne ni quand l'onglet se ferme ou se recharge,
 * ni quand la coque passe en arrière-plan. Les séances ouvertes s'inscrivent
 * ici : la sortie (`pagehide`, onglet masqué) les FERME toutes, PUIS vide la
 * file en keepalive ; le retour (onglet visible, page restaurée du cache) les
 * rouvre. Un seul jeu d'écouteurs, donc un seul ordre : fermer, puis vider.
 */
type OpenSession = { readonly pause: () => void; readonly resume: () => void };

const openSessions = new Set<OpenSession>();
let watchedDocument: Document | null = null;

function leavePage(): void {
  openSessions.forEach((session) => session.pause());
  readingTelemetry.flushOnExit();
}

function returnToPage(): void {
  openSessions.forEach((session) => session.resume());
}

function watchPageLifecycle(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || watchedDocument === document) return;
  watchedDocument = document;
  window.addEventListener('pagehide', leavePage);
  window.addEventListener('pageshow', returnToPage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leavePage();
    else returnToPage();
  });
}

function trackOpenSession(session: OpenSession): () => void {
  watchPageLifecycle();
  openSessions.add(session);
  return () => {
    openSessions.delete(session);
  };
}

export const readingTelemetry = {
  record(event: SocialEvent): void {
    if (__FIXTURES__ && apiDeps.source === 'fixtures') return;
    liveRecorder().record(event);
  },
  flushOnExit(): void {
    if (live === null) return;
    void live.flush({ keepalive: true });
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
 * apparition. `source === null` ou `postId` absent ⇒ rien n'est observé.
 * Aucun état React : la carte ne se re-rend pas pour être observée.
 */
export function useImpressionRef(
  postId: string | undefined,
  source: ImpressionSource | null,
): (node: Element | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((node: Element | null) => {
    stop.current?.();
    stop.current = null;
    if (node === null || postId === undefined || source === null) return;
    stop.current = observeImpression(node, () => readingTelemetry.record({ type: 'impression', postId, source }));
  }, [postId, source]);
}

/**
 * **UNE SÉANCE DE LECTURE** — un contenu ouvert en plein (détail d'un post,
 * réel actif, story à l'écran). À l'ouverture : l'impression `source` et, si
 * `openView`, la vue (comptée tout de suite, sans seuil). À la sortie : la vue
 * reprise avec sa durée (la passerelle garde la plus longue) et la séance
 * `dwell`, temps passé compris. La page qui s'en va (onglet fermé, rechargé,
 * masqué, coque en arrière-plan) ferme la séance comme une sortie ; le retour
 * en ouvre une nouvelle, sans recompter l'impression ni l'ouverture (#10519).
 */
export function useReadingSession(params: {
  readonly postId: string | undefined;
  readonly active: boolean;
  readonly contentType: DwellContentType;
  readonly surface: string;
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
    let startedAt: number | null = nowRef.current();
    if (impressionSource !== null) readingTelemetry.record({ type: 'impression', postId, source: impressionSource });
    if (openView) readingTelemetry.record({ type: 'view', postId });
    const close = () => {
      if (startedAt === null) return;
      const dwellMs = Math.max(0, nowRef.current() - startedAt);
      const opened = startedAt;
      startedAt = null;
      readingTelemetry.record({ type: 'view', postId, durationMs: dwellMs });
      readingTelemetry.record({
        type: 'dwell',
        sessionId: newEngagementSessionId(),
        postId,
        contentType,
        surface,
        startedAt: new Date(opened).toISOString(),
        dwellMs,
        completed: false,
      });
    };
    const untrack = trackOpenSession({
      pause: close,
      resume: () => {
        if (startedAt === null) startedAt = nowRef.current();
      },
    });
    return () => {
      untrack();
      close();
    };
  }, [postId, active, contentType, surface, impressionSource, openView]);
}
