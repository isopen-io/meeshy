import { browserConnection } from '../device/capability-tier';

/**
 * LES ÉCRANS PRINCIPAUX SE PRÉCHARGENT EN TÂCHE DE FOND (#10636) — la liste,
 * le fil, le Flux, les réglages, le profil, la cloche et le jeu : ce qu'on
 * atteint en un geste depuis la liste ou les menus flottants. Une fois chargé,
 * un écran s'ouvre dans le rendu même de la navigation (`router.tsx`, registre
 * des écrans) : l'attente ne paraît plus.
 *
 * Un écran par moment d'inactivité, l'un après l'autre : le préchargement ne
 * dispute jamais le fil principal ni le réseau à ce que l'utilisateur fait.
 * Rien ne part sur un réseau économe (`saveData`) ou très lent (2G) : les
 * écrans s'y chargent à l'intention, au toucher d'un lien.
 */
export const PRELOADED_SCREENS = ['list', 'thread', 'feed', 'settings', 'profile', 'notifications', 'progression'] as const;

export type PreloadedScreen = (typeof PRELOADED_SCREENS)[number];

/** Rappelle `run` au prochain moment d'inactivité (`requestIdleCallback` ou son repli). */
export type IdleScheduler = (run: () => void) => void;

export type NetworkHints = { readonly saveData?: boolean; readonly effectiveType?: string };

const SLOW_NETWORKS: ReadonlySet<string> = new Set(['slow-2g', '2g']);

export function preloadScreensWhenIdle({
  preload,
  idle,
  network,
}: {
  readonly preload: (key: PreloadedScreen) => Promise<unknown>;
  readonly idle: IdleScheduler;
  readonly network: NetworkHints;
}): void {
  if (network.saveData === true || SLOW_NETWORKS.has(network.effectiveType ?? '')) return;
  const next = (index: number): void => {
    const key = PRELOADED_SCREENS[index];
    if (key === undefined) return;
    idle(() => {
      void preload(key)
        .catch(() => undefined)
        .then(() => next(index + 1));
    });
  };
  next(0);
}

/** L'inactivité du navigateur ; un délai court là où `requestIdleCallback` manque (Safari). */
export const browserIdle: IdleScheduler = (run) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 2_000 });
  else setTimeout(run, 200);
};

/** Les indications réseau annoncées par l'appareil (absentes hors Chromium), lues par le lecteur unique. */
export function browserNetworkHints(): NetworkHints {
  const { saveData, effectiveType } = browserConnection() ?? {};
  return {
    ...(saveData !== undefined ? { saveData } : {}),
    ...(effectiveType !== undefined ? { effectiveType } : {}),
  };
}
