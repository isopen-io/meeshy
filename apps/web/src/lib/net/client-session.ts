import {
  CLIENT_SESSION_HEADERS,
  readClientSessionAuth,
  type ClientPlatform,
  type ClientSessionInfo,
} from '@meeshy/shared/utils/client-session';

/**
 * **CE QUE LE WEB DÉCLARE DE LUI-MÊME** (#9611) — le contrat UNIQUE des trois
 * clients (`packages/shared/utils/client-session.ts`, #9610), rempli depuis ce
 * que le navigateur ou la coque Capacitor savent vraiment.
 *
 * - **Plateforme** : la coque Android (`Capacitor.getPlatform() === 'android'`)
 *   est `android-shell` ; une application installée (`display-mode:
 *   standalone`) est `pwa` ; un onglet est `web`. Une coque d'une autre
 *   plateforme ne se fait passer pour rien (`null`) : `ios` désigne l'APPLICATION
 *   native, pas une WebView.
 * - **Version** : `__APP_VERSION__`, celle du paquet — la coque embarque ces
 *   actifs et sa `versionName` la suit. Aucun numéro de build n'existe côté web
 *   (`versionCode` n'est lisible que par un plugin natif) : `appBuild` reste tu.
 * - **Système** : l'agent quand il dit vrai (iPhone, WebView Android) ;
 *   l'indication à haute entropie du navigateur (`userAgentData`) pour Android
 *   et macOS, dont l'agent est RÉDUIT ou FIGÉ (« Android 10; K », « Mac OS X
 *   10_15_7 »). Celle de Windows ne se recopie pas : `15.0.0` y veut dire
 *   « Windows 11 », et l'afficher tel quel mentirait.
 * - **Appareil** : un modèle n'est déclaré que pour Android (la WebView le
 *   porte dans son agent, Chrome dans son indication) ; un ordinateur n'en a
 *   pas, la passerelle déduit le reste de l'agent. Le NOM est le modèle : c'est
 *   déjà un nom lisible (« Pixel 7 »).
 *
 * Tout passe par `readClientSessionAuth`, le lecteur de la passerelle : ce que
 * le serveur jetterait (fuseau hors forme, texte trop long) n'est pas déclaré.
 *
 * **HORS DE LA PREMIÈRE PEINTURE, ET HORS DE SA TABLE DE PRÉCHARGEMENT.** Ce
 * module n'est atteint que par `import()` depuis le chunk du temps réel, déjà
 * paresseux : `api/realtime.ts` publie la déclaration pour le flux de
 * connexion (`api/auth.ts`, seul porteur des requêtes qui ouvrent une
 * session : la passerelle ne lit ces en-têtes qu'à `createSession`), et la
 * poignée de main (`socket-io-factory.ts`) la relit à chaque connexion. Le
 * transport du socle et le flux de connexion n'en importent rien.
 */

export type ClientHints = { readonly platform: string; readonly platformVersion: string; readonly model: string };

export type ClientEnvironment = {
  readonly appVersion: string;
  /** `Capacitor.getPlatform()` dans une coque, `null` dans un navigateur. */
  readonly shellPlatform: string | null;
  readonly standalone: boolean;
  readonly userAgent: string;
  readonly timezone: string | null;
  readonly deviceLocale: string | null;
  /** `navigator.userAgentData.getHighEntropyValues` — `null` hors Chromium. */
  readonly hints: ClientHints | null;
};

const ANDROID = /Android (\d+(?:\.\d+)*); ([^;)]+?)(?: Build\/[^;)]*)?[;)]/;
const IOS = /(?:iPhone|iPad|iPod)[^)]*? OS (\d+(?:_\d+)*)/;
/** Ce qu'un agent réduit met à la place du modèle et de la version. */
const REDUCED_MODEL = new Set(['K', 'wv']);
const REDUCED_ANDROID_VERSION = '10';

function platformOf(environment: ClientEnvironment): ClientPlatform | null {
  if (environment.shellPlatform === 'android') return 'android-shell';
  if (environment.shellPlatform !== null && environment.shellPlatform !== 'web') return null;
  return environment.standalone ? 'pwa' : 'web';
}

function fromUserAgent(userAgent: string): { readonly osVersion: string | null; readonly model: string | null } {
  const android = ANDROID.exec(userAgent);
  if (android !== null) {
    const model = android[2]?.trim() ?? '';
    const reduced = REDUCED_MODEL.has(model);
    return { osVersion: reduced && android[1] === REDUCED_ANDROID_VERSION ? null : (android[1] ?? null), model: reduced || model === '' ? null : model };
  }
  const ios = IOS.exec(userAgent);
  return { osVersion: ios?.[1]?.replace(/_/g, '.') ?? null, model: null };
}

