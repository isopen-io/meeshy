import type { GameFlame } from '@meeshy/shared/types/game';
import { FLAME_BONUS_PERCENT_MAX, FLAME_BONUS_PERCENT_PER_DAY } from '@meeshy/shared/utils/game/flame';
import { spendPreview } from '@meeshy/shared/utils/game/spend';

import { formatCount, gameText, meeshCount } from '@/lib/view/game-copy';
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
 */

export type GameFlamePanelProps = {
  readonly flame: GameFlame;
  readonly held: number;
  readonly online: boolean;
  readonly buyingFreeze: boolean;
  readonly relighting: boolean;
  readonly onBuyFreeze: () => void;
  readonly onRelight: () => void;
  readonly errors?: { readonly freeze?: string | undefined; readonly relight?: string | undefined };
};

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

function Alert({ message }: { readonly message: string | undefined }) {
  return message === undefined ? null : (
    <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
      {message}
    </p>
  );
}

export function GameFlamePanel(props: GameFlamePanelProps) {
  const { flame, held, online, buyingFreeze, relighting, onBuyFreeze, onRelight, errors } = props;
  const full = flame.freezes >= flame.maxFreezes;
  const freeze = spendPreview({ held, cost: flame.freezePrice });
  const out = flame.status === 'out';
  const relight = spendPreview({ held, cost: flame.relightPrice });
  const cannotPayRelight = !relight.affordable;

  return (
    <GameCard id="game-flame-panel" labelledBy="game-flame-panel-title">
      <h2 id="game-flame-panel-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.flame_panel.title')}
      </h2>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.flame_panel.bonus', { perDay: formatCount(FLAME_BONUS_PERCENT_PER_DAY), max: formatCount(FLAME_BONUS_PERCENT_MAX) })}
      </p>

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
          <GameSpendLine concept="flame" held={held} cost={flame.freezePrice} format={meeshCount} />
          <ActionButton marker="data-game-freeze-buy" busy={buyingFreeze} disabled={!online || !freeze.affordable} onClick={onBuyFreeze}>
            {gameText('game.flame_panel.freeze_buy', { price: meeshCount(flame.freezePrice) })}
          </ActionButton>
        </>
      )}
      <Alert message={errors?.freeze} />

      {out && flame.canRelight ? (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.flame_panel.relight_intro')}
          </p>
          <GameSpendLine concept="flame" held={held} cost={flame.relightPrice} format={meeshCount} />
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
          <GameSpendLine concept="flame" held={held} cost={flame.relightPrice} format={meeshCount} />
        </>
      ) : null}
      {out && !flame.canRelight && !cannotPayRelight ? (
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
