import { useCallback, useEffect, useRef, useState } from 'react';

import { currentCredential, httpTransport } from '@/lib/api/client';
import type { Credential } from '@/lib/api/http';
import { apiDeps } from '@/lib/api/deps';
import { sessionIdentityKey, sessionStore } from '@/lib/api/session';
import {
  createSocialEventsRecorder,
  newEngagementSessionId,
  type ContentSurface,
  type DwellContentType,
  type ImpressionSource,
  type SocialEvent,
} from '@/lib/api/social-events';
import { createSocialEventsV2Recorder, type SocialEventsV2Recorder } from '@/lib/api/social-events-v2';
import type { ImpressionVisibility, ListingContext, PrismContext, SocialEventV2Input, TargetKind } from '@/lib/api/social-events-v2-types';
import { publicWebOrigin } from '@/lib/links/public-origin';
import { hasNavigatedInApp, useSearch } from '@/lib/router';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import type { OpenOrigin } from '@meeshy/shared/types/content-reach';

import { openLinkSearch, viewFieldsOf, viewProvenanceOf, type ViewAttribution } from './content-open';
import { cardContextOf, negativeOf, rememberCard } from '@/lib/telemetry/card-context';
import { noteListingItem } from '@/lib/telemetry/listing-registry';

import { liveSocialEventsContext } from './telemetry-context';
import {
  MRC_DISPLAY_MS,
  MRC_VISIBLE_FRACTION,
  createViewabilityClock,
  observeVisibility,
  trackVisibleTarget,
  type ViewabilityClock,
  type ViewabilityKind,
  type VisibilityDeps,
} from './viewability';

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

function visitorKey(): string {
  const storage = safeLocalStorage();
  const known = storage.getItem(VISITOR_KEY);
  if (known !== null && known.length > 0 && known.length <= 128) return known;
  const fresh = `visitor_${newEngagementSessionId()}`;
  storage.setItem(VISITOR_KEY, fresh);
  return fresh;
}

/** L'enveloppe d'un événement, posée à la MISE EN FILE (#10500). */
const stamp = () => ({ eventId: newEngagementSessionId(), occurredAt: new Date().toISOString() });

const schedule = (run: () => void, delayMs: number) => {
  setTimeout(run, delayMs);
};

/**
 * **LA FILE D'UNE PAGE QUI S'EN VA** (#10519) — une requête émise pendant le
 * déchargement n'est pas garantie (mesuré sur staging, Chrome 155 : le même
 * `fetch` keepalive émis au `pagehide` d'un rechargement est arrivé une fois
 * sur deux), et une page hors ligne n'envoie rien. La file d'un COMPTE est
 * donc GARDÉE en local au `pagehide` — sauf le lot déjà en vol, parti en
 * keepalive, qu'on ne compte pas deux fois — et reprise au chargement suivant
 * du même compte ; l'invité et le visiteur
 * n'ont pas de file (leur vue part seule, à l'ouverture). Chaque page garde
 * SA part : deux onglets fermés l'un après l'autre ne s'écrasent pas.
 */
export const READING_PENDING_PREFIX = 'meeshy.reading.pending.';

export function pendingReadingKey(identity: string | null): string | null {
  return identity !== null && identity.startsWith('u:') ? `${READING_PENDING_PREFIX}${identity}` : null;
}

type ParkedReading = { readonly page: string; readonly events: readonly SocialEvent[] };

function readParked(storage: SafeStorage, key: string): readonly ParkedReading[] {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const { page, events } = entry as { page?: unknown; events?: unknown };
      if (typeof page !== 'string' || !Array.isArray(events)) return [];
      return [{ page, events: events.filter(isSocialEvent) }];
    });
  } catch {
    return [];
  }
}

export function savePendingReading(storage: SafeStorage, key: string, page: string, events: readonly SocialEvent[]): void {
  const others = readParked(storage, key).filter((entry) => entry.page !== page);
  const next = events.length === 0 ? others : [...others, { page, events }];
  if (next.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(next));
}

function isSocialEvent(value: unknown): value is SocialEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.postId !== 'string') return false;
  if (event.type === 'view') return true;
  if (event.type === 'open') return true;
  if (event.type === 'impression') return typeof event.source === 'string';
  return event.type === 'dwell' && typeof event.sessionId === 'string';
}

