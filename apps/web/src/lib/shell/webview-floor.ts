/**
 * **LE PLANCHER DE WEBVIEW DE LA COQUE ANDROID** (W19, #11325) — la coque
 * Capacitor (`me.meeshy.app`) affiche le bundle web dans « Android System
 * WebView », que l'utilisateur met à jour par le Play Store, indépendamment
 * de l'application. En dessous de Chrome 111, le bundle ne se rend plus
 * correctement : Tailwind 4 compose ses couleurs par `color-mix()` et ses
 * propriétés animées par `@property` (Chrome ≥ 111), et le JavaScript est
 * émis en ES2022 (`vite.config.ts`, `build.target`).
 *
 * DEUX CONTRÔLES, UN SEUL ÉCRAN :
 * - le NATIF (`android.minWebViewVersion` + `server.errorPath`,
 *   `capacitor.config.ts`) : Capacitor lit la version du paquet WebView avant
 *   de charger la page et redirige vers `webview-update.html` — il tient même
 *   quand le bundle ne se lit pas du tout ;
 * - le WEB (`redirectBelowWebViewFloor`, au démarrage de `main.tsx`) : il lit
 *   `navigator.userAgent` (`Chrome/<n>`) quand le bundle a pu démarrer, ce que
 *   le contrôle natif ne voit pas sur une WebView qu'il ne sait pas dater.
 *
 * `capacitor.config.ts` recopie `MIN_ANDROID_WEBVIEW_MAJOR` et
 * `WEBVIEW_UPDATE_PAGE` en littéraux (la CLI le charge en CommonJS, un import
 * de `src/` y serait fragile) : `capacitor.config.test.ts` garde l'égalité.
 */
export const MIN_ANDROID_WEBVIEW_MAJOR = 111;

/** L'écran « mettre à jour Android System WebView », servi depuis `public/`. */
export const WEBVIEW_UPDATE_PAGE = 'webview-update.html';

const CHROME_MAJOR = /\bChrome\/(\d+)\./;
const ANDROID = /\bAndroid\b/;

/** Le numéro majeur de Chrome annoncé par l'agent, ou `null` s'il n'en annonce pas. */
export function chromeMajorOf(userAgent: string): number | null {
  const match = CHROME_MAJOR.exec(userAgent);
  return match === null ? null : Number(match[1]);
}

/**
 * Vrai seulement pour un agent Android dont la version de Chrome est lue ET
 * sous le plancher. Une version illisible ne bloque rien (fail-open) : la
 * barrière native reste en place.
 */
export function isBelowWebViewFloor(userAgent: string, floor: number = MIN_ANDROID_WEBVIEW_MAJOR): boolean {
  if (!ANDROID.test(userAgent)) return false;
  const major = chromeMajorOf(userAgent);
  return major !== null && major < floor;
}

export type WebViewFloorHost = {
  readonly userAgent: string;
  readonly replace: (url: string) => void;
};

/** Dans la coque, une WebView trop ancienne quitte l'application pour l'écran de mise à jour. Rend `true` si elle l'a quittée. */
export function redirectBelowWebViewFloor(host: WebViewFloorHost): boolean {
  if (!isBelowWebViewFloor(host.userAgent)) return false;
  host.replace(`/${WEBVIEW_UPDATE_PAGE}`);
  return true;
}
