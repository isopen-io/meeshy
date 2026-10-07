import { GAME_BRAND as BRAND, GAME_INK as INK, GAME_INK_2 as INK_2 } from '@/components/game-surface';
import type { GameMaterial } from '@/lib/game/materials';
import type { BadgeGuideView, BadgeRungView } from '@/lib/view/badge-guide-view';
import { gameText } from '@/lib/view/game-copy';

/**
 * L'ÉCHELLE D'UN BADGE (#9639) — ses sept paliers, du cuivre au prisme : les
 * atteints (datés quand la passerelle sert la date), la prochaine étoile (ce
 * qu'il manque) et ceux à venir (leur seuil). `BadgeLadder` est l'échelle
 * entière de la fiche ; `BadgeUpcoming` la SUITE compacte de la page des
 * badges. Les deux lisent `badgeGuideView` : un badge dit la même chose partout.
 */

/** La pastille de métal d'un palier : les deux teintes de la matière, éteinte quand le palier est à venir. */
function Swatch({ material, lit, size }: { readonly material: GameMaterial; readonly lit: boolean; readonly size: number }) {
  return (
    <span
      aria-hidden="true"
      data-badge-swatch={material}
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, var(--game-${material}-0), var(--game-${material}-1))`,
        opacity: lit ? 1 : 0.35,
        boxShadow: lit ? 'none' : `inset 0 0 0 1.5px ${INK_2}`,
      }}
    />
  );
}

function Rung({ rung }: { readonly rung: BadgeRungView }) {
  const lit = rung.state === 'reached';
  return (
    <li data-badge-rung={rung.state} className="flex items-center gap-3 py-1.5">
      <Swatch material={rung.material} lit={lit} size={18} />
      <span className="min-w-0 flex-1 text-body font-semibold" style={{ color: lit ? INK : INK_2 }}>
        {rung.materialName}
      </span>
      <span className="shrink-0 text-caption tabular-nums" style={{ color: INK_2 }}>
        {rung.thresholdLabel}
      </span>
      <span className="w-40 shrink-0 text-end text-caption" style={{ color: rung.state === 'next' ? BRAND : INK_2, fontWeight: rung.state === 'next' ? 600 : 400 }}>
        {rung.line}
      </span>
    </li>
  );
}

/** Les étoiles allumées sur sept — dites au lecteur d'écran en toutes lettres. */
export function BadgeStars({ stars }: { readonly stars: BadgeGuideView['stars'] }) {
  const label = `${gameText('game.badge.stars_label')} : ${gameText('game.fmt.fraction', { done: String(stars.lit), total: String(stars.max) })}`;
  return (
    <p data-badge-stars="" role="img" aria-label={label} className="flex items-center gap-1 text-title" style={{ color: BRAND }}>
      {Array.from({ length: stars.max }, (_, k) => (
        <span key={k} aria-hidden="true" style={{ opacity: k < stars.lit ? 1 : 0.25 }}>
          ★
        </span>
      ))}
      <span aria-hidden="true" className="ms-1 text-caption tabular-nums" style={{ color: INK_2 }}>
        {stars.lit}/{stars.max}
      </span>
    </p>
  );
}

export function BadgeLadder({ view }: { readonly view: BadgeGuideView }) {
  return (
    <section data-detail-ladder="" className="flex w-full flex-col gap-1">
      <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
        {gameText('game.badge.ladder_title')}
      </h3>
      <ol className="flex flex-col">
        {view.ladder.map((rung) => (
          <Rung key={rung.threshold} rung={rung} />
        ))}
      </ol>
    </section>
  );
}

/** La suite compacte : les paliers à venir, leur matière et leur seuil ; « Échelle complète » au Prisme. */
export function BadgeUpcoming({ view, axisLabel }: { readonly view: BadgeGuideView; readonly axisLabel: string }) {
  return (
    <div data-badge-upcoming={view.upcoming.length} className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-[60px] pb-2">
      {view.upcoming.length === 0 ? (
        <span className="text-check" style={{ color: INK_2 }}>
          {view.next}
        </span>
      ) : (
        <>
          <span className="sr-only">{`${axisLabel} — ${gameText('game.badge.upcoming_title')}`}</span>
          <span aria-hidden="true" className="text-check font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
            {gameText('game.badge.upcoming_title')}
          </span>
          {view.upcoming.map((rung) => (
            <span key={rung.threshold} data-badge-upcoming-rung={rung.state} className="inline-flex items-center gap-1 text-check tabular-nums" style={{ color: rung.state === 'next' ? BRAND : INK_2 }}>
              <Swatch material={rung.material} lit={false} size={10} />
              {rung.materialName} {rung.thresholdLabel}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
