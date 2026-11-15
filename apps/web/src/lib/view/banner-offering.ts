import type { QueryClient } from '@tanstack/react-query';

import type { ChestClaimResponse } from '@meeshy/shared/types/game';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, GAME_MUTATION_KEY } from '@/lib/api/game-state-order';
import type { ApiResult } from '@/lib/api/http';
import { afterChestOpening, withChestReward } from '@/lib/view/game-optimistic';

/**
 * L'OFFRANDE S'OUVRE SUR LE BANDEAU (#18199, retouche 2 de #17366) — le même geste que la fiche du Rêve, sans la
 * quitter. Il suit la règle de tous les gestes du jeu (§ Instant App Principles) :
 *
 *   capturer l'instantané → appliquer en local → envoyer → restaurer si refus
 *
 * L'identifiant d'idempotence naît UNE fois par intention et ne se renouvelle qu'après un succès, ou quand la passerelle
 * le dit déjà pris par une autre écriture : un second toucher après une coupure rejoue la même demande, il n'ouvre
 * jamais deux Offrandes. Le geste porte la clé commune des gestes du jeu (`GAME_MUTATION_KEY`) : le guide et les
 * propositions de photo attendent qu'il soit réglé. La relecture qui suit rend la vérité.
 */
export type OfferingOutcome =
  | { readonly kind: 'opened'; readonly points: number }
  | { readonly kind: 'refused' }
  /** Rien n'est parti : une demande était déjà en vol, ou le cache ne dit plus l'Offrande prête. */
  | { readonly kind: 'skipped' };

/** Ce que l'hôte remet au bandeau pour l'Offrande : l'ouvrir, et le gain à annoncer quelques secondes (`null` sinon). */
export type BannerOffering = {
  readonly open: () => void;
  readonly reward: number | null;
};

export type OfferingDeps = {
  readonly client: QueryClient;
  readonly claim: (requestId: string) => Promise<ApiResult<ChestClaimResponse>>;
  readonly newId: () => string;
};

export type OfferingOpener = { readonly open: () => Promise<OfferingOutcome> };

const SKIPPED: OfferingOutcome = { kind: 'skipped' };
const REFUSED: OfferingOutcome = { kind: 'refused' };

export function createOfferingOpener(deps: OfferingDeps): OfferingOpener {
  const { client } = deps;
  let requestId: string | null = null;
  let inFlight = false;

  const read = (): EngagementWithGame | undefined => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
  const idOfIntention = (): string => (requestId ??= deps.newId());

  const send = async (snapshot: EngagementWithGame): Promise<OfferingOutcome> => {
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, afterChestOpening(snapshot));
    const result = await deps.claim(idOfIntention()).catch((): ApiResult<ChestClaimResponse> => ({ ok: false, status: 0, error: 'réseau' }));
    if (!result.ok) {
      if (result.code === GAME_ERROR_CODES.requestIdConflict) requestId = null;
      client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, snapshot);
      return REFUSED;
    }
    requestId = null;
    const current = read();
    if (current !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, withChestReward(current, result.data.reward, result.data.score, result.data.starFragments));
    return { kind: 'opened', points: result.data.reward.points };
  };

  const run = async (): Promise<OfferingOutcome> => {
    await client.cancelQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
    const snapshot = read();
    if (snapshot?.game?.chest.status !== 'ready') return SKIPPED;
    try {
      return await send(snapshot);
    } finally {
      void client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
    }
  };

  return {
    open: async () => {
      if (inFlight) return SKIPPED;
      inFlight = true;
      try {
        return await client.getMutationCache().build(client, { mutationKey: GAME_MUTATION_KEY, mutationFn: run }).execute(undefined);
      } finally {
        inFlight = false;
      }
    },
  };
}
