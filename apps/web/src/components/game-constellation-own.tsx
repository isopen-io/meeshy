import { constellationOf } from '@meeshy/shared/utils/game/constellation';

import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';

import { GameConstellationCard } from './game-constellation';
import { GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LA CONSTELLATION DU MEMBRE (#10053) — sur son total collecté (`game.starFragments.collected`) : la carte commune,
 * plus l'étoile suivante qui se remplit, la règle et la visibilité. Ces textes vivent dans la partie `concept` du
 * catalogue du Jeu, que la page Vitrine charge.
 */
export function GameConstellationOwn({ collected }: { readonly collected: number }) {
  const language = currentInterfaceLanguage();
  const shape = constellationOf(collected);
  return (
    <GameConstellationCard
      collected={collected}
      progress={
        <>
          <p className="text-caption" style={{ color: GAME_INK }}>
            {translateGamePlural(language, 'game.constellation.next', shape.toNextStar)}
          </p>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.constellation.how')}
          </p>
        </>
      }
      footer={
        <p className="text-check" style={{ color: GAME_INK_2 }}>
          {gameText('game.constellation.visibility')}
        </p>
      }
    />
  );
}