export function takePendingReading(storage: SafeStorage, key: string): readonly SocialEvent[] {
  const parked = readParked(storage, key);
  storage.removeItem(key);
  return parked.flatMap((entry) => entry.events);
}

const currentPendingKey = (): string | null => pendingReadingKey(sessionIdentityKey(sessionStore.getState().session));
const THIS_PAGE = newEngagementSessionId();

let live: ReturnType<typeof createSocialEventsRecorder> | null = null;
let liveV2: SocialEventsV2Recorder | null = null;

function liveRecorder(): ReturnType<typeof createSocialEventsRecorder> {
  if (live !== null) return live;
  const recorder = createSocialEventsRecorder({
    transport: httpTransport,
    credential: currentCredential,
    visitorKey,
    schedule,
    stamp,
    context: liveSocialEventsContext,
  });
  const key = currentPendingKey();
  if (key !== null) recorder.restore(takePendingReading(safeLocalStorage(), key));
  if (typeof window !== 'undefined') window.addEventListener('online', () => void recorder.flush());
  watchPageLifecycle();
  live = recorder;
  return recorder;
}

/** La file v2 (#10500) — ses requêtes ne portent jamais un type de comptage. */
function liveRecorderV2(): SocialEventsV2Recorder {
  if (liveV2 !== null) return liveV2;
  const recorder = createSocialEventsV2Recorder({
    transport: httpTransport,
    credential: currentCredential,
    visitorKey,
    context: liveSocialEventsContext,
    stamp,
    schedule,
    now: () => Date.now(),
    random: () => Math.random(),
  });
  liveV2 = recorder;
  return recorder;
}

/**
 * **CE QUI EST EN COURS DE LECTURE QUAND LA PAGE S'EN VA** (#10519) — le
 * nettoyage d'un effet ne tourne ni quand l'onglet se ferme ou se recharge,
 * ni quand la coque passe en arrière-plan. Les séances ouvertes s'inscrivent
 * ici, et un seul jeu d'écouteurs tient l'ordre : FERMER les séances, PUIS
 * s'occuper de la file. Onglet masqué (la page vit encore) : la file part
 * tout de suite. `pagehide` (la page se décharge, ou entre dans le cache de
 * pages) : la file est gardée. Retour (onglet visible, page rendue par le
 * cache) : les séances se rouvrent ; une page rendue par le cache oublie sa
 * copie gardée, sa file en mémoire partant normalement.
 */
type OpenSession = { readonly pause: () => void; readonly resume: () => void };

const openSessions = new Set<OpenSession>();
let watchedDocument: Document | null = null;

const pauseSessions = (): void => openSessions.forEach((session) => session.pause());
const resumeSessions = (): void => openSessions.forEach((session) => session.resume());

function watchPageLifecycle(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || watchedDocument === document) return;
  watchedDocument = document;
  window.addEventListener('pagehide', () => {
    pauseSessions();
    readingTelemetry.persistOnExit();
  });
  window.addEventListener('pageshow', (event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    readingTelemetry.forgetPersisted();
    resumeSessions();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') {
      resumeSessions();
      return;
    }
    pauseSessions();
    readingTelemetry.flushNow();
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
    forgetVisitorKeyOnAccount(currentCredential(), safeLocalStorage());
    liveRecorder().record(event);
  },
  /** Un événement du catalogue v2 (#10499) — interaction, négatif, lecture, défilement, capture… */
  recordV2(event: SocialEventV2Input): void {
    if (__FIXTURES__ && apiDeps.source === 'fixtures') return;
    forgetVisitorKeyOnAccount(currentCredential(), safeLocalStorage());
    liveRecorderV2().record(event);
  },
  flushNow(): void {
    if (live !== null) void live.flush();
    if (liveV2 !== null) void liveV2.flush({ keepalive: true });
  },
  persistOnExit(): void {
    const key = currentPendingKey();
    if (live !== null && key !== null) savePendingReading(safeLocalStorage(), key, THIS_PAGE, live.snapshot());
    if (liveV2 !== null) void liveV2.flush({ keepalive: true });
  },
  forgetPersisted(): void {
    const key = currentPendingKey();
    if (live !== null && key !== null) savePendingReading(safeLocalStorage(), key, THIS_PAGE, []);
  },
};

