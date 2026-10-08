import { useEffect, useState } from 'react';

import type { GamePrestigeBlock } from '@meeshy/shared/types/game';
import { GAME_PRESTIGE_LEVEL } from '@meeshy/shared/utils/game/levels';
import { prestigeTransition } from '@meeshy/shared/utils/game/prestige';

import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import type { LevelReading } from '@/lib/game/ladder';
import type { PlayOptions } from '@/lib/game/play';
import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';
import { trophyView } from '@/lib/view/game-copy-v2';
import { starDetail } from '@/lib/view/game-detail';

import { GameBird } from './game/game-bird';
import { PrestigeScene } from './game/prestige-scene';
import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GAME_ON_WARM, GameCard } from './game-surface';
import { GameFactChips, GameRequirementLine, GameTouch, type GameFactChip } from './game-touch';

/**
 * LE PRESTIGE (#9389, conception II.2 et II.9) — la vie après le niveau 100 :
 * la proposition, l'explication par Mee et Meo, la CONFIRMATION qui dit ce qui
 * repart, ce qui reste, ce qu'on gagne — et la perte d'accès à la ligue (10) et
 * au duo (20) qui suit, parce que le niveau record repart à 1 (conformité G-5) —,
 * et ce que le Prestige NE retire PAS : le consentement à la ligue publique reste
 * enregistré, la ligue se rouvre au niveau 10 sans le redemander —,
 * puis le passage en chorégraphie : l'anneau se vide, le trophée tombe, les
 * étoiles s'allument.
 *
 * Aucun passage sans confirmation : l'écran ne propose que « Passer en Prestige »
 * (qui ouvre la confirmation) et « Rester au sommet ». Le geste est optimiste
 * (le niveau repart tout de suite) avec retour arrière, la loi est celle de la
 * passerelle (`prestigeTransition`).
 *
 * Fermé : sous le niveau 100 il dit où l'on en est et combien de niveaux
 * manquent ; au maximum (cinq étoiles) il le fête, sans rien proposer.
 *
 * La confirmation donne les VALEURS (#9705), tirées de `prestigeTransition` :
 * points en poche, niveau et record avant → après, l'étoile posée, la Gloire.
 */
export type GamePrestigeProps = {
  /** Le niveau MONTRÉ (la lecture ouverte par le rang, #9688). */
  readonly level: Pick<LevelReading, 'level' | 'tier' | 'progress' | 'record'>;
  /** Les points en poche : le Prestige les remet à zéro. */
  readonly score: number;
  readonly prestige: GamePrestigeBlock;
  readonly online: boolean;
  readonly pending: boolean;
  readonly error?: string | undefined;
  readonly onPass: () => void;
  readonly playOptions?: PlayOptions;
  readonly createEnv?: (host: HTMLElement, canvas: HTMLCanvasElement) => EffectEnv;
};

const arrow = (before: string, after: string): string => `${before} → ${after}`;

/** Ce que le passage change, valeur par valeur ; vide quand la loi le refuse (le serveur reste juge). */
function passValues(level: GamePrestigeProps['level'], score: number, prestige: GamePrestigeBlock): readonly GameFactChip[] {
  const pass = prestigeTransition({ score, prestige: prestige.stars });
  if (!pass.allowed) return [];
  return [
    { fact: 'score', label: gameText('game.fact.balance'), value: arrow(pointsLabel(score), pointsLabel(pass.scoreAfter)) },
    { fact: 'level_now', label: gameText('game.mint.row.level'), value: arrow(formatCount(level.level), formatCount(pass.levelAfter)) },
    { fact: 'level_record', label: gameText('game.fact.record'), value: arrow(formatCount(level.record), formatCount(pass.levelRecordAfter)) },
    {
      fact: 'prestige_glory',
      label: gameText('game.fact.stars'),
      value: arrow(formatCount(prestige.stars), formatCount(pass.prestigeAfter)),
      detail: starDetail(prestige, pass.prestigeAfter),
    },
    { fact: 'prestige_glory', label: gameText('game.mint.row.glory'), value: gameText('game.fmt.signed', { value: formatCount(pass.gloryGained) }) },
  ];
}

