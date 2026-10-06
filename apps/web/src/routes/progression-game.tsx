import type { ReactNode } from 'react';

import { GAME_BRAND, GAME_CARD } from '@/components/game-surface';
import { Link } from '@/routes/route-table';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { gameText } from '@/lib/view/game-copy';
import { GameDoors } from '@/components/game-doors';
import { GameFlamePanel } from '@/components/game-flame-panel';
import { GameGauges } from '@/components/game-gauges';
import { GameHero } from '@/components/game-hero';
import { GameLeagueSummary } from '@/components/game-league-summary';
import { GameMintPreview } from '@/components/game-mint-preview';
import { GameHiddenCard } from '@/components/game-hidden-card';
import { GameMissions } from '@/components/game-missions';
import { useGamePrefs } from '@/lib/game/preferences';

import type { GameActions } from './progression-game-actions';

/**
 * LE JEU SUR « PROGRESSION » (#9383, #5841) — le HÉROS pleine largeur en
 * deuxième position (où j'en suis, comment je gagne), les deux jauges du trésor
 * et de la Flamme, puis les missions et le coffre, le DÉTAIL DE LIGUE (#9541),
 * l'unique héros de frappe (#9537), la Flamme à protéger. La séquence est celle de la
 * planche (conception, parties VII et XII) : l'écran existant s'enrichit EN
 * HAUT, ses portes (Badges, Défis, Succès) restent en dessous.
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
  /** La ligne courte du guide du moment : Mee la dit sur le coin du héros (#5841). `null` : Mee propose les règles. */
  readonly guideLine?: string | null;
};

export function GameSection({ progress, host }: { readonly progress: EngagementWithGame; readonly host: GameHost }) {
  const game = progress.game;
  const prefs = useGamePrefs();
  if (game === undefined) return null;
  if (prefs.hidden) return <GameHiddenCard />;
  const { actions, online, guide, guideLine } = host;

  return (
    <>
      {guide ?? null}
      <GameHero game={game} guideLine={guideLine ?? null} />
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
      <GameLeagueSummary league={game.league} />
      <GameMintPreview
        mint={game.mint}
        badgesLost={progress.mintBadgeLoss}
        online={online}
        minting={actions.pending.mint}
        error={actions.errors.mint}
        celebration={actions.celebration}
        strikeKey={actions.strikeKey}
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
      <GameDoors game={game} />
      <Link
        to="progressionRegles"
        className="flex items-center justify-center rounded-card px-4 text-body font-semibold"
        style={{ minHeight: 44, backgroundColor: GAME_CARD, color: GAME_BRAND }}
      >
        {gameText('game.door.rules')}
      </Link>
      <Link
        to="progressionReglages"
        data-game-door="progressionReglages"
        className="flex items-center justify-center rounded-card px-4 text-body font-semibold"
        style={{ minHeight: 44, backgroundColor: GAME_CARD, color: GAME_BRAND }}
      >
        {gameText('game.door.settings')}
      </Link>
      <Link
        to="progressionCarnet"
        className="flex items-center justify-center rounded-card px-4 text-body font-semibold"
        style={{ minHeight: 44, backgroundColor: GAME_CARD, color: GAME_BRAND }}
      >
        {gameText('game.door.notebook')}
      </Link>
    </>
  );
}