/** Le type d'une séance `dwell` depuis le `Post.type` servi — `POST` par défaut. */
export function dwellContentTypeOf(type: string | undefined): DwellContentType {
  return type === 'REEL' || type === 'STORY' || type === 'STATUS' ? type : 'POST';
}

/** Une impression : au moins la moitié de la carte, une seconde d'affilée. */
export const IMPRESSION_VISIBLE_RATIO = MRC_VISIBLE_FRACTION;
export const IMPRESSION_DWELL_MS = MRC_DISPLAY_MS;

/**
 * Observe un nœud et appelle `onImpression` UNE fois par APPARITION : la
 * carte doit rester visible à 50 % pendant une seconde ; elle ne recompte
 * qu'après être sortie de l'écran (un aller-retour de défilement est une
 * nouvelle impression, comme sur iOS). Sans `IntersectionObserver`, rien.
 *
 * #10501 — l'observateur est PARTAGÉ par toute la page (`viewability.ts`),
 * et chaque apparition tient son horloge MRC : l'impression porte la
 * visibilité connue à son départ, `onExit` la visibilité finale de
 * l'apparition (sortie de l'écran ou démontage).
 */
export function observeImpression(
  node: Element,
  onImpression: (visibility: ImpressionVisibility) => void,
  deps: VisibilityDeps & {
    readonly setTimer?: (run: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
    readonly now?: () => number;
    readonly kind?: ViewabilityKind;
    readonly onExit?: (visibility: ImpressionVisibility) => void;
  } = {},
): () => void {
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;
  const kind = deps.kind ?? 'display';

  let clock: ViewabilityClock | null = null;
  let armed: unknown = null;
  let fired = false;

  const endAppearance = () => {
    if (armed !== null) clearTimer(armed);
    armed = null;
    if (fired && clock !== null) deps.onExit?.(clock.snapshot(now()));
    fired = false;
    clock = null;
  };

  const stop = observeVisibility(node, (fraction) => {
    if (clock === null && fraction > 0) clock = createViewabilityClock(kind);
    clock?.update(fraction, now());
    if (fraction < IMPRESSION_VISIBLE_RATIO) {
      endAppearance();
      return;
    }
    if (armed !== null || fired) return;
    armed = setTimer(() => {
      armed = null;
      fired = true;
      const current = clock ?? createViewabilityClock(kind);
      onImpression(current.snapshot(now()));
    }, IMPRESSION_DWELL_MS);
  }, deps);
  return () => {
    stop();
    endAppearance();
  };
}

export type ImpressionOptions = {
  /** La place de la carte dans son listing (#10501) — position, page servie, source de classement. */
  readonly listing?: ListingContext;
  /** Le genre de la cible (#10502) ; à défaut, déduit de la source. */
  readonly targetKind?: TargetKind;
  /** Une vidéo qui joue n'est visible au sens MRC qu'après 2 s. */
  readonly kind?: ViewabilityKind;
  /** Ce que le Prisme sert sur la carte (#10502) — relu par les gestes. */
  readonly prism?: PrismContext;
};

const targetKindOf = (source: ImpressionSource): TargetKind => (source === 'story' ? 'story' : source === 'status' ? 'status' : 'post');

/**
 * La référence à poser sur une carte : une impression `source` par
 * APPARITION, dite depuis l'écran `surface` (#10483 § 8). Règle de comptage
 * du porteur : chaque listage compte, un aller-retour de défilement comme
 * l'humeur d'un avatar répétée de bulle en bulle — mais jamais un simple
 * re-rendu (la référence est stable tant que ses primitives le sont).
 * `source === null` ou `postId` absent ⇒ rien n'est observé. Aucun état
 * React : la carte ne se re-rend pas pour être observée.
 *
 * #10501 — l'impression porte sa visibilité et son listing ; la fin de
 * l'apparition émet `visibility/measured`, reliée par `impressionEventId`.
 * La carte entre aussi au registre de ce qui est à l'écran, que la
 * détection de capture lit (#10508).
 */
export function useImpressionRef(
  postId: string | undefined,
  source: ImpressionSource | null,
  surface?: ContentSurface,
  options: ImpressionOptions = {},
): (node: Element | null) => void {
  const stop = useRef<(() => void) | null>(null);
  const { listing, targetKind, kind, prism } = options;
  const displayedLanguage = prism?.displayedLanguage;
  const originalLanguage = prism?.originalLanguage;
  const translated = prism?.translated;
  const feedRequestId = listing?.feedRequestId;
  const position = listing?.position;
  const rankingSource = listing?.rankingSource;
  const listingSessionId = listing?.listingSessionId;
  return useCallback((node: Element | null) => {
    stop.current?.();
    stop.current = null;
    if (node === null || postId === undefined || postId === '' || source === null) return;
    const listed: ListingContext | undefined =
      feedRequestId === undefined && position === undefined && rankingSource === undefined && listingSessionId === undefined
        ? undefined
        : {
            ...(feedRequestId === undefined ? {} : { feedRequestId }),
            ...(position === undefined ? {} : { position }),
            ...(rankingSource === undefined ? {} : { rankingSource }),
            ...(listingSessionId === undefined ? {} : { listingSessionId }),
          };
    const target = { kind: targetKind ?? targetKindOf(source), id: postId };
    const placed = { ...(surface === undefined ? {} : { surface }), ...(listed === undefined ? {} : { listing: listed }) };
    const served: PrismContext | undefined =
      displayedLanguage === undefined || translated === undefined
        ? undefined
        : { displayedLanguage, ...(originalLanguage === undefined ? {} : { originalLanguage }), translated, ...(translated ? { translationSource: 'server' as const } : {}) };
    rememberCard(postId, { targetKind: target.kind, ...placed, ...(served === undefined ? {} : { prism: served }), shownAt: Date.now() });
    let impressionEventId: string | null = null;
    const stopImpression = observeImpression(
      node,
      (visibility) => {
        impressionEventId = newEngagementSessionId();
        readingTelemetry.record({ type: 'impression', postId, source, ...placed, eventId: impressionEventId, visibility });
        noteListingItem(listed, visibility.viewable);
      },
      {
        ...(kind === undefined ? {} : { kind }),
        onExit: (visibility) => {
          readingTelemetry.recordV2({
            type: 'visibility',
            action: 'measured',
            target,
            ...placed,
            ...(impressionEventId === null ? {} : { impressionEventId }),
            ...visibility,
          });
        },
      },
    );
    const stopTracking = trackVisibleTarget(node, target);
    stop.current = () => {
      stopImpression();
      stopTracking();
    };
  }, [postId, source, surface, targetKind, kind, feedRequestId, position, rankingSource, listingSessionId, displayedLanguage, originalLanguage, translated]);
}

/** Deux références posées sur le MÊME nœud (la story d'une tuile ET son humeur). */
export function useMergedRefs(...refs: readonly ((node: Element | null) => void)[]): (node: Element | null) => void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((node: Element | null) => refs.forEach((ref) => ref(node)), refs);
}

