import type {
  ClientCapability,
  ClientPlatform,
  ConsentState,
  DeviceClass,
  NetworkSubtype,
  NetworkType,
  SAMPLEABLE_V2_TYPES,
} from '@meeshy/shared/types/social-events-v2';

/**
 * **L'ENVELOPPE DE LOT DES ÉVÉNEMENTS SOCIAUX v2** (#10500, décision
 * `2026-10-13-social-events-v2-…` § 1) — l'objet `context` qu'une requête de
 * `POST /social/events` porte UNE fois. Un serveur antérieur le retire en
 * silence (`z.object` non strict) ; aucun champ n'y est obligatoire.
 *
 * Ce qui n'y entre jamais : l'identifiant d'un appareil, son modèle, l'agent
 * utilisateur brut, la version de build de l'OS. La session d'application vit
 * en `sessionStorage` (ou en mémoire), jamais en cookie ni en `localStorage`
 * (revue de conformité O2 — art. 5(3) ePrivacy).
 */

export const APP_SESSION_IDLE_MS = 30 * 60 * 1000;

const APP_SESSION_KEY = 'meeshy.telemetry.appSession';

export type ContextPlatform = ClientPlatform;
export type Capability = ClientCapability;
export type { ConsentState, DeviceClass, NetworkSubtype, NetworkType };
export type SampledType = (typeof SAMPLEABLE_V2_TYPES)[number];
export type SamplingRates = Readonly<Record<SampledType, number>>;

export type ContextOs = { readonly name: string; readonly version?: string };
export type ContextNetwork = { readonly type: NetworkType; readonly subtype?: NetworkSubtype };

export type ContextFields = {
  readonly appSessionId: string;
  readonly platform: ContextPlatform;
  readonly appVersion: string;
  readonly os: ContextOs;
  readonly deviceClass: DeviceClass;
  readonly network: ContextNetwork;
  readonly uiLanguage: string;
  readonly deviceLocale: string;
  readonly consent: ConsentState;
  readonly capabilities: readonly Capability[];
  readonly sampling: SamplingRates;
};

export type SocialEventsContext = ContextFields & { readonly schemaVersion: 2; readonly sentAt: string };

/** Ce qu'un VISITEUR déclare : la plateforme et la langue d'interface, rien d'autre (O2, R4). */
export type VisitorContext = Pick<SocialEventsContext, 'schemaVersion' | 'sentAt' | 'platform' | 'uiLanguage' | 'capabilities' | 'sampling'>;

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * La session d'application (règle Segment / Firebase) : neuve au démarrage à
 * froid d'un onglet, ou après 30 minutes sans événement.
 */
export function createAppSession(deps: {
  readonly storage: SessionStore | null;
  readonly now: () => number;
  readonly uuid: () => string;
}) {
  let memory: { readonly id: string; readonly at: number } | null = null;

  function read(): { readonly id: string; readonly at: number } | null {
    if (deps.storage === null) return memory;
    try {
      const raw = deps.storage.getItem(APP_SESSION_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as { readonly id?: unknown; readonly at?: unknown };
      return typeof parsed.id === 'string' && typeof parsed.at === 'number' ? { id: parsed.id, at: parsed.at } : null;
    } catch {
      return memory;
    }
  }

  function write(entry: { readonly id: string; readonly at: number }): void {
    memory = entry;
    if (deps.storage === null) return;
    try {
      deps.storage.setItem(APP_SESSION_KEY, JSON.stringify(entry));
    } catch {
      /* stockage plein ou refusé : la mémoire suffit */
    }
  }

  return {
    current(): string {
      const now = deps.now();
      const known = read();
      const id = known !== null && now - known.at <= APP_SESSION_IDLE_MS ? known.id : deps.uuid();
      write({ id, at: now });
      return id;
    },
  };
}

export function platformOf(input: { readonly shellPlatform: string | undefined; readonly standalone: boolean }): ContextPlatform {
  if (input.shellPlatform === 'android') return 'android_shell';
  if (input.shellPlatform === 'ios') return 'ios';
  return input.standalone ? 'pwa' : 'web';
}

const majorMinor = (raw: string): string => raw.replace(/_/g, '.').split('.').slice(0, 2).join('.');

const OS_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'android', pattern: /Android (\d+(?:[._]\d+)?)/ },
  { name: 'ios', pattern: /(?:iPhone|iPad|iPod).*? OS (\d+(?:_\d+)?)/ },
  { name: 'macos', pattern: /Mac OS X (\d+(?:[._]\d+)?)/ },
  { name: 'windows', pattern: /Windows NT (\d+(?:\.\d+)?)/ },
];

/** Le système, en MAJEURE.mineure — jamais le build ni le correctif. */
export function osOf(userAgent: string): ContextOs {
  for (const { name, pattern } of OS_PATTERNS) {
    const version = pattern.exec(userAgent)?.[1];
    if (version !== undefined) return { name, version: majorMinor(version) };
  }
  if (/Linux|X11|CrOS/.test(userAgent)) return { name: 'linux' };
  return { name: 'other' };
}

export function deviceClassOf(input: { readonly shortSide: number; readonly coarse: boolean }): DeviceClass {
  if (!input.coarse) return 'desktop';
  return input.shortSide < 600 ? 'phone' : 'tablet';
}

type NavigatorConnection = { readonly type?: string; readonly effectiveType?: string };

const SUBTYPES: Readonly<Record<string, NetworkSubtype>> = { 'slow-2g': '2g', '2g': '2g', '3g': '3g', '4g': '4g', '5g': '5g' };
const TYPES: Readonly<Record<string, NetworkType>> = { wifi: 'wifi', cellular: 'cellular', ethernet: 'ethernet', none: 'offline' };

export function networkOf(input: { readonly onLine: boolean; readonly connection: NavigatorConnection | undefined }): ContextNetwork {
  if (!input.onLine) return { type: 'offline' };
  const type = TYPES[input.connection?.type ?? ''] ?? 'unknown';
  const subtype = SUBTYPES[input.connection?.effectiveType ?? ''];
  return subtype === undefined || type === 'wifi' || type === 'ethernet' ? { type } : { type, subtype };
}

const NATIVE_CAPTURE: ReadonlySet<Capability> = new Set(['screenshot', 'screen_recording']);

/** Le contexte d'UNE requête. Un navigateur ne détecte aucune capture : il ne le déclare jamais. */
export function socialEventsContext(fields: ContextFields, now: () => number): SocialEventsContext {
  const capabilities =
    fields.platform === 'android_shell' || fields.platform === 'ios'
      ? fields.capabilities
      : fields.capabilities.filter((capability) => !NATIVE_CAPTURE.has(capability));
  return { schemaVersion: 2, sentAt: new Date(now()).toISOString(), ...fields, capabilities };
}

export function visitorContextOf(context: SocialEventsContext): VisitorContext {
  const { schemaVersion, sentAt, platform, uiLanguage, capabilities, sampling } = context;
  return { schemaVersion, sentAt, platform, uiLanguage, capabilities, sampling };
}
