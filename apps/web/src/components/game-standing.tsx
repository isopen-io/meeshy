import type { UserGameProfileResponse } from '@meeshy/shared/types/game';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { flameFormName, formatCount, gameText, levelTierName, rankLabel, rankName, treasuryName } from '@/lib/view/game-copy';
import { levelRingLabelWithPrestige } from '@/lib/view/game-copy-v2';

import { Flame } from './game/flame';
import { LevelRing } from './game/level-ring';
import { MeeshCoin } from './game/meesh-coin';
import { RankBlason } from './game/rank-blason';
import { GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LE JEU D'UN AUTRE, EN UN COUP D'ŒIL (#9481) — l'anneau de niveau à emblème, le blason du rang et sa
 * division, le palier du trésor, la forme de la Flamme, les étoiles de Prestige : EXACTEMENT ce que
 * `GET /users/:userId/game` sert, rien de plus. Le serveur applique SON réglage (« rang », « trésor »),
 * le blocage, « Jeu masqué » et la visibilité de la recherche : une réponse fermée est `visible: false`
 * et deux blocs nuls, que l'écran lit comme « rien à dire » — jamais comme « fermé », qui apprendrait
 * qu'un jeu existe.
 *
 * Jamais un compte exact : pas de Gloire, pas de jours de série, pas de Meeshes — l'anneau n'a pas de
 * jauge (`progress={null}`), la Flamme se nomme par sa FORME, le trésor par son PALIER. La même loi qu'au
 * serveur ; si elle change, c'est le contrat qui bouge, pas ce fichier.
 */

/** Ce que cette réponse permet de montrer : `null` quand il n'y a rien à dire (refus, ou deux blocs nuls). */
export type VisibleStanding = Pick<UserGameProfileResponse, 'standing' | 'treasury'>;

export function visibleStanding(game: UserGameProfileResponse | undefined): VisibleStanding | null {
  if (game === undefined || !game.visible) return null;
  return game.standing === null && game.treasury?.tier == null ? null : { standing: game.standing, treasury: game.treasury };
}

export function GameStanding({ game }: { readonly game: VisibleStanding }) {
  const language = currentInterfaceLanguage();
  const { standing, treasury } = game;
  const treasuryTier = treasury?.tier ?? null;
  return (
    <div className="flex flex-col gap-2" data-game-standing="">
      {standing === null ? null : (
        <div className="flex items-center gap-4">
          <LevelRing
            level={standing.level}
            tier={standing.tier}
            progress={null}
            size={72}
            prestige={standing.prestige}
            label={levelRingLabelWithPrestige(standing.level, standing.tier, standing.prestige, language)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-body font-bold" style={{ color: GAME_INK }}>
              {gameText('game.profile.level', { level: formatCount(standing.level), tier: levelTierName(standing.tier) })}
            </p>
            <p className="text-caption font-semibold" style={{ color: GAME_INK }}>
              {rankLabel(standing.rank, standing.division)}
            </p>
          </div>
          <RankBlason rank={standing.rank} division={standing.division} size={56} label={rankName(standing.rank)} />
        </div>
      )}
      {treasuryTier === null && standing?.flame == null ? null : (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption" style={{ color: GAME_INK_2 }}>
          {treasuryTier === null ? null : (
            <li className="flex items-center gap-1.5" data-game-standing-treasury={treasuryTier}>
              <MeeshCoin side="obverse" size={20} edition="silver" />
              {gameText('game.standing.treasury', { tier: treasuryName(treasuryTier) })}
            </li>
          )}
          {standing?.flame == null ? null : (
            <li className="flex items-center gap-1.5" data-game-standing-flame={standing.flame}>
              <Flame form={standing.flame} size={20} />
              {gameText('game.standing.flame', { form: flameFormName(standing.flame) })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * LA BANDE DE LA CARTE DE CONTACT — les mêmes pièces, en pictogrammes : chacune est nommée au lecteur
 * d'écran, aucune ne porte de bouton. Posée AVANT les coupes de la vitrine.
 */
export function GameStandingMini({ game }: { readonly game: VisibleStanding }) {
  const language = currentInterfaceLanguage();
  const { standing, treasury } = game;
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
          <RankBlason rank={standing.rank} division={standing.division} size={30} label={rankName(standing.rank)} />
          <span className="sr-only">{rankLabel(standing.rank, standing.division)}</span>
        </>
      )}
      {treasuryTier === null ? null : (
        <>
          <MeeshCoin side="obverse" size={22} edition="silver" />
          <span className="sr-only">{gameText('game.standing.treasury', { tier: treasuryName(treasuryTier) })}</span>
        </>
      )}
      {standing?.flame == null ? null : (
        <>
          <Flame form={standing.flame} size={22} />
          <span className="sr-only">{gameText('game.standing.flame', { form: flameFormName(standing.flame) })}</span>
        </>
      )}
    </span>
  );
}
