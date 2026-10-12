import type { UserGameProfileResponse } from '@meeshy/shared/types/game';

import { shownStanding } from '@/lib/game/ladder';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText, rankName, standingLabel, treasuryName, shownRank } from '@/lib/view/game-copy';
import { levelRingLabelWithPrestige } from '@/lib/view/game-copy-v2';

import { LevelRing } from './game/level-ring';
import { MeeshCoin } from './game/meesh-coin';
import { RankBlason } from './game/rank-blason';

/**
 * LE JEU D'UN AUTRE, EN UN COUP D'ŒIL (#9481) — l'anneau de niveau à emblème, le blason du rang et sa
 * division, le palier du trésor, la forme de la Flamme, les étoiles de Prestige : EXACTEMENT ce que
 * `GET /users/:userId/game` sert, rien de plus. Le serveur applique SON réglage (« rang », « trésor »),
 * le blocage, « Jeu masqué » et la visibilité de la recherche : une réponse fermée est `visible: false`
 * et deux blocs nuls, que l'écran lit comme « rien à dire » — jamais comme « fermé », qui apprendrait
 * qu'un jeu existe.
 *
 * Jamais un compte exact : pas de Gloire, pas de jours de série, pas de Meeshes — l'anneau n'a pas de
 * jauge (`progress={null}`), le trésor se nomme par son PALIER. La Flamme ne se montre PAS (#10092) :
 * aucun réglage ne permet à son propriétaire de la rendre visible, elle est donc masquée toujours. La même loi qu'au
 * serveur ; si elle change, c'est le contrat qui bouge, pas ce fichier.
 */

/** Ce que cette réponse permet de montrer : `null` quand il n'y a rien à dire (refus, ou deux blocs nuls). */
export type VisibleStanding = Pick<UserGameProfileResponse, 'standing' | 'treasury'>;

export function visibleStanding(game: UserGameProfileResponse | undefined): VisibleStanding | null {
  if (game === undefined || !game.visible) return null;
  return game.standing === null && game.treasury?.tier == null ? null : { standing: game.standing, treasury: game.treasury };
}

/**
 * LA BANDE DE LA CARTE DE CONTACT — le niveau, le rang et le trésor, en pictogrammes : chacune est nommée au lecteur
 * d'écran, aucune ne porte de bouton. Posée AVANT les coupes de la vitrine.
 */
export function GameStandingMini({ game }: { readonly game: VisibleStanding }) {
  const language = currentInterfaceLanguage();
  const { treasury } = game;
  const standing = shownStanding(game.standing);
  const treasuryTier = treasury?.tier ?? null;
  return (
    <span className="flex items-center gap-2" data-game-contact-standing="">
      {standing === null ? null : (
        <>
          <LevelRing
            level={standing.level}
            tier={standing.tier}
            progress={null}
            size={36}
            prestige={standing.prestige}
            label={levelRingLabelWithPrestige(standing.level, standing.tier, standing.prestige, language)}
          />
          <RankBlason {...shownRank(standing)} size={30} label={rankName(standing.rank)} />
          <span className="sr-only">{standingLabel(shownRank(standing))}</span>
        </>
      )}
      {treasuryTier === null ? null : (
        <>
          <MeeshCoin side="obverse" size={22} edition="silver" />
          <span className="sr-only">{gameText('game.standing.treasury', { tier: treasuryName(treasuryTier) })}</span>
        </>
      )}
    </span>
  );
}
