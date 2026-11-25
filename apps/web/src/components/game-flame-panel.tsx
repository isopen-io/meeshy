import { useState } from 'react';

import type { GameFlame } from '@meeshy/shared/types/game';
import { FLAME_BONUS_PERCENT_MAX, FLAME_BONUS_PERCENT_PER_DAY } from '@meeshy/shared/utils/game/flame';
import { FLAME_PAUSE_MAX_DAYS, FLAME_PAUSE_MIN_DAYS } from '@meeshy/shared/utils/game/flame-pause';
import { spendPreview } from '@meeshy/shared/utils/game/spend';

import { flameGoalLine, flameGoalNextAction, flameGoalView, readFlameGoal, type FlameGoalView } from '@/lib/view/flame-goal-copy';
import { flamePauseAction, flamePauseIntro, flamePauseLine, flamePauseNextLine, readFlamePause, readNextPauseFrom } from '@/lib/view/flame-pause-copy';
import { daysLabel, effortRelightLine, formatCount, gameText, meeshCount, readEffortRelight } from '@/lib/view/game-copy';
import { freezeDetail } from '@/lib/view/game-detail';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameCard } from './game-surface';
import { GameSpendLine, GameTouch } from './game-touch';

/**
 * LA FLAMME : GELS ET RALLUMAGE (#9383) — ce qu'on fait de ses Meeshes pour la
 * protéger. Un gel couvre un jour manqué (deux en réserve au plus, 1 Meesh
 * chacun) ; une Flamme éteinte se rallume sous 48 h, une fois par mois, pour
 * 3 Meeshes. Les prix et les bornes viennent du bloc `game` : ce composant n'en
 * connaît aucun.
 *
 * Un bouton qui ne peut pas servir se TAIT en disant pourquoi (réserve pleine,
 * pas assez de Meeshes, hors ligne) ; il ne reste pas grisé sans explication.
 * Avant chaque achat, la ligne de dépense (#9705) dit les Meeshes en poche, le
 * prix et ce qui restera — ou combien il en manque.
 * Une Flamme trop longtemps éteinte ne propose rien : elle annonce qu'une
 * nouvelle commence au prochain geste.
 *
 * Deux rêves complets la rallument aussi, sans payer (#20455) : tant que le bloc
 * sert `effortRelight`, le panneau dit combien en manquent et jusqu'à quand
 * (#20471) — même quand une nouvelle Flamme a repris, puisque c'est en jouant
 * qu'on les réalise — et ne dit plus qu'elle ne peut plus être rallumée.
 *
 * Une Flamme vivante se met en VEILLE (#17372, #20509) : deux gestes, la durée
 * (1 à 7 jours, sept choisis d'avance) puis l'annonce. Tant que le bloc sert
 * une veille, le panneau dit jusqu'à quand elle attend, et l'annonce se tait.
 *
 * Au premier jour d'une Flamme, le panneau propose un OBJECTIF (#17379, #20521) : 7, 14 ou 30 jours, en un geste,
 * et ne rien choisir ne coûte rien. En cours, il dit ce qu'il reste ; atteint, les aïeux le saluent et la marche
 * suivante se propose, jusqu'à ce que le joueur ferme le signe (`goalSignSeen`). Un objectif raté ne se dit pas.
 */

export type GameFlamePanelProps = {
  readonly flame: GameFlame;
  readonly held: number;
  readonly online: boolean;
  readonly buyingFreeze: boolean;
  readonly relighting: boolean;
  readonly pausing: boolean;
  /** Le jour du Jeu du joueur (`missions.dayKey`) : une veille qui commence demain se dit « demain ». */
  readonly today: string;
  readonly onBuyFreeze: () => void;
  readonly onRelight: () => void;
  readonly onPause: (days: number) => void;
  readonly choosingGoal: boolean;
  /** Le signe de l'objectif atteint est déjà fermé (`flameGoalNextSeenKey` dans `game.guideSeen`). */
  readonly goalSignSeen: boolean;
  readonly onChooseGoal: (target: number) => void;
  readonly onCloseGoalSign: (target: number) => void;
  readonly errors?: {
    readonly freeze?: string | undefined;
    readonly relight?: string | undefined;
    readonly pause?: string | undefined;
    readonly goal?: string | undefined;
  };
};

const PAUSE_DAYS: readonly number[] = Array.from({ length: FLAME_PAUSE_MAX_DAYS - FLAME_PAUSE_MIN_DAYS + 1 }, (_, index) => FLAME_PAUSE_MIN_DAYS + index);

