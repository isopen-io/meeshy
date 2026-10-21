import {
  createAppSession,
  deviceClassOf,
  networkOf,
  osOf,
  platformOf,
  socialEventsContext,
  type Capability,
  type ConsentState,
  type SocialEventsContext,
} from '@/lib/api/social-events-context';
import { newEngagementSessionId } from '@/lib/api/social-events';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { coqueCourante } from '@/lib/native-shell';

/**
 * **LE CONTEXTE DE LOT DU NAVIGATEUR** (#10500) — `socialEventsContext` nourri
 * par ce que le navigateur sait de lui-même. Seul site qui lit
 * `navigator`, `screen`, `matchMedia` et `sessionStorage` pour la télémétrie.
 */

type CaptureDetection = { readonly screenshot: boolean; readonly recording: boolean };

let detection: CaptureDetection = { screenshot: false, recording: false };
let consent: ConsentState = 'unknown';

/** Ce que la coque détecte réellement (`MeeshyScreenGuard.getState`), posé par l'écoute des captures. */
export function noteCaptureDetection(next: CaptureDetection): void {
  detection = next;
}

/**
 * Le consentement d'analyse tel que le client le connaît (O4) : la passerelle
 * fait foi pour accorder, mais un refus déclaré s'applique.
 */
export function noteAnalyticsConsent(next: ConsentState): void {
  consent = next;
}

function sessionStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

const appSession = createAppSession({ storage: sessionStore(), now: () => Date.now(), uuid: newEngagementSessionId });

const shortLocale = (raw: string | undefined): string => (raw ?? '').slice(0, 35);

function standalone(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
}

function coarse(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export function capabilitiesOf(input: CaptureDetection): readonly Capability[] {
  return [
    'scroll',
    'playback_qoe',
    ...(input.screenshot ? (['screenshot'] as const) : []),
    ...(input.recording ? (['screen_recording'] as const) : []),
  ];
}

export function liveSocialEventsContext(): SocialEventsContext {
  const nav: Partial<Navigator> & { readonly connection?: { readonly type?: string; readonly effectiveType?: string } } =
    typeof navigator === 'undefined' ? {} : navigator;
  const screenSize = typeof screen === 'undefined' ? { width: 0, height: 0 } : screen;
  return socialEventsContext(
    {
      appSessionId: appSession.current(),
      platform: platformOf({ shellPlatform: coqueCourante()?.getPlatform?.(), standalone: standalone() }),
      appVersion: __APP_VERSION__.slice(0, 20),
      os: osOf(nav.userAgent ?? ''),
      deviceClass: deviceClassOf({ shortSide: Math.min(screenSize.width, screenSize.height), coarse: coarse() }),
      network: networkOf({ onLine: nav.onLine ?? true, connection: nav.connection }),
      uiLanguage: currentInterfaceLanguage(),
      deviceLocale: shortLocale(nav.language),
      consent,
      capabilities: capabilitiesOf(detection),
      sampling: { scroll: 1, playback: 1, visibility: 1 },
    },
    () => Date.now(),
  );
}
