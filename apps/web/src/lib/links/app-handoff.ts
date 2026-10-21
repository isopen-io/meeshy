import { coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * LE LIEN D'E-MAIL OUVERT SUR UN TÉLÉPHONE EST D'ABORD REMIS À L'APP (#8083).
 *
 * Décision porteur 2026-09-26, « SI ET SEULEMENT SI » : un appareil ne se
 * connecte que par le code saisi SUR LUI ou le lien ouvert SUR LUI — aucun
 * transfert de session. Le lien ouvert dans le navigateur d'un téléphone où
 * l'app est installée doit donc arriver À L'APP, et le navigateur ne doit PAS
 * consommer le jeton avant (usage unique : l'app n'aurait plus rien à valider).
 *
 * - **Android (navigateur)** : un `intent://` vers l'App Link https de
 *   meeshy.me, adressé au paquet de la coque (`AndroidManifest.xml`), même
 *   chemin, même requête — la coque le relaie au routeur (`shell-deep-links.ts`),
 *   qui sert `/auth/verify-email`. Jamais par le schéma court `meeshy://`
 *   (#10870) : la coque y refuse tout lien à jeton, que n'importe quelle page
 *   ou app peut ouvrir.
 *   Sans l'app, Chrome suit `S.browser_fallback_url` : CETTE page, marquée
 *   `handoff=browser`, qui valide alors dans le navigateur — jamais le Play Store.
 * - **iPhone** : AUCUNE tentative par schéma — Safari afficherait « adresse
 *   non valide » à chaque visiteur sans l'app. C'est le LIEN UNIVERSEL qui s'en
 *   charge (`/auth/verify-email` dans `apple-app-site-association`, lu par
 *   `DeepLinkRouter.swift`) : iOS ouvre l'app AVANT que Safari ne charge la page.
 * - **Ordinateur, coque Capacitor** : rien à remettre.
 */

export const ANDROID_APP_PACKAGE = 'me.meeshy.app';
export const APP_HANDOFF_WAIT_MS = 1_500;
const APP_LINK_HOST = 'meeshy.me';
const MARKER = 'handoff';
const MARKER_BROWSER = 'browser';

export type HandoffDevice = {
  readonly userAgent: string;
  readonly shell: CoqueNative | undefined;
};

const insideShell = (shell: CoqueNative | undefined): boolean => (shell?.getPlatform?.() ?? 'web') !== 'web';

/**
 * `secret` (#10859) : le jeton et l'adresse que la page a déjà retirés de sa
 * barre d'adresse (`email-link-secret.ts`). Vers l'app, ils voyagent dans la
 * requête de l'intent — une adresse que seul l'appareil lit, jamais un
 * serveur ; vers le repli du navigateur, dans le FRAGMENT, comme le lien
 * d'origine.
 */
export function appHandoffUrl(pageUrl: string, device: HandoffDevice, secret: Readonly<Record<string, string>> = {}): string | null {
  if (insideShell(device.shell) || !/Android/i.test(device.userAgent)) return null;
  const page = new URL(pageUrl);
  if (page.searchParams.get(MARKER) === MARKER_BROWSER) return null;
  const secrets = Object.entries(secret);
  const fallback = new URL(page.href);
  fallback.searchParams.set(MARKER, MARKER_BROWSER);
  if (secrets.length > 0) {
    fallback.searchParams.set('via', 'email');
    fallback.hash = new URLSearchParams(secrets).toString();
  }
  const intentQuery = new URLSearchParams(page.search);
  secrets.forEach(([key, value]) => intentQuery.set(key, value));
  const query = intentQuery.toString();
  const target = `${page.pathname.replace(/^\/+/, '')}${query === '' ? '' : `?${query}`}`;
  return `intent://${APP_LINK_HOST}/${target}#Intent;scheme=https;package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback.href)};end`;
}

/** Le verdict, rendu une fois après `waitMs` : `true` si la page est passée en
 * arrière-plan entre-temps (l'app s'est ouverte). Rend l'annulation. */
export type HandoffWatch = (waitMs: number, done: (appOpened: boolean) => void) => () => void;

export type HandoffView = {
  readonly document: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  readonly addEventListener: (type: 'pagehide', listener: () => void) => void;
  readonly removeEventListener: (type: 'pagehide', listener: () => void) => void;
  readonly setTimeout: (run: () => void, ms: number) => number;
  readonly clearTimeout: (id: number) => void;
};

export function watchForAppOpening(view: HandoffView): HandoffWatch {
  return (waitMs, done) => {
    let left = view.document.visibilityState === 'hidden';
    const onVisibility = () => {
      if (view.document.visibilityState === 'hidden') left = true;
    };
    const onPageHide = () => {
      left = true;
    };
    const detach = () => {
      view.document.removeEventListener('visibilitychange', onVisibility);
      view.removeEventListener('pagehide', onPageHide);
    };
    view.document.addEventListener('visibilitychange', onVisibility);
    view.addEventListener('pagehide', onPageHide);
    const timer = view.setTimeout(() => {
      detach();
      done(left);
    }, waitMs);
    return () => {
      view.clearTimeout(timer);
      detach();
    };
  };
}

export type AppHandoff = {
  /** L'adresse qui remet la page courante à l'app, ou `null` : rien à remettre.
   * `secret` : ce que la page a retiré de son adresse (#10859). */
  readonly target: (secret?: Readonly<Record<string, string>>) => string | null;
  readonly open: (url: string) => void;
  readonly watch: HandoffWatch;
};

export const browserAppHandoff: AppHandoff = {
  target: (secret) =>
    typeof window === 'undefined'
      ? null
      : appHandoffUrl(window.location.href, { userAgent: window.navigator.userAgent, shell: coqueCourante() }, secret),
  open: (url) => window.location.assign(url),
  watch: (waitMs, done) => watchForAppOpening(window)(waitMs, done),
};
