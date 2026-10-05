import type { ReactNode } from 'react';

import { GAME_BRAND, GAME_CARD } from '@/components/game-surface';
import { Link } from '@/routes/route-table';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { GameFlamePanel } from '@/components/game-flame-panel';
import { GameGauges } from '@/components/game-gauges';
import { GameMintPreview } from '@/components/game-mint-preview';
import { GameMissions } from '@/components/game-missions';

import type { GameActions } from './progression-game-actions';

/**
 * LE JEU SUR « PROGRESSION » (#9383) — l'en-tête aux quatre jauges, puis les
 * missions et le coffre, l'aperçu de frappe, la Flamme à protéger. La séquence
 * est celle de la planche (conception, partie VII) : l'écran existant
 * s'enrichit EN HAUT, ses portes (Badges, Défis, Succès) restent en dessous.
 *
 * Le bloc `game` est la seule source : ce fichier ne calcule ni niveau, ni
 * rang, ni prix. Il distribue ce que `useGameActions` pilote (retour
 * instantané, restauration sur échec) et rend `null` devant un ancien serveur,
 * qui ne sert pas le bloc : l'hôte garde alors l'écran d'avant.
 */

export type GameHost = {
  readonly actions: GameActions;
  readonly online: boolean;
  /** La carte du guide (#9379), posée au-dessus des jauges. */
  readonly guide?: ReactNode;
};

export function GameSection({ progress, host }: { readonly progress: EngagementWithGame; readonly host: GameHost }) {
  const game = progress.game;
  if (game === undefined) return null;
  const { actions, online, guide } = host;

  return (
    <>
      {guide ?? null}
      <GameGauges game={game} />
      <GameMissions
        missions={game.missions}
        chest={game.chest}
        held={game.treasury.held}
        level={game.level.level}
        prismHour={game.boosts.prismHour}
        online={online}
        pendingRerollId={actions.pending.rerollId}
        chestOpening={actions.pending.chest}
        onReroll={actions.reroll}
        onClaim={actions.claimChest}
        errors={{ reroll: actions.errors.reroll, chest: actions.errors.chest }}
      />
      <GameMintPreview
        mint={game.mint}
        glory={game.glory}
        treasury={game.treasury}
        levelRecord={game.level.record}
        badgesLost={progress.mintBadgeLoss}
        online={online}
        minting={actions.pending.mint}
        error={actions.errors.mint}
        celebration={actions.celebration}
        onMint={actions.mint}
      />
      <GameFlamePanel
        flame={game.flame}
        held={game.treasury.held}
        online={online}
        buyingFreeze={actions.pending.freeze}
        relighting={actions.pending.relight}
        onBuyFreeze={actions.buyFreeze}
        onRelight={actions.relight}
        errors={{ freeze: actions.errors.freeze, relight: actions.errors.relight }}
      />
      <Link
        to="progressionRegles"
        className="flex items-center justify-center rounded-card px-4 text-body font-semibold"
        style={{ minHeight: 44, backgroundColor: GAME_CARD, color: GAME_BRAND }}
      >
        Comment ça marche
      </Link>
      <Link
        to="progressionCarnet"
        className="flex items-center justify-center rounded-card px-4 text-body font-semibold"
        style={{ minHeight: 44, backgroundColor: GAME_CARD, color: GAME_BRAND }}
      >
        Carnet de progression
      </Link>
    </>
  );
}
