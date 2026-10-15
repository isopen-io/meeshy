import type { EventSurface, SocialEventV2Input, VisibleTarget } from '@/lib/api/social-events-v2-types';
import type { CoqueNative } from '@/lib/native-shell';

/**
 * **LA CAPTURE D'UN CONTENU DÉTECTÉE PAR LA COQUE** (#10508, décision § 5) —
 * le second abonné de `MeeshyScreenGuard`, à côté de celui des
 * conversations (#9617, `capture/screen-capture-reports.ts`) qui garde
 * l'annonce des messages éphémères.
 *
 * - `screenCaptured` (Android 14+, `registerScreenCaptureCallback`) :
 *   `screen_capture/screenshot`, avec les cibles À L'ÉCRAN (≤ 10, registre de
 *   `viewability.ts`) et l'écran.
 * - `recordingChanged` (Android 15+) : `recording_started` puis
 *   `recording_stopped` et sa durée — enregistrement OU recopie.
 *
 * Ce qui part : QU'il y a eu capture, où, et ce qui était visible. Jamais
 * l'image, jamais un contenu. Un navigateur n'a aucune API de détection :
 * sans greffon déclaré, rien n'est écouté ni émis. Dans une conversation,
 * rien non plus.
 */
const PLUGIN = 'MeeshyScreenGuard';

export type CaptureScene = { readonly surface: EventSurface | null; readonly visibleTargets: readonly VisibleTarget[] };

export type CaptureDetectionState = { readonly screenshot: boolean; readonly recording: boolean };

const SURFACES: readonly (readonly [RegExp, EventSurface])[] = [
  [/^\/feed\/?$/, 'feed'],
  [/^\/(post|mood|feeds\/post)\/[^/]+\/?$/, 'detail'],
  [/^\/reels?(\/[^/]+)?\/?$/, 'reels'],
  [/^\/story\/[^/]+\/?$/, 'story'],
  [/^\/stories\/?$/, 'story_rail'],
  [/^\/u\/[^/]+/, 'profile'],
  [/^\/hashtag\/[^/]+/, 'hashtag'],
  [/^\/me\/bookmarks\/?$/, 'bookmarks'],
];

/** L'écran de contenu d'une adresse ; `null` hors contenu (conversations, réglages…). */
export function captureSurfaceOf(pathname: string): EventSurface | null {
  return SURFACES.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

type NativeState = { readonly screenshotDetection?: unknown; readonly recordingDetection?: unknown; readonly recording?: unknown };

export function startContentCaptureReports(deps: {
  readonly coque: CoqueNative | undefined;
  readonly record: (event: SocialEventV2Input) => void;
  readonly collect: () => CaptureScene;
  readonly now: () => number;
  readonly onDetection: (state: CaptureDetectionState) => void;
}): () => void {
  const { coque } = deps;
  const declared = coque?.PluginHeaders?.some((header) => header.name === PLUGIN) === true;
  const addListener = coque?.addListener;
  if (coque === undefined || !declared || typeof addListener !== 'function') return () => undefined;

  let recordingSince: number | null = null;

  const emit = (action: 'screenshot' | 'recording_started' | 'recording_stopped', extra: { readonly recordingMs?: number } = {}) => {
    const { surface, visibleTargets } = deps.collect();
    if (surface === null) return;
    const captureKind = action === 'screenshot' ? 'screenshot' : 'recording_or_mirroring';
    deps.record({ type: 'screen_capture', action, surface, visibleTargets, captureKind, ...extra });
  };

  const recordingChanged = (now: boolean) => {
    if (now && recordingSince === null) {
      recordingSince = deps.now();
      emit('recording_started');
      return;
    }
    if (!now && recordingSince !== null) {
      const recordingMs = Math.max(0, Math.round(deps.now() - recordingSince));
      recordingSince = null;
      emit('recording_stopped', { recordingMs });
    }
  };

  const handles = [
    addListener(PLUGIN, 'screenCaptured', () => emit('screenshot')),
    addListener(PLUGIN, 'recordingChanged', (data) => recordingChanged((data as NativeState | null)?.recording === true)),
  ];

  let live = true;
  if (typeof coque.nativePromise === 'function') {
    void coque
      .nativePromise(PLUGIN, 'getState', {})
      .then((raw) => {
        if (!live) return;
        const state = raw as NativeState | null;
        deps.onDetection({ screenshot: state?.screenshotDetection === true, recording: state?.recordingDetection === true });
        if (state?.recording === true) recordingChanged(true);
      })
      .catch(() => undefined);
  }

  return () => {
    live = false;
    handles.forEach((handle) => void handle.remove());
  };
}
