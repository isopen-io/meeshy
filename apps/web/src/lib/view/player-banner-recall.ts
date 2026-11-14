import type { StoreApi } from 'zustand/vanilla';

import { PLAYER_BANNER_RECALL_MS } from '@meeshy/shared/utils/game/banner-recall-timing';

import { playerBannerVisitStore, type PlayerBannerVisit } from './player-banner-visit';

/**
 * LE RAPPEL DU BANDEAU (#17366, retouche 3) — hors de l'ouverture, un acte réalisé, l'Offrande prête, la Flamme à
 * risque (le guet, `use-banner-recall.ts`) ou le geste « tirer la liste » remontrent le bandeau
 * `PLAYER_BANNER_RECALL_MS`, puis il repart par la sortie de l'ouverture. Il rouvre la visite sous un NOUVEAU numéro,
 * tient ses propres secondes, et ne change rien pendant l'ouverture : les trente secondes couvrent déjà le moment.
 * Une réouverture de l'application l'emporte sur lui.
 *
 * Module à part de `player-banner-visit.ts` : la visite est lue avant le premier pixel, le rappel non.
 */
export function createBannerRecall(
  options: {
    readonly store?: StoreApi<PlayerBannerVisit>;
    readonly recallMs?: number;
    readonly schedule?: (run: () => void, ms: number) => unknown;
    readonly cancel?: (id: unknown) => void;
  } = {},
): () => void {
  const store = options.store ?? playerBannerVisitStore;
  const recallMs = options.recallMs ?? PLAYER_BANNER_RECALL_MS;
  const schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = options.cancel ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let recalledVisit: number | null = null;
  let timer: unknown = null;
  return () => {
    const { phase, visit } = store.getState();
    const recalling = phase === 'shown' && recalledVisit === visit;
    if (phase === 'armed' || (phase === 'shown' && !recalling)) return;
    if (timer !== null) cancel(timer);
    const next = visit + 1;
    recalledVisit = next;
    store.setState({ phase: 'shown', visit: next });
    timer = schedule(() => {
      timer = null;
      const current = store.getState();
      if (current.visit === next) current.send('expired');
    }, recallMs);
  };
}

/** Le rappel de l'application. */
export const recallPlayerBanner = createBannerRecall();

/**
 * « Tirer la liste rappelle le bandeau » (#17366, décision porteur du 2026-11-12) : le geste qui rafraîchit l'écran
 * des conversations rappelle d'abord le bandeau, qui repart seul.
 */
export const withBannerRecall =
  (refresh: () => Promise<void>, recall: () => void = recallPlayerBanner) =>
  (): Promise<void> => {
    recall();
    return refresh();
  };