/**
 * LE PASSAGE ÉCLAIR (#10503) — un réel ou une story quitté en moins d'une
 * seconde est un signal négatif IMPLICITE (`negative/quick_skip`), dérivé
 * ici, au seul site qui connaît la durée de la séance.
 */
export const QUICK_SKIP_MS = 1000;
const QUICK_SKIP_KINDS: ReadonlySet<DwellContentType> = new Set(['REEL', 'STORY']);

const sessionTargetKindOf = (contentType: DwellContentType): TargetKind =>
  contentType === 'REEL' ? 'reel' : contentType === 'STORY' ? 'story' : contentType === 'STATUS' ? 'status' : 'post';

/**
 * **UNE SÉANCE DE LECTURE** — un contenu ouvert en plein (détail d'un post,
 * réel actif, story à l'écran). À l'ouverture : l'impression `source` et, si
 * `openView`, la vue (comptée tout de suite, sans seuil). À la sortie : la vue
 * reprise avec sa durée (la passerelle garde la plus longue) et la séance
 * `dwell`, temps passé compris. Pour un visiteur, la vue de sortie part
 * aussi (sa durée) ; la séance `dwell`, réservée aux comptes, est écartée
 * par l'émetteur. La page qui s'en va (onglet fermé, rechargé, masqué, coque
 * en arrière-plan) ferme la séance comme une sortie ; le retour en ouvre une
 * nouvelle, sans recompter l'impression ni l'ouverture (#10519).
 */
