import { useEffect, useState } from 'react';

import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { MintScene } from '@/components/game';
import { registerStrikeStage } from '@/lib/game/strike-gate';
import { formatCount, gameText } from '@/lib/view/game-copy';

/**
 * MEE ET MEO FRAPPENT UNE MEESH (#9537, conception V) — la scène de la frappe,
 * posée là où l'on frappe : le HÉROS de frappe de Progression et la feuille que
 * le compteur de Meeshes ouvre en haut à droite. Une seule pièce de code pour
 * les deux, un seul geste.
 *
 * L'hôte incrémente `strikeKey` à chaque intention de frappe (`GameActions`) :
 * Mee pose le flan, Meo frappe, « tchak », la pièce se retourne sur son numéro
 * (1,2 s). Tant que la scène est à l'écran elle se DÉCLARE à la porte de la
 * frappe (`registerStrikeStage`) : le compteur de Meeshes attend la fin du
 * geste avant de monter. Sans scène, rien n'attend.
 *
 * Le numéro montré est celui de la pièce EN TRAIN d'être frappée — l'aperçu
 * d'avant le geste, que le compteur fait avancer ensuite — puis celui que la
 * passerelle confirme POUR CE GESTE : la confirmation de la frappe précédente
 * ne reprend pas la scène d'une seconde frappe. DÉCORATIVE (`aria-hidden`) : l'hôte dit le résultat.
 */
export type MintStrikeCoin = { readonly number: number; readonly edition: MeeshEdition };

export type MintStrikeProps = {
  readonly size: number;
  readonly strikeKey: number;
  /** La prochaine pièce, telle que l'aperçu la montre avant le geste. */
  readonly next: MintStrikeCoin;
  /** La pièce confirmée par la passerelle, quand elle l'est. */
  readonly confirmed?: MintStrikeCoin | null;
};

type Struck = { readonly key: number; readonly coin: MintStrikeCoin | null; readonly stale: MintStrikeCoin | null };

export function MintStrike({ size, strikeKey, next, confirmed = null }: MintStrikeProps) {
  const [struck, setStruck] = useState<Struck>({ key: strikeKey, coin: null, stale: null });
  if (struck.key !== strikeKey) setStruck({ key: strikeKey, coin: next, stale: confirmed });

  useEffect(() => registerStrikeStage(), []);

  const coin = struck.key === strikeKey ? struck.coin : next;
  const stale = struck.key === strikeKey ? struck.stale : confirmed;
  const shown = coin === null ? confirmed ?? next : confirmed !== null && confirmed !== stale ? confirmed : coin;
  return (
    <MintScene
      size={size}
      face={coin === null ? 'obverse' : 'reverse'}
      edition={shown.edition}
      number={shown.number}
      numberLabel={gameText('game.mint.number_label', { number: formatCount(shown.number) })}
      playKey={strikeKey}
    />
  );
}