function ActionButton({ marker, busy, disabled, onClick, children }: { readonly marker: string; readonly busy: boolean; readonly disabled: boolean; readonly onClick: () => void; readonly children: React.ReactNode }) {
  const attributes = { [marker]: '' };
  return (
    <button
      type="button"
      {...attributes}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={onClick}
      className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
      style={{ minHeight: 44, backgroundColor: GAME_WARM, color: GAME_ON_WARM }}
    >
      {children}
    </button>
  );
}

function PauseChooser({ online, pausing, onPause, error }: { readonly online: boolean; readonly pausing: boolean; readonly onPause: (days: number) => void; readonly error: string | undefined }) {
  const [days, setDays] = useState(FLAME_PAUSE_MAX_DAYS);
  return (
    <>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {flamePauseIntro()}
      </p>
      <div role="radiogroup" aria-label={gameText('game.flame_panel.pause_days')} className="flex flex-wrap gap-1">
        {PAUSE_DAYS.map((count) => (
          <button
            key={count}
            type="button"
            role="radio"
            data-game-pause-days={count}
            aria-checked={count === days}
            onClick={() => setDays(count)}
            className="game-press rounded-chip text-body font-semibold"
            style={{ minWidth: 44, minHeight: 44, color: count === days ? GAME_ON_WARM : GAME_INK, backgroundColor: count === days ? GAME_WARM : 'transparent' }}
          >
            {formatCount(count)}
          </button>
        ))}
      </div>
      <ActionButton marker="data-game-flame-pause" busy={pausing} disabled={!online} onClick={() => onPause(days)}>
        {flamePauseAction(days)}
      </ActionButton>
      <Alert message={error} />
    </>
  );
}

function GoalChoice({ target, label, online, choosing, onChoose }: { readonly target: number; readonly label: string; readonly online: boolean; readonly choosing: boolean; readonly onChoose: (target: number) => void }) {
  return (
    <button
      type="button"
      data-game-flame-goal={target}
      disabled={!online || choosing}
      aria-busy={choosing}
      onClick={() => onChoose(target)}
      className="game-press rounded-chip px-4 text-body font-bold disabled:opacity-60"
      style={{ minWidth: 44, minHeight: 44, backgroundColor: GAME_WARM, color: GAME_ON_WARM }}
    >
      {label}
    </button>
  );
}

type GoalBlockProps = {
  readonly view: FlameGoalView;
  readonly online: boolean;
  readonly choosing: boolean;
  readonly onChoose: (target: number) => void;
  readonly onClose: (target: number) => void;
};

function GoalBlock({ view, online, choosing, onChoose, onClose }: GoalBlockProps) {
  switch (view.kind) {
    case 'choose':
      return (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {flameGoalLine(view)}
          </p>
          <div role="group" aria-label={gameText('game.flame_panel.goal_choices')} className="flex flex-wrap gap-1">
            {view.offer.map((target) => (
              <GoalChoice key={target} target={target} label={daysLabel(target)} online={online} choosing={choosing} onChoose={onChoose} />
            ))}
          </div>
        </>
      );
    case 'running':
      return (
        <p data-game-flame-goal-running="" className="text-caption font-semibold" style={{ color: GAME_INK }}>
          {flameGoalLine(view)}
        </p>
      );
    case 'reached':
      return (
        <div data-game-flame-goal-sign="" role="status" className="flex flex-col gap-1">
          <p className="text-body font-bold" style={{ color: GAME_BRAND }}>
            {flameGoalLine(view)}
          </p>
          <div className="flex flex-wrap gap-1">
            {view.next === null ? null : <GoalChoice target={view.next} label={flameGoalNextAction(view.next)} online={online} choosing={choosing} onChoose={onChoose} />}
            <button
              type="button"
              data-game-flame-goal-later=""
              onClick={() => onClose(view.target)}
              className="game-press rounded-chip px-4 text-body font-semibold"
              style={{ minHeight: 44, color: GAME_INK }}
            >
              {gameText('game.flame_panel.goal_later')}
            </button>
          </div>
        </div>
      );
  }
}

function Alert({ message }: { readonly message: string | undefined }) {
  return message === undefined ? null : (
    <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
      {message}
    </p>
  );
}

