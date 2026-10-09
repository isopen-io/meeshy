import type { GameSeasonBlock } from '@meeshy/shared/types/game';
import { SEASON_SEAL_EVERY, SEASON_STARS_PER_STEP, SEASON_STEPS, seasonStepReward } from '@meeshy/shared/utils/game/season';

import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { spendPreview } from '@meeshy/shared/utils/game/spend';
import { formatCount, gameText, meeshCount } from '@/lib/view/game-copy';
import { seasonThemeName } from '@/lib/view/game-copy-v2';
import { sealDetail, stepDetail } from '@/lib/view/game-detail';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GAME_ON_WARM, GameCard } from './game-surface';
import { SealMark } from './game/seal-mark';
import { GameSpendLine, GameTouch, PRESS, touchProps } from './game-touch';

/**
 * LA SAISON (#9386, conception II.7) — huit semaines, un thème (une langue),
 * quarante étapes GRATUITES, une rangée Sceau cosmétique. Les étoiles viennent
 * des missions du jour et du duo ; quatre étoiles ouvrent une étape.
 *
 * RIEN N'Y RAPPORTE DE L'ARGENT (conformité C-1) : le Sceau se prend en Meeshes
 * (10) et reste décoratif ; il ne change rien au jeu. Chaque étape dit son état
 * par le TEXTE (réclamée, à réclamer, à venir), pas seulement par la couleur.
 * Toucher une étape à réclamer la réclame ; le bouton nomme la prochaine.
 *
 * Aucune saison ouverte (`season: null`) est une VALEUR, pas une panne : la
 * prochaine commence bientôt.
 */

export type GameSeasonProps = {
  readonly season: GameSeasonBlock | null;
  readonly held: number;
  readonly online: boolean;
  readonly claimingStep: number | null;
  readonly buyingSeal: boolean;
  readonly errors: { readonly claim?: string | undefined; readonly seal?: string | undefined };
  readonly onClaim: (step: number) => void;
  readonly onBuySeal: () => void;
};

type StepState = 'claimed' | 'ready' | 'locked';

const REWARD_TOKEN = { points: '+100', fragment: '◆', freeze: '✦', 'season-cup': '★' } as const;

const stepState = (season: GameSeasonBlock, step: number): StepState =>
  season.claimedSteps.includes(step) ? 'claimed' : step <= season.steps ? 'ready' : 'locked';

const stateLabel = (state: StepState): string => gameText(`game.season.step.${state}`);

function rewardLabel(step: number): string {
  const reward = seasonStepReward(step);
  if (reward === null) return '';
  return reward.kind === 'points' ? `+${formatCount(reward.amount)}` : gameText(`game.season.reward.${reward.kind}`);
}

function Step({ season, step, online, busy, onClaim }: { readonly season: GameSeasonBlock; readonly step: number; readonly online: boolean; readonly busy: boolean; readonly onClaim: (step: number) => void }) {
  const state = stepState(season, step);
  const reward = seasonStepReward(step);
  const special = reward !== null && reward.kind !== 'points';
  const tint = state === 'claimed' ? GAME_GOOD : state === 'ready' ? GAME_BRAND : GAME_INK_2;
  return (
    <li className="contents">
      <button
        type="button"
        data-game-season-step={step}
        data-game-season-state={state}
        /* Prête, l'étape se RÉCLAME (le geste d'avant) ; réclamée ou à venir, elle se touche et dit ses précisions (#9563). */
        disabled={state === 'ready' && (!online || busy)}
        aria-busy={busy}
        {...(state === 'ready' ? { onClick: () => onClaim(step) } : touchProps(stepDetail(season, step)))}
        aria-label={`${gameText('game.season.step', { step: formatCount(step) })}, ${stateLabel(state)}, ${rewardLabel(step)}`}
        className={`${PRESS} flex flex-col items-center justify-center rounded-chip`}
        style={{
          minHeight: 44,
          minWidth: 44,
          color: tint,
          backgroundColor: state === 'locked' ? 'transparent' : `color-mix(in srgb, ${tint} ${state === 'ready' ? 20 : 12}%, transparent)`,
          border: `1px solid color-mix(in srgb, ${tint} ${state === 'locked' ? 24 : 40}%, transparent)`,
        }}
      >
        <span aria-hidden="true" className="text-body font-bold tabular-nums">
          {step}
        </span>
        <span aria-hidden="true" className="text-check">
          {state === 'claimed' ? '✓' : special && reward !== null ? REWARD_TOKEN[reward.kind] : ' '}
        </span>
      </button>
    </li>
  );
}