function fromHints(hints: ClientHints | null): { readonly osVersion: string | null; readonly model: string | null } {
  if (hints === null) return { osVersion: null, model: null };
  const trusted = hints.platform === 'Android' || hints.platform === 'macOS';
  const model = hints.platform === 'Android' && hints.model.trim() !== '' ? hints.model.trim() : null;
  return { osVersion: trusted && hints.platformVersion.trim() !== '' ? hints.platformVersion.trim() : null, model };
}

export function describeClient(environment: ClientEnvironment): ClientSessionInfo {
  const agent = fromUserAgent(environment.userAgent);
  const hinted = fromHints(environment.hints);
  const model = hinted.model ?? agent.model;
  return readClientSessionAuth({
    client: {
      appVersion: environment.appVersion,
      platform: platformOf(environment),
      osVersion: hinted.osVersion ?? agent.osVersion,
      deviceModel: model,
      deviceName: model,
      timezone: environment.timezone,
      deviceLocale: environment.deviceLocale,
    },
  });
}

const FIELDS = Object.keys(CLIENT_SESSION_HEADERS) as readonly (keyof ClientSessionInfo)[];

/**
 * Les en-têtes HTTP de la déclaration — `X-Device-Locale` compris (même valeur
 * que celle que le transport pose déjà : la redire ne change rien).
 */
export function clientSessionHeaders(info: ClientSessionInfo): Readonly<Record<string, string>> {
  return Object.fromEntries(
    FIELDS.flatMap((field) => {
      const value = info[field];
      return value === null ? [] : [[CLIENT_SESSION_HEADERS[field], value]];
    }),
  );
}

/** Le relevé remis dans `handshake.auth.client` — les MÊMES noms, locale comprise. */
export function clientSessionAuth(info: ClientSessionInfo): Readonly<Record<string, string>> {
  return Object.fromEntries(FIELDS.flatMap((field) => (info[field] === null ? [] : [[field, info[field]]])));
}

// ---------------------------------------------------------------------------
// L'HÔTE RÉEL — lu une fois, affiné quand l'indication du navigateur répond.
// ---------------------------------------------------------------------------

type HighEntropySource = {
  readonly getHighEntropyValues?: (hints: readonly string[]) => Promise<{ readonly platform?: string; readonly platformVersion?: string; readonly model?: string }>;
};

function hostEnvironment(hints: ClientHints | null): ClientEnvironment {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const host = typeof navigator === 'object' && navigator !== null ? navigator : null;
  const standalone =
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (host as { standalone?: boolean } | null)?.standalone === true;
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }
  return {
    appVersion: __APP_VERSION__,
    shellPlatform: capacitor?.getPlatform?.() ?? null,
    standalone,
    userAgent: host?.userAgent ?? '',
    timezone,
    deviceLocale: host?.language ?? null,
    hints,
  };
}

/**
 * Lit l'hôte, puis l'affine par l'indication à haute entropie quand le
 * navigateur la sert. Lu UNE fois par chargement (la promesse est gardée) ; ne
 * rejette jamais : une indication refusée laisse la lecture de l'agent.
 */
async function readThisClient(): Promise<ClientSessionInfo> {
  const fromAgent = describeClient(hostEnvironment(null));
  const source =
    typeof navigator === 'object' && navigator !== null ? (navigator as { userAgentData?: HighEntropySource }).userAgentData : undefined;
  if (typeof source?.getHighEntropyValues !== 'function') return fromAgent;
  try {
    const values = await source.getHighEntropyValues(['platformVersion', 'model']);
    return describeClient(hostEnvironment({ platform: values.platform ?? '', platformVersion: values.platformVersion ?? '', model: values.model ?? '' }));
  } catch {
    return fromAgent;
  }
}

let learned: Promise<ClientSessionInfo> | null = null;

export function learnThisClient(): Promise<ClientSessionInfo> {
  learned ??= readThisClient();
  return learned;
}

/** Les en-têtes de la déclaration, pour les requêtes qui OUVRENT une session (`api/auth.ts`). */
export async function learnedClientHeaders(): Promise<Readonly<Record<string, string>>> {
  return clientSessionHeaders(await learnThisClient());
}

/**
 * Publie les en-têtes appris là où le flux de connexion les lit
 * (`api/auth.ts`, `publishedClientDeclaration`) — sans que ce flux importe ce
 * module. Le nom est celui d'`auth.ts` (`CLIENT_DECLARATION_GLOBAL`), épinglé
 * par `auth-client-declaration.test.ts`.
 */
export async function publishClientDeclaration(host: object = globalThis): Promise<void> {
  const headers = await learnedClientHeaders();
  Object.assign(host, { __meeshyClientDeclaration: headers });
}

/** Le relevé de la poignée de main socket (`socket-io-factory.ts`). */
export async function learnedClientAuth(): Promise<Readonly<Record<string, string>>> {
  return clientSessionAuth(await learnThisClient());
}