export function GameFlamePanel(props: GameFlamePanelProps) {
  const { flame, held, online, buyingFreeze, relighting, pausing, today, onBuyFreeze, onRelight, onPause, errors } = props;
  const goal = flameGoalView(readFlameGoal(flame.goal), props.goalSignSeen);
  const full = flame.freezes >= flame.maxFreezes;
  const freeze = spendPreview({ held, cost: flame.freezePrice });
  const out = flame.status === 'out';
  const relight = spendPreview({ held, cost: flame.relightPrice });
  const cannotPayRelight = !relight.affordable;
  const effort = readEffortRelight(flame.effortRelight);
  const pause = readFlamePause(flame.pause);
  const nextPauseFrom = readNextPauseFrom(flame.nextPauseFrom);
  const burning = flame.status === 'lit' || flame.status === 'at-risk' || flame.status === 'covered';

  return (
    <GameCard id="game-flame-panel" labelledBy="game-flame-panel-title">
      <h2 id="game-flame-panel-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.flame_panel.title')}
      </h2>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.flame_panel.bonus', { perDay: formatCount(FLAME_BONUS_PERCENT_PER_DAY), max: formatCount(FLAME_BONUS_PERCENT_MAX) })}
      </p>

      {goal === null ? null : <GoalBlock view={goal} online={online} choosing={props.choosingGoal} onChoose={props.onChooseGoal} onClose={props.onCloseGoalSign} />}
      <Alert message={errors?.goal} />

      {/* Les gels se touchent : ce qu'est un gel, ce qu'il coûte (#9563). */}
      <GameTouch detail={freezeDetail(flame)} className="flex items-center self-start rounded-chip text-body font-semibold" style={{ minHeight: 44, color: GAME_INK }}>
        {gameText('game.flame_panel.freezes', { held: formatCount(flame.freezes), max: formatCount(flame.maxFreezes) })}
      </GameTouch>
      {full ? (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.flame_panel.freeze_full')}
        </p>
      ) : (
        <>
          <GameSpendLine concept="flame" held={held} cost={flame.freezePrice} format={meeshCount} missing={{ fact: 'spend_missing', line: (missing) => gameText('game.spend.missing.freeze', { missing }) }} />
          <ActionButton marker="data-game-freeze-buy" busy={buyingFreeze} disabled={!online || !freeze.affordable} onClick={onBuyFreeze}>
            {gameText('game.flame_panel.freeze_buy', { price: meeshCount(flame.freezePrice) })}
          </ActionButton>
        </>
      )}
      <Alert message={errors?.freeze} />

      {pause !== null ? (
        <p data-game-flame-paused="" className="text-caption font-semibold" style={{ color: GAME_INK }}>
          {flamePauseLine(pause, today)}
        </p>
      ) : burning && nextPauseFrom !== null ? (
        <p data-game-flame-pause-next="" className="text-caption" style={{ color: GAME_INK_2 }}>
          {flamePauseNextLine(nextPauseFrom)}
        </p>
      ) : burning ? (
        <PauseChooser online={online} pausing={pausing} onPause={onPause} error={errors?.pause} />
      ) : null}

      {effort === null ? null : (
        <p data-game-effort-relight="" className="text-caption font-semibold" style={{ color: GAME_INK }}>
          {effortRelightLine(effort)}
        </p>
      )}
      {out && flame.canRelight ? (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.flame_panel.relight_intro')}
          </p>
          <GameSpendLine concept="flame" held={held} cost={flame.relightPrice} format={meeshCount} missing={{ fact: 'spend_missing', line: (missing) => gameText('game.spend.missing.relight', { missing }) }} />
          <ActionButton marker="data-game-relight" busy={relighting} disabled={!online || cannotPayRelight} onClick={onRelight}>
            {gameText('game.flame_panel.relight', { price: meeshCount(flame.relightPrice) })}
          </ActionButton>
          <Alert message={errors?.relight} />
        </>
      ) : null}
      {out && !flame.canRelight && cannotPayRelight ? (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.flame_panel.relight_missing_window', { missing: meeshCount(flame.relightPrice) })}
          </p>
          <GameSpendLine concept="flame" held={held} cost={flame.relightPrice} format={meeshCount} missing={{ fact: 'spend_missing', line: (missing) => gameText('game.spend.missing.relight', { missing }) }} />
        </>
      ) : null}
      {out && !flame.canRelight && !cannotPayRelight && effort === null ? (
        <p className="text-caption" style={{ color: GAME_BRAND }}>
          {gameText('game.flame_panel.relight_closed')}
        </p>
      ) : null}
      {!online ? (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.flame_panel.offline')}
        </p>
      ) : null}
    </GameCard>
  );
}
