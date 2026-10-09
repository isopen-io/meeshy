import { useEffect, useRef } from 'react';

import { createMediaPrimer, type MediaPrimer } from './media-primer';
import { preloadSignalsOf, type NavigatorLike } from './preload-signals';
import { preloadWindowOf, primeTargetsOf, recordVisit, type ReelVisit } from './preload-window';

const MAX_CONCURRENT_PRIMES = 2;

type BatteryLike = { readonly level: number; readonly charging: boolean };
type BatteryNavigator = Navigator & { readonly getBattery?: () => Promise<BatteryLike> };

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * LE PRÉCHARGEMENT ADAPTATIF DU LECTEUR DES RÉELS (#9702) — l'écran le monte
 * une fois. Il observe le temps passé sur chaque réel et le sens du geste,
 * lit la contrainte de l'appareil, en déduit la fenêtre
 * (`preloadWindowOf`, de N±2 à N±10) et remet à l'amorceur les têtes des
 * réels qui ne montent pas d'élément (`primeTargetsOf`).
 *
 * Il ne décide RIEN du montage : N±1 et N±2 montent leur élément par
 * `pageModeOf` (`thread.ts`), indépendamment de la fenêtre — la fenêtre
 * élargie n'ajoute que des octets.
 *
 * `urls[i]` est la source lisible du réel `i` (`undefined` sans vidéo ni
 * audio). La batterie se lit une fois, en asynchrone : tant qu'elle n'a pas
 * répondu, elle ne plafonne rien.
 */
export function useReelPreload(params: { readonly urls: readonly (string | undefined)[]; readonly activeIndex: number }): void {
  const { urls, activeIndex } = params;
  const primer = useRef<MediaPrimer | null>(null);
  const visits = useRef<readonly ReelVisit[]>([]);
  const current = useRef<{ readonly index: number; readonly since: number } | null>(null);
  const battery = useRef<BatteryLike | undefined>(undefined);

  useEffect(() => {
    if (typeof fetch !== 'function') return undefined;
    const instance = createMediaPrimer({ fetch: (url, init) => fetch(url, init), maxConcurrent: MAX_CONCURRENT_PRIMES });
    primer.current = instance;
    const nav = typeof navigator === 'undefined' ? undefined : (navigator as BatteryNavigator);
    nav
      ?.getBattery?.()
      .then((state) => {
        battery.current = state;
      })
      .catch(() => undefined);
    return () => {
      instance.dispose();
      primer.current = null;
    };
  }, []);

  const urlsKey = urls.join('\u0000');
  useEffect(() => {
    const at = now();
    const previous = current.current;
    if (previous !== null && previous.index !== activeIndex) {
      visits.current = recordVisit(visits.current, {
        dwellMs: at - previous.since,
        direction: activeIndex > previous.index ? 'forward' : 'backward',
      });
    }
    if (previous === null || previous.index !== activeIndex) current.current = { index: activeIndex, since: at };
    const signals = preloadSignalsOf({
      navigator: typeof navigator === 'undefined' ? undefined : (navigator as Navigator & NavigatorLike),
      ...(battery.current !== undefined ? { battery: battery.current } : {}),
    });
    const window = preloadWindowOf({ visits: visits.current, ...signals });
    primer.current?.sync(primeTargetsOf({ urls, activeIndex, window, network: signals.network }));
    // `urlsKey` porte l'identité de `urls` : le tableau change d'identité à
    // chaque rendu de l'écran, pas de contenu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, urlsKey]);
}
