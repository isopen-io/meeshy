import { useEffect, useRef } from 'react';

import { bannerMoment, bannerRecall, type BannerMomentSource, type BannerRecallReason } from '@meeshy/shared/utils/game/banner-recall';

import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/game-state-order';
import { appQueryClient } from '@/lib/api/query-client';
import { useGamePrefs } from '@/lib/game/preferences';

import { recallPlayerBanner } from './player-banner-visit';

/**
 * **LE GUET DU RAPPEL** (#17366, retouche 3) — le bandeau du joueur revient quelques secondes quand le bloc `game` en
 * cache dit qu'un acte vient d'être réalisé, que l'Offrande vient d'être prête ou que la Flamme vient de passer à risque
 * (`bannerRecall`). Il S'ABONNE au cache que `game:updated`, le bandeau, « Ma Légende » et le profil tiennent à jour
 * (`ENGAGEMENT_PROGRESS_QUERY_KEY`) — aucune requête ne part pour lui. « Jeu masqué » : rien.
 *
 * Miroir iOS : `PlayerBannerStore.adopt` (`apps/ios/Meeshy/Features/Game/PlayerBannerHost.swift`).
 */
export function watchBannerRecall(options: {
  readonly read: () => unknown;
  readonly subscribe: (listener: () => void) => () => void;
  readonly hidden: () => boolean;
  readonly onRecall: (reason: BannerRecallReason) => void;
}): () => void {
  const moment = () => bannerMoment(momentSource(options.read()), { hidden: options.hidden() });
  let last = moment();
  return options.subscribe(() => {
    const next = moment();
    const reason = bannerRecall(last, next);
    last = next;
    if (reason !== null) options.onRecall(reason);
  });
}

/** Monté par le bandeau du haut, qui vit sur toutes les routes : le guet tient tant que la session est ouverte. */
export function useBannerRecall(signedIn: boolean): void {
  const hidden = useGamePrefs().hidden;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  useEffect(() => {
    if (!signedIn) return undefined;
    const cache = appQueryClient.getQueryCache();
    return watchBannerRecall({
      read: () => appQueryClient.getQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY),
      subscribe: (listener) => cache.subscribe(listener),
      hidden: () => hiddenRef.current,
      onRecall: recallPlayerBanner,
    });
  }, [signedIn]);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Un bloc d'un ancien serveur peut manquer les actes, l'Offrande ou la Flamme : alors rien à comparer, jamais une exception. */
function momentSource(data: unknown): BannerMomentSource | null {
  const game = isRecord(data) ? data['game'] : undefined;
  if (!isRecord(game)) return null;
  const { missions, chest, flame } = game;
  if (!isRecord(missions) || !Array.isArray(missions['items']) || !isRecord(chest) || !isRecord(flame)) return null;
  return game as BannerMomentSource;
}
