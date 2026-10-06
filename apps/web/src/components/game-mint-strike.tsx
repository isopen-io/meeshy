import { useEffect, useRef, useState } from 'react';

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
 * passerelle confirme. DÉCORATIVE (`aria-hidden`) : l'hôte dit le résultat.
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

export function MintStrike({ size, strikeKey, next, confirmed = null }: MintStrikeProps) {
  const [face, setFace] = useState<'obverse' | 'reverse'>('obverse');
  const struck = useRef<MintStrikeCoin | null>(null);
  const seen = useRef(strikeKey);

  useEffect(() => registerStrikeStage(), []);
  useEffect(() => {
    if (strikeKey === seen.current) return;
    seen.current = strikeKey;
    struck.current = next;
    setFace('reverse');
  }, [strikeKey, next]);

  const shown = confirmed ?? struck.current ?? next;
  return (
    <MintScene
      size={size}
      face={face}
      edition={shown.edition}
      number={shown.number}
      numberLabel={gameText('game.mint.number_label', { number: formatCount(shown.number) })}
      playKey={strikeKey}
    />
  );
}