export function GamePrestige({ level, score, prestige, online, pending, error, onPass, playOptions, createEnv }: GamePrestigeProps) {
  const [confirming, setConfirming] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [passed, setPassed] = useState<number | null>(null);

  useEffect(() => {
    if (error !== undefined) setPassed(null);
  }, [error]);

  const maxed = prestige.stars >= prestige.max;
  const next = prestige.stars + 1;
  const plate = trophyView(`trophy.prestige.${Math.max(1, prestige.stars)}`)?.plate ?? '';
  const sceneProps = { ...(playOptions === undefined ? {} : { playOptions }), ...(createEnv === undefined ? {} : { createEnv }) };

  const pass = (): void => {
    setConfirming(false);
    setPassed(next);
    setPlayKey((key) => key + 1);
    onPass();
  };

  return (
    <>
      <GameCard id="game-prestige" labelledBy="game-prestige-title" tint={GAME_BRAND}>
        <h2 id="game-prestige-title" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.prestige.title')}
        </h2>
        <div className="flex justify-center py-1">
          <PrestigeScene level={level.level} tier={level.tier} progress={level.progress} stars={prestige.stars} plate={plate} size={88} playKey={playKey} {...sceneProps} />
        </div>
        {/* Les étoiles se touchent : la prochaine à poser (ou la dernière, toutes posées) dit ses précisions (#9563). */}
        <GameTouch
          detail={starDetail(prestige, Math.min(prestige.max, prestige.stars + (maxed ? 0 : 1)))}
          className="self-center rounded-chip px-3 text-center text-body font-semibold"
          style={{ minHeight: 44, color: GAME_INK }}
        >
          {gameText('game.prestige.stars', { stars: formatCount(prestige.stars), max: formatCount(prestige.max) })}
        </GameTouch>
        {passed === null ? null : (
          <p role="status" className="text-center text-body font-bold" style={{ color: GAME_GOOD }}>
            {gameText('game.prestige.done', { number: formatCount(passed) })}
          </p>
        )}
        {maxed ? (
          <p className="text-center text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.prestige.max')}
          </p>
        ) : !prestige.canPrestige && passed === null ? (
          <>
            <p className="text-center text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.prestige.locked', { level: formatCount(level.level) })}
            </p>
            <GameRequirementLine concept="prestige" current={level.level} required={GAME_PRESTIGE_LEVEL} />
          </>
        ) : null}
      </GameCard>

      {!prestige.canPrestige || maxed ? null : (
        <GameCard id="game-prestige-offer" labelledBy="game-prestige-offer-title">
          <h2 id="game-prestige-offer-title" className="sr-only">
            {gameText('game.prestige.go')}
          </h2>
          <div className="flex items-end gap-2">
            <GameBird bird="meeGuide" size={64} />
            <p className="min-w-0 flex-1 text-body font-bold" style={{ color: GAME_INK }}>
              {gameText('game.prestige.mee')}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <p className="min-w-0 flex-1 text-body" style={{ color: GAME_INK }}>
              {gameText('game.prestige.meo', { glory: formatCount(prestige.gloryOnPass) })}
            </p>
            <GameBird bird="meoGuide" size={64} flip />
          </div>

          {confirming ? (
            <section role="group" aria-labelledby="game-prestige-confirm-title" data-game-prestige-confirm="" className="flex flex-col gap-2 rounded-card px-3 py-3" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 6%, transparent)' }}>
              <h3 id="game-prestige-confirm-title" className="text-body font-bold" style={{ color: GAME_INK }}>
                {gameText('game.prestige.confirm.title', { number: formatCount(next) })}
              </h3>
              <GameFactChips concept="prestige" marker="data-game-prestige-values" chips={passValues(level, score, prestige)} />
              <ul className="flex flex-col gap-1.5 text-caption" style={{ color: GAME_INK_2 }}>
                <li>{gameText('game.prestige.confirm.resets')}</li>
                <li>{gameText('game.prestige.confirm.keeps')}</li>
                <li>{gameText('game.prestige.confirm.access')}</li>
                <li>{gameText('game.prestige.confirm.consent')}</li>
              </ul>
              <button
                type="button"
                data-game-prestige-confirm-go=""
                disabled={!online || pending}
                aria-busy={pending}
                onClick={pass}
                className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
                style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: GAME_ON_WARM }}
              >
                {gameText('game.prestige.go')}
              </button>
              <button type="button" data-game-prestige-confirm-stay="" onClick={() => setConfirming(false)} className="rounded-chip px-4 text-body font-semibold" style={{ minHeight: 44, color: GAME_INK_2 }}>
                {gameText('game.prestige.stay')}
              </button>
            </section>
          ) : (
            <>
              <button
                type="button"
                data-game-prestige-go=""
                disabled={!online || pending}
                onClick={() => setConfirming(true)}
                className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
                style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: GAME_ON_WARM }}
              >
                {gameText('game.prestige.go')}
              </button>
              <p className="text-caption" style={{ color: GAME_INK_2 }}>
                {gameText('game.prestige.confirm.keeps')}
              </p>
            </>
          )}
          {error === undefined ? null : (
            <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
              {error}
            </p>
          )}
          {online ? null : (
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.offline.action')}
            </p>
          )}
        </GameCard>
      )}
    </>
  );
}
