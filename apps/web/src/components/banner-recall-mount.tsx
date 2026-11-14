import { useEffect } from 'react';

import { gamePrefs } from '@/lib/game/preferences';

type Start = (hidden: () => boolean) => () => void;

const loadStart = (): Promise<Start> => import('@/lib/view/use-banner-recall').then((module) => module.startBannerRecall);

/**
 * LE GUET DU RAPPEL, ARMÉ DANS LE CHROME DIFFÉRÉ (#17366) — pour un compte connecté, il s'abonne au cache de la
 * progression et rappelle le bandeau quand un acte, l'Offrande prête ou la Flamme à risque vient de naître
 * (`lib/view/use-banner-recall.ts`). En un chunk à lui : la première peinture n'en paie rien.
 */
export function BannerRecallMount({
  signedIn,
  load = loadStart,
}: {
  readonly signedIn: boolean;
  /** Le chargement du guet, injectable pour les témoins. */
  readonly load?: () => Promise<Start>;
}) {
  useEffect(() => {
    if (!signedIn) return undefined;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void load().then((start) => {
      if (!cancelled) stop = start(() => gamePrefs.get().hidden);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [signedIn, load]);
  return null;
}
