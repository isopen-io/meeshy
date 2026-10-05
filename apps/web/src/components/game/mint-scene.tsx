import { useEffect, useRef, useState } from 'react';

import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import type { PlayOptions } from '@/lib/game/play';

import { GameBird } from './game-bird';
import { GameEffectLayer } from './game-effect-layer';
import { MeeshCoinFlip, type MeeshCoinSide } from './meesh-coin';
import { useChoreography } from './use-choreography';

import '@/styles/game.css';

/**
 * LA SCÈNE DE LA FRAPPE (#9381) — conception, partie V : « Mee pose le flan,
 * Meo frappe, tchak, la pièce se retourne et montre son numéro » (1,2 s).
 *
 * L'ÉCRAN DE FRAPPE pose la scène avec la face qu'il veut VOIR À LA FIN
 * (`reverse`, le numéro), puis la déclenche en incrémentant `playKey` :
 *
 *   const [face, setFace] = useState<MeeshCoinSide>('obverse');
 *   const [key, setKey] = useState(0);
 *   // à la confirmation de la frappe par la passerelle :
 *   setFace('reverse'); setKey((k) => k + 1);
 *
 * Au repère « strike » du plan (le « tchak », à 640 ms), la scène relance le
 * reflet et l'onde WebGL2 de la pièce et appelle `onStrike` (un son, un état).
 * Pour l'édition PRISME, l'irisation suit l'inclinaison de l'appareil tant que
 * la scène est visible. Sous `prefers-reduced-motion`, la scène se réduit à un
 * fondu ; sans WebGL2, le repli CSS joue le reflet et l'anneau de l'onde.
 *
 * DÉCORATIVE (`aria-hidden`) : l'écran dit « Meesh n° 13 frappée, argent ».
 */

type Props = {
  /** Côté de la pièce ; la scène est environ deux fois plus large. */
  readonly size: number;
  /** La face montrée AU REPOS (et à la fin du geste). */
  readonly face: MeeshCoinSide;
  readonly edition?: MeeshEdition;
  readonly number?: number;
  readonly year?: number;
  readonly numberLabel?: string;
  /** Incrémenté par l'hôte pour jouer la frappe ; ne joue rien au montage. */
  readonly playKey?: number;
  readonly onStrike?: () => void;
  /** Réduction des animations, haptique, ordonnanceur : voir `PlayOptions`. */
  readonly playOptions?: PlayOptions;
  /** Pour les témoins : l'environnement des effets WebGL2. */
  readonly createEnv?: (host: HTMLElement, canvas: HTMLCanvasElement) => EffectEnv;
};

export function MintScene({ size, face, edition = 'silver', number, year, numberLabel, playKey = 0, onStrike, playOptions, createEnv }: Props) {
  const { ref, play } = useChoreography<HTMLDivElement>(playOptions);
  const [strike, setStrike] = useState(0);
  const first = useRef(true);
  const onStrikeRef = useRef(onStrike);
  onStrikeRef.current = onStrike;
  const layerEnv = createEnv === undefined ? {} : { createEnv };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    play('mint', {
      onBeat: (beat) => {
        if (beat.name !== 'strike') return;
        setStrike((k) => k + 1);
        onStrikeRef.current?.();
      },
    });
  }, [playKey, play]);

  const bird = Math.round(size * 0.62);
  return (
    <div ref={ref} aria-hidden="true" data-game-mint-scene="" style={{ position: 'relative', display: 'inline-block', width: Math.round(size * 1.9), height: Math.round(size * 1.1) }}>
      <div data-game-coin-stage="" style={{ position: 'absolute', left: Math.round(size * 0.45), top: 0, width: size, height: size }}>
        <MeeshCoinFlip size={size} face={face} edition={edition} {...(number === undefined ? {} : { number })} {...(year === undefined ? {} : { year })} {...(numberLabel === undefined ? {} : { numberLabel })} />
        <GameEffectLayer effect="sheen" circle replayKey={strike} {...layerEnv} />
        <GameEffectLayer effect="shockwave" circle autoStart={false} replayKey={strike} {...layerEnv} />
        {edition === 'prism' ? <GameEffectLayer effect="iridescence" circle {...layerEnv} /> : null}
        <span data-game-shockwave="" />
      </div>
      <span data-game-actor="mee" style={{ position: 'absolute', left: 0, bottom: 0, display: 'inline-block' }}>
        <GameBird bird="meeGuide" size={bird} />
      </span>
      <span data-game-actor="meo" style={{ position: 'absolute', right: 0, bottom: 0, display: 'inline-block' }}>
        <GameBird bird="meoGuide" size={bird} flip />
      </span>
    </div>
  );
}