export function useReadingSession(params: {
  readonly postId: string | undefined;
  readonly active: boolean;
  readonly contentType: DwellContentType;
  readonly surface: ContentSurface;
  readonly impressionSource: ImpressionSource | null;
  readonly openView: boolean;
  /**
   * PAR OÙ l'écran est arrivé (#10483) — lu à l'ACTIVATION, jamais une
   * dépendance : la vue d'ouverture et la vue de sortie d'une séance portent
   * la même provenance. Absent ⇒ la vue n'en porte aucune.
   */
  readonly attribution?: (postId: string) => ViewAttribution;
  readonly now?: () => number;
}): void {
  const { postId, active, contentType, surface, impressionSource, openView } = params;
  const now = params.now ?? Date.now;
  const nowRef = useRef(now);
  nowRef.current = now;
  const attributionRef = useRef(params.attribution);
  attributionRef.current = params.attribution;

  useEffect(() => {
    if (!active || postId === undefined) return;
    let startedAt: number | null = nowRef.current();
    const attribution = attributionRef.current;
    const provenance = attribution === undefined ? {} : viewFieldsOf(attribution(postId));
    if (impressionSource !== null) readingTelemetry.record({ type: 'impression', postId, source: impressionSource, surface });
    if (openView) readingTelemetry.record({ type: 'view', postId, surface, ...provenance });
    const targetKind = sessionTargetKindOf(contentType);
    if (cardContextOf(postId)?.surface !== surface) rememberCard(postId, { targetKind, surface, shownAt: Date.now() });
    let shownMs = 0;
    const close = () => {
      if (startedAt === null) return;
      const dwellMs = Math.max(0, nowRef.current() - startedAt);
      const opened = startedAt;
      startedAt = null;
      shownMs += dwellMs;
      readingTelemetry.record({ type: 'view', postId, durationMs: dwellMs, surface, ...provenance });
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
      if (QUICK_SKIP_KINDS.has(contentType) && shownMs < QUICK_SKIP_MS) {
        readingTelemetry.recordV2(negativeOf(postId, 'quick_skip', { visibleMs: Math.round(shownMs) }));
      }
    };
  }, [postId, active, contentType, surface, impressionSource, openView]);
}

/**
 * **LE TAP SUR UN CONTENU D'UN LISTING** (#10483) — l'engagement d'ouverture
 * et son listing d'origine. Il ne compte AUCUNE vue : c'est l'écran ouvert
 * qui la compte, avec sa provenance.
 */
export function recordContentOpen(postId: string, origin: OpenOrigin): void {
  readingTelemetry.record({ type: 'open', postId, origin });
}

/**
 * Les props d'un `<Link>` qui OUVRE un contenu depuis un listing : l'adresse
 * porte `?from=<origine>` (fusionnée à sa propre requête) et le clic envoie
 * l'engagement `open`. Sans origine (la fiche elle-même), rien n'est ajouté.
 */
export function openLinkProps(
  postId: string,
  origin: OpenOrigin | null,
  search: Readonly<Record<string, string>> = {},
): { readonly search: Record<string, string>; readonly onClick?: () => void } {
  const merged = { ...search, ...openLinkSearch(origin) };
  return origin === null ? { search: merged } : { search: merged, onClick: () => recordContentOpen(postId, origin) };
}

/**
 * Le référent de l'ATTERRISSAGE — vide dès que le lecteur a avancé dans
 * l'application. Un objet à méthode, comme `readingTelemetry` : un témoin le
 * remplace pour jouer une arrivée depuis un autre site.
 */
export const arrival = {
  referrer(): string {
    if (typeof document === 'undefined' || hasNavigatedInApp()) return '';
    return document.referrer;
  },
};

function ownOrigins(): readonly string[] {
  if (typeof window === 'undefined') return [];
  return [publicWebOrigin(window.location.origin), window.location.origin];
}

/**
 * La provenance d'un écran détail, lue UNE fois à son montage : c'est
 * l'adresse par laquelle il est entré, pas celle où il en sera dans dix gestes.
 */
export function useViewAttribution(): ViewAttribution {
  const [search] = useSearch();
  const [attribution] = useState(() => viewProvenanceOf(search, arrival.referrer(), ownOrigins()));
  return attribution;
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
