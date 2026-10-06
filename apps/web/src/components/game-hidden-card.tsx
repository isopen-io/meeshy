import { useState } from 'react';

import type { GameHiddenOutcome } from '@/lib/game/game-hidden';
import { setGameHidden } from '@/lib/game/use-game-settings';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_ON_WARM, GameCard } from './game-surface';

/**
 * LE JEU MASQUÉ (#9481) — ce qui remplace le jeu sur cet appareil quand la
 * personne l'a masqué : une carte qui le dit, un bouton pour le réafficher, une
 * porte vers les réglages. Réafficher écrit le réglage du compte (le serveur
 * fait foi : sans cela la lecture suivante masquerait le jeu de nouveau), donc
 * demande le réseau ; il ne rouvre AUCUNE visibilité (elles restent fermées
 * jusqu'à ce que la personne les rouvre).
 */
export function GameHiddenCard({ show = () => setGameHidden(false), online }: { readonly show?: () => Promise<GameHiddenOutcome>; readonly online?: boolean } = {}) {
  const live = useOnline();
  const connected = online ?? live;
  const [refused, setRefused] = useState<string | null>(null);
  const reveal = (): void => {
    setRefused(null);
    void show().then((outcome) => {
      if (outcome.status === 'refused') setRefused(outcome.error);
    });
  };
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
        disabled={!connected}
        onClick={reveal}
        className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
        style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: GAME_ON_WARM }}
      >
        {gameText('game.settings.hidden.show')}
      </button>
      {connected ? null : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.offline.action')}
        </p>
      )}
      {refused === null ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {refused}
        </p>
      )}
      <Link to="progressionReglages" className="flex items-center rounded-chip px-1 text-body font-semibold" style={{ minHeight: 44, color: GAME_BRAND }}>
        {gameText('game.door.settings')}
      </Link>
    </GameCard>
  );
}
