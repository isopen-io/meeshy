import { sessionStore } from '@/lib/api/session';
import { appelNatif, appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';
import { watchDeliveryReceiptCredential } from '@/lib/notifications/delivery-receipt-credential';

import { callStore } from './call-store';
import { bindShellCall, PONT_APPEL, type ShellAudioRoute } from './shell-call';

/**
 * LES RÉELS de l'appel natif de la coque Android (#8049). Chargé par
 * `import()` derrière `__SHELL__` depuis `call-socket-bridge.ts` : absent du
 * build web, et hors du premier rendu de la coque (le pont ne se branche qu'à
 * la première connexion). Une coque iOS, ou une coque Android construite
 * avant `MeeshyCallPlugin`, ne déclare pas le pont : rien ne démarre.
 */

let started = false;

const androidCall = (coque: CoqueNative | undefined): ((methode: string, options: object) => Promise<unknown>) | null =>
  coque?.getPlatform?.() === 'android' ? appelNatif(coque, PONT_APPEL) : null;

export function startShellCall(coque: CoqueNative | undefined = coqueCourante()): void {
  const native = androidCall(coque);
  if (started || native === null) return;
  started = true;
  bindShellCall({
    native,
    listen: (event, listener) => void coque?.addListener?.(PONT_APPEL, event, listener),
    store: callStore,
    accept: () => void import('./call-actions').then(({ callActions }) => callActions.accept()),
    watchCredential: (write) =>
      watchDeliveryReceiptCredential({
        sessionStore,
        write: (value) => {
          write(value);
          return Promise.resolve();
        },
      }),
    now: () => Date.now(),
  });
}

export type ShellAudioRoutes = { readonly routes: readonly ShellAudioRoute[]; readonly route: ShellAudioRoute | null };

const ROUTES: readonly ShellAudioRoute[] = ['earpiece', 'speaker', 'wired', 'bluetooth'];

const routesOf = (raw: unknown): ShellAudioRoutes => {
  const payload = (raw ?? {}) as { readonly routes?: unknown; readonly route?: unknown };
  const routes = Array.isArray(payload.routes)
    ? ROUTES.filter((route) => (payload.routes as readonly unknown[]).includes(route))
    : [];
  const route = ROUTES.find((candidate) => candidate === payload.route) ?? null;
  return { routes, route };
};

/**
 * LE CHOIX DE SORTIE AUDIO (D6) — l'API que l'écran d'appel consomme dans la
 * coque : `null` hors coque Android ou sur une coque qui ne déclare pas la
 * méthode. Le sélecteur de l'écran d'appel (`call-screen.tsx`) est l'affaire
 * d'un lot voisin ; les libellés sont prêts (`call.audioRoute.*`).
 */
export async function shellAudioRoutes(coque: CoqueNative | undefined = coqueCourante()): Promise<ShellAudioRoutes | null> {
  const get = coque?.getPlatform?.() === 'android' ? appelNatifMethode(coque, PONT_APPEL, 'getAudioRoutes') : null;
  return get === null ? null : routesOf(await get({}));
}

export async function setShellAudioRoute(
  route: ShellAudioRoute,
  coque: CoqueNative | undefined = coqueCourante(),
): Promise<ShellAudioRoutes | null> {
  const set = coque?.getPlatform?.() === 'android' ? appelNatifMethode(coque, PONT_APPEL, 'setAudioRoute') : null;
  return set === null ? null : routesOf(await set({ route }));
}
