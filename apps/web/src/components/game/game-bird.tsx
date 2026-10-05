import { useId } from 'react';

import { GAME_BIRD_BOX, birdCutFilter, gameBirdMarkup, gameBirdPlacement, type GameBirdKey } from '@/lib/game/birds';
import { safeUid } from '@/lib/game/materials';

import '@/styles/game.css';

/**
 * MEE OU MEO, SEUL (#9380) — la figure de la carte du guide et des coachs du
 * jeu. Même dessin que les stickers (`lib/mee/art.ts`) ; la pose est nommée
 * par `GameBirdKey`. `flip` retourne le personnage (Meo regarde à gauche, vers
 * le texte, quand il parle). Aucune bulle de conversation : la parole se pose
 * à côté, dans une carte du jeu.
 *
 * DÉCORATIF (`aria-hidden`) : c'est l'hôte qui porte le texte lu.
 */
export function GameBird({ bird, size, flip = false }: { readonly bird: GameBirdKey; readonly size: number; readonly flip?: boolean }) {
  const uid = safeUid(useId());
  const box = GAME_BIRD_BOX + 10;
  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} aria-hidden="true" focusable="false" data-game-bird={bird}>
      <defs dangerouslySetInnerHTML={{ __html: birdCutFilter(`${uid}-cut`) }} />
      <g transform={gameBirdPlacement({ x: flip ? box - 5 : 5, y: 5, scale: 1, flip })}>
        <g filter={`url(#${uid}-cut)`} dangerouslySetInnerHTML={{ __html: gameBirdMarkup(bird, uid) }} />
      </g>
    </svg>
  );
}
