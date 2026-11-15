import { useEffect, useRef, useState } from 'react';

import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import type { PlayOptions } from '@/lib/game/play';

import { GameEffectLayer } from './game-effect-layer';
import { LevelRing } from './level-ring';
import { Trophy } from './trophy';
import { useChoreography } from './use-choreography';

import '@/styles/game.css';

/**
 * LA SCÈNE DU PRESTIGE (#9389, conception II.9) — l'anneau de niveau avec ses
 * étoiles, et, dès la première étoile, le trophée de Prestige que Mee et Meo
 * couronnés tiennent à sa base. L'écran pose la scène dans son état FINAL
 * (niveau 1, étoile posée), puis la déclenche en incrémentant `playKey` :
 * l'anneau se vide, le trophée tombe, les deux guides descendent, les étoiles
 * s'allument une à une (`choreography.ts` › `prestige`, 2 s). Au repère `shine`,
 * un reflet WebGL2 balaie le trophée. Sous `prefers-reduced-motion`, la scène se
 * réduit à un fondu ; sans WebGL2, le repli CSS joue le reflet.
 *
 * DÉCORATIVE (`aria-hidden`) : l'écran dit « Prestige 2, deux étoiles ».
 */
type Props = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly progress: number;
  readonly stars: number;
  /** Ce que grave la plaque du trophée (« PRESTIGE 2 »), localisé par l'hôte. */
  readonly plate: string;
  readonly size: number;
  readonly playKey?: number;
  readonly playOptions?: PlayOptions;
  readonly createEnv?: (host: HTMLElement, canvas: HTMLCanvasElement) => EffectEnv;
};

export function PrestigeScene({ level, tier, progress, stars, plate, size, playKey = 0, playOptions, createEnv }: Props) {
  const { ref, play } = useChoreography<HTMLDivElement>(playOptions);
  const [shine, setShine] = useState(0);
  const first = useRef(true);
  const layerEnv = createEnv === undefined ? {} : { createEnv };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    play('prestige', { onBeat: (beat) => (beat.name === 'shine' ? setShine((k) => k + 1) : undefined) });
  }, [playKey, play]);

  return (
    <div ref={ref} aria-hidden="true" data-game-prestige-scene="" className="flex items-end justify-center gap-4">
      <LevelRing level={level} tier={tier} progress={progress} size={Math.round(size * 0.9)} prestige={stars} />
      {stars <= 0 ? null : (
        <div data-game-prestige-trophy="" style={{ position: 'relative', display: 'inline-block' }}>
          <Trophy kind="prestige" size={Math.round(size * 1.5)} label={plate} />
          <GameEffectLayer effect="sheen" replayKey={shine} {...layerEnv} />
        </div>
      )}
    </div>
  );
}
