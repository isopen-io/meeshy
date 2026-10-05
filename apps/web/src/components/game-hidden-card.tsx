import { gamePrefs } from '@/lib/game/preferences';
import { gameText } from '@/lib/view/game-copy';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_INK, GAME_INK_2, GAME_ON_WARM, GameCard } from './game-surface';

/**
 * LE JEU MASQUÉ (#9481) — ce qui remplace le jeu sur cet appareil quand la
 * personne l'a masqué : une carte qui le dit, un bouton pour le réafficher, une
 * porte vers les réglages. Réafficher ne rouvre RIEN côté serveur (les
 * visibilités restent fermées jusqu'à ce que la personne les rouvre).
 */
export function GameHiddenCard() {
  return (
    <GameCard id="game-hidden" labelledBy="game-hidden-title">
      <h2 id="game-hidden-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.settings.hidden.title')}
      </h2>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.settings.hidden.card')} {gameText('game.settings.hidden.reopen_note')}
      </p>
      <button
        type="button"
        data-game-show=""
        onClick={() => gamePrefs.set({ hidden: false })}
        className="rounded-chip px-4 text-body font-bold"
        style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: GAME_ON_WARM }}
      >
        {gameText('game.settings.hidden.show')}
      </button>
      <Link to="progressionReglages" className="flex items-center rounded-chip px-1 text-body font-semibold" style={{ minHeight: 44, color: GAME_BRAND }}>
        {gameText('game.door.settings')}
      </Link>
    </GameCard>
  );
}
