import type { StoreApi } from 'zustand/vanilla';

import { PLAYER_BANNER_RECALL_MS } from '@meeshy/shared/utils/game/banner-recall-timing';

import { playerBannerVisitStore, type PlayerBannerVisit } from './player-banner-visit';

/**
 * LE BANDEAU RAPPELÉ (#17366, retouche 3, décision porteur du 2026-11-11) — hors de l'ouverture, un acte réalisé,
 * l'Offrande prête, la Flamme à risque (`use-banner-recall.ts`) ou le geste « tirer la liste » remontrent le bandeau
 * `PLAYER_BANNER_RECALL_MS`, puis il repart seul, par la même sortie que l'ouverture.
 *
 * Le rappel vit HORS de la visite (`player-banner-visit.ts`), que la coquille lit avant le premier pixel : la visite ne
 * le connaît pas, elle est seulement remise en phase `shown` sous un nouveau numéro, et c'est le rappel qui tient ses
 * propres secondes. Pendant l'ouverture, ou avant sa première peinture, il ne change rien ; un second rappel relance
 * ses secondes ; une réouverture de l'app l'emporte sur lui.
 */
type Recall = { readonly visit: number; readonly timer: ReturnType<typeof setTimeout> };

const recalls = new WeakMap<StoreApi<PlayerBannerVisit>, Recall>();

export function recallPlayerBanner(
  options: { readonly store?: StoreApi<PlayerBannerVisit>; readonly ms?: number } = {},
): void {
  const store = options.store ?? playerBannerVisitStore;
  const { phase, visit } = store.getState();
  const current = recalls.get(store);
  const recalling = current !== undefined && current.visit === visit;
  if (phase === 'armed' || (phase === 'shown' && !recalling)) return;
  if (current !== undefined) clearTimeout(current.timer);
  const next = visit + 1;
  store.setState({ phase: 'shown', visit: next });
  const timer = setTimeout(() => {
    recalls.delete(store);
    if (store.getState().visit === next) store.getState().send('expired');
  }, options.ms ?? PLAYER_BANNER_RECALL_MS);
  recalls.set(store, { visit: next, timer });
}

/** Le bandeau montré est-il un rappel (et non l'ouverture) ? */
export const isRecallingPlayerBanner = (store: StoreApi<PlayerBannerVisit> = playerBannerVisitStore): boolean =>
  recalls.get(store)?.visit === store.getState().visit;

/**
 * « Tirer la liste rappelle le bandeau » (décision porteur du 2026-11-12) : le geste qui rafraîchit l'écran des
 * conversations rappelle d'abord le bandeau, qui repart seul.
 */
export const withBannerRecall =
  (refresh: () => Promise<void>, store: StoreApi<PlayerBannerVisit> = playerBannerVisitStore) =>
  (): Promise<void> => {
    recallPlayerBanner({ store });
    return refresh();
  };