export function GameSeason(props: GameSeasonProps) {
  const { season, held, online, claimingStep, buyingSeal, errors, onClaim, onBuySeal } = props;
  const language = currentInterfaceLanguage();

  if (season === null) {
    return (
      <GameCard id="game-season-none" labelledBy="game-season-none-title">
        <h2 id="game-season-none-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.season.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.season.none')}
        </p>
      </GameCard>
    );
  }

  const theme = seasonThemeName(season.themeKey, language);
  const next = season.nextReward;
  const percent = Math.round(season.progress * 100);
  const sealSteps = Array.from({ length: SEASON_STEPS / SEASON_SEAL_EVERY }, (_, i) => (i + 1) * SEASON_SEAL_EVERY);
  const seal = spendPreview({ held, cost: season.sealPrice });

  return (
    <>
      <GameCard id="game-season" labelledBy="game-season-title" tint={GAME_BRAND}>
        <h2 id="game-season-title" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.season.heading', { number: formatCount(season.number), week: formatCount(season.week), total: formatCount(8) })}
        </h2>
        {theme === null ? null : (
          <p className="text-body font-semibold" style={{ color: GAME_BRAND }}>
            {gameText('game.season.theme', { theme })}
          </p>
        )}
        <p className="text-body font-semibold" style={{ color: GAME_INK }}>
          {translateGamePlural(language, 'game.season.stars', season.stars)} · {gameText('game.season.steps_line', { steps: formatCount(season.steps), total: formatCount(season.stepsTotal) })}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={gameText('game.season.steps_line', { steps: formatCount(season.steps), total: formatCount(season.stepsTotal) })}
          className="h-2 overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--game-track)' }}
        >
          <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: GAME_BRAND }} />
        </div>
        {season.completed ? (
          <p className="text-caption font-semibold" style={{ color: GAME_GOOD }}>
            {gameText('game.season.completed', { glory: formatCount(GLORY_POINTS.season) })}
          </p>
        ) : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.season.to_next', { stars: translateGamePlural(language, 'game.season.stars', season.starsToNext) })}
          </p>
        )}
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.season.how', { per: formatCount(SEASON_STARS_PER_STEP) })}
        </p>
      </GameCard>

      <GameCard id="game-season-path" labelledBy="game-season-path-title">
        <h2 id="game-season-path-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.season.path')}
        </h2>
        {next === null ? null : (
          <button
            type="button"
            data-game-season-claim=""
            disabled={!online || claimingStep !== null}
            aria-busy={claimingStep !== null}
            onClick={() => onClaim(next.step)}
            className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
            style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: GAME_ON_WARM }}
          >
            {gameText('game.season.claim', { step: formatCount(next.step) })} · {rewardLabel(next.step)}
          </button>
        )}
        {errors.claim === undefined ? null : (
          <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
            {errors.claim}
          </p>
        )}
        <ol className="grid grid-cols-5 gap-1.5" data-game-season-path="">
          {Array.from({ length: SEASON_STEPS }, (_, i) => i + 1).map((step) => (
            <Step key={step} season={season} step={step} online={online} busy={claimingStep === step} onClaim={onClaim} />
          ))}
        </ol>
        {online ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.offline.action')}
          </p>
        )}
      </GameCard>

      <GameCard id="game-season-seal" labelledBy="game-season-seal-title">
        <h2 id="game-season-seal-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.season.seal.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.season.seal.body', { every: formatCount(SEASON_SEAL_EVERY) })}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label={gameText('game.season.seal.cosmetic')}>
          {sealSteps.map((step) => (
            <li key={step}>
              <GameTouch detail={sealDetail(season)} className="flex flex-col items-center justify-center gap-0.5 rounded-chip" style={{ minHeight: 44, minWidth: 44 }}>
                <SealMark owned={season.sealOwned} reached={step <= season.steps} size={36} />
                <span className="text-check tabular-nums" style={{ color: GAME_INK_2 }}>
                  {step}
                </span>
              </GameTouch>
            </li>
          ))}
        </ul>
        {season.sealOwned ? (
          <p className="text-caption font-semibold" style={{ color: GAME_GOOD }}>
            {gameText('game.season.seal.owned')}
          </p>
        ) : (
          <>
            <GameSpendLine concept="season" held={held} cost={season.sealPrice} format={meeshCount} />
            <button
              type="button"
              data-game-seal-buy=""
              disabled={!online || !seal.affordable || buyingSeal}
              aria-busy={buyingSeal}
              onClick={onBuySeal}
              className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
              style={{ minHeight: 44, backgroundColor: 'var(--color-warn)', color: 'var(--color-on-state)' }}
            >
              {gameText('game.season.seal.buy', { price: meeshCount(season.sealPrice) })}
            </button>
          </>
        )}
        {errors.seal === undefined ? null : (
          <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
            {errors.seal}
          </p>
        )}
      </GameCard>
    </>
  );
}
