import type { RarityEntry } from '@/lib/game/rarity';
import { rarityPercent, visibleRarity } from '@/lib/game/rarity';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';
import { rarityName } from '@/lib/view/game-copy-v2';

import { GAME_INK_2 } from './game-surface';

/**
 * LA LIGNE DE RARETÉ D'UN SUCCÈS (#9390) — « Épique · 4 % des comptes » quand la
 * rareté a le droit de se montrer (20 titulaires, 1 000 comptes), « Rareté en
 * cours de mesure » quand une entrée existe mais reste sous le seuil, RIEN quand
 * le serveur ne sert aucune entrée. Le nom est lu en toutes lettres : la couleur
 * du liseré n'est jamais la seule information.
 */
export function GameRarityLine({ entry }: { readonly entry: RarityEntry | undefined }) {
  if (entry === undefined) return null;
  const rarity = visibleRarity(entry);
  if (rarity === null) {
    return (
      <span data-game-rarity="measuring" className="text-check" style={{ color: GAME_INK_2 }}>
        {gameText('game.rarity.measuring')}
      </span>
    );
  }
  const language = currentInterfaceLanguage();
  const name = rarityName(rarity, language);
  const share = gameText('game.rarity.share', { percent: rarityPercent(entry, language) });
  return (
    <span data-game-rarity={rarity} aria-label={gameText('game.rarity.aria', { name, share })} className="text-check font-semibold" style={{ color: GAME_INK_2 }}>
      <span aria-hidden="true">
        {name} · {share}
      </span>
    </span>
  );
}
