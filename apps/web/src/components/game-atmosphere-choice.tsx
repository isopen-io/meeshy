import { useId, useState } from 'react';

import { DEFAULT_GLORY_ATMOSPHERE, type GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import type { AtmosphereTile } from '@/lib/game/atmosphere';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { gameText } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LE CHOIX D'ATMOSPHÈRE (#10163, L10b ; écran E1 de `docs/product/cadres-de-gloire/ecrans/`) — les sept
 * atmosphères, l'Afrique éternelle en tête, chacune par sa vignette (la couverture du pack quand la boutique
 * la sert, sinon le nom seul), son nom, sa courte histoire et son état sur l'appareil (incluse, installée, ou
 * le poids à télécharger) : la MÊME valeur de rangée que la boutique. Choisir enregistre aussitôt et installe
 * le pack — rien à comprendre de plus. « Choisir plus tard » n'enregistre rien ; les réglages n'offrent pas ce
 * geste (un « plus tard » n'y a pas de sens), ils ferment.
 */
export type GameAtmosphereChoiceProps = {
  readonly current: GloryAtmosphere | null;
  readonly tiles: readonly AtmosphereTile[];
  /** « Nouveau rang · Ambassadeur I » au-dessus du titre ; absent dans les réglages. */
  readonly kicker?: string | null;
  readonly busy?: boolean;
  readonly notice?: string | null;
  readonly onChoose: (atmosphere: GloryAtmosphere) => void;
  readonly onLater?: () => void;
  readonly onClose: () => void;
};

const weightOf = (bytes: number): string => {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(currentInterfaceLanguage(), { style: 'unit', unit: mega ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(bytes / (mega ? 1_000_000 : 1_000));
};

export const atmosphereName = (atmosphere: GloryAtmosphere): string => gameText(`game.atmosphere.name.${atmosphere}`);

const presenceOf = (tile: AtmosphereTile): { readonly text: string; readonly tone: 'good' | 'plain' } | null => {
  if (!tile.removable) return { text: gameText('game.atmosphere.included'), tone: 'good' };
  if (tile.installed === true) return { text: gameText('game.atmosphere.installed'), tone: 'good' };
  if (tile.downloadBytes !== null) return { text: gameText('game.atmosphere.to_download', { size: weightOf(tile.downloadBytes) }), tone: 'plain' };
  return null;
};

export function GameAtmosphereChoice({ current, tiles, kicker = null, busy = false, notice = null, onChoose, onLater, onClose }: GameAtmosphereChoiceProps) {
  const titleId = useId();
  const [picked, setPicked] = useState<GloryAtmosphere>(current ?? DEFAULT_GLORY_ATMOSPHERE);
  useBackDismiss(onClose, { escape: true });
  const name = atmosphereName(picked);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-atmosphere-choice=""
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ backgroundColor: 'color-mix(in srgb, var(--ios-indigo-950) 60%, transparent)' }}
    >
      <div className="flex max-h-dvh w-full max-w-md flex-col gap-3 overflow-y-auto overflow-x-clip overscroll-x-none rounded-card px-4 py-4 pt-safe pb-safe" style={{ backgroundColor: 'var(--color-ios-surface)' }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText('game.atmosphere.yours')}
          </p>
          <button type="button" data-atmosphere-close="" onClick={onClose} className="rounded-chip px-3 text-body font-semibold" style={{ minHeight: 44, color: GAME_BRAND }}>
            {gameText('game.photo.close')}
          </button>
        </div>
        {kicker === null ? null : (
          <p className="text-caption font-semibold" style={{ color: GAME_BRAND }}>
            {kicker}
          </p>
        )}
        <h2 id={titleId} className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.atmosphere.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.atmosphere.body')}
        </p>
        <div role="radiogroup" aria-label={gameText('game.atmosphere.group')} className="flex flex-col gap-2">
          {tiles.map((tile) => {
            const selected = tile.atmosphere === picked;
            const presence = presenceOf(tile);
            return (
              <button
                key={tile.atmosphere}
                type="button"
                role="radio"
                aria-checked={selected}
                data-atmosphere-option={tile.atmosphere}
                onClick={() => setPicked(tile.atmosphere)}
                className="flex items-center gap-3 rounded-card px-3 py-2 text-start"
                style={{ minHeight: 64, backgroundColor: 'var(--color-ios-card)', outline: selected ? `2px solid ${GAME_BRAND}` : 'none', outlineOffset: -2 }}
              >
                {tile.cover === null ? (
                  <span aria-hidden className="block shrink-0 rounded-xl" style={{ width: 36, height: 64, backgroundColor: 'var(--color-ios-fill)' }} />
                ) : (
                  <img src={tile.cover} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" className="block shrink-0 rounded-xl object-cover" style={{ width: 36, height: 64 }} />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body font-semibold" style={{ color: GAME_INK }}>
                    {atmosphereName(tile.atmosphere)}
                  </span>
                  <span className="text-caption" style={{ color: GAME_INK_2 }}>
                    {gameText(`game.atmosphere.story.${tile.atmosphere}`)}
                  </span>
                  {presence === null ? null : (
                    <span data-atmosphere-presence={tile.atmosphere} className="text-check font-semibold tabular-nums" style={{ color: presence.tone === 'good' ? GAME_GOOD : GAME_INK_2 }}>
                      {presence.text}
                    </span>
                  )}
                </span>
                <span aria-hidden className="size-5 shrink-0 rounded-full" style={{ border: `2px solid ${selected ? GAME_BRAND : GAME_INK_2}`, backgroundColor: selected ? GAME_BRAND : 'transparent' }} />
              </button>
            );
          })}
        </div>
        {notice === null ? null : (
          <p role="status" className="text-caption" style={{ color: GAME_ERROR }}>
            {notice}
          </p>
        )}
        <button
          type="button"
          data-atmosphere-continue=""
          disabled={busy}
          aria-busy={busy}
          onClick={() => onChoose(picked)}
          className="rounded-chip px-4 text-body font-semibold disabled:opacity-60"
          style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: 'var(--color-ios-surface)' }}
        >
          {gameText('game.atmosphere.continue', { name })}
        </button>
        {onLater === undefined ? null : (
          <button type="button" data-atmosphere-later="" onClick={onLater} className="rounded-chip px-4 text-body font-semibold" style={{ minHeight: 44, color: GAME_INK_2 }}>
            {gameText('game.atmosphere.later')}
          </button>
        )}
      </div>
    </div>
  );
}
