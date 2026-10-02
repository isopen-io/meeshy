import { isFullMediaCrop } from '@meeshy/shared/utils/media-crop';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  centeredCrop,
  pageWithBackgroundCrop,
  pageWithBackgroundMuted,
  pageWithBackgroundTrim,
  STUDIO_CROP_RATIOS,
  type StudioVisualAsset,
} from '@/lib/stories/studio-page';
import type { StudioPageEdit } from '@/lib/stories/studio-page-edit';

/**
 * **LES ÉDITIONS DE BASE D'UNE PIÈCE RETOUCHÉE** (#9136, jumelles de la bande
 * de rognage, du muet et des pastilles de recadrage iOS) — une vidéo se COUPE
 * (début, fin) et se TAIT ; une image se RECADRE. Chaque geste écrit la page
 * sur-le-champ (la scène le montre) et se défait par l'historique ; « Terminé »
 * rend la pièce coupée, muette ou recadrée.
 */

/** La fenêtre la plus courte qu'on laisse produire (`MediaTrimRule.minimumDuration`). */
const MINIMUM_WINDOW = 0.4;

const LABEL = 'text-caption font-bold uppercase tracking-wide';
const RANGE_STYLE = { accentColor: 'var(--color-ios-brand)' } as const;

const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds * 10) / 10);
  return `${Math.floor(whole / 60)}:${(whole % 60).toFixed(1).padStart(4, '0')}`;
};

export function StudioTrimControls({ lang, asset, onPage }: { readonly lang: InterfaceLanguage; readonly asset: StudioVisualAsset; readonly onPage: StudioPageEdit }) {
  const total = (asset.durationMs ?? 0) / 1000;
  if (total <= MINIMUM_WINDOW) return null;
  const start = asset.trim?.start ?? 0;
  const end = asset.trim?.end ?? total;
  const write = (next: { readonly start: number; readonly end: number }) =>
    onPage((page) => pageWithBackgroundTrim(page, next.start <= 0.01 && next.end >= total - 0.01 ? null : next), 'trim:visual');
  return (
    <div className="flex flex-col gap-2" data-story-trim>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink)' }} aria-live="polite">
        {translate(lang, 'story.studio.trim.kept', { kept: clock(end - start), total: clock(total) })}
      </p>
      <label className="flex items-center gap-3">
        <span className={`${LABEL} w-14`}>{translate(lang, 'story.studio.trim.start')}</span>
        <input
          type="range"
          data-story-trim-start
          min={0}
          max={total}
          step={0.1}
          value={start}
          aria-valuetext={clock(start)}
          onInput={(event) => write({ start: Math.min(Number(event.currentTarget.value), end - MINIMUM_WINDOW), end })}
          className="h-11 flex-1"
          style={RANGE_STYLE}
        />
      </label>
      <label className="flex items-center gap-3">
        <span className={`${LABEL} w-14`}>{translate(lang, 'story.studio.trim.end')}</span>
        <input
          type="range"
          data-story-trim-end
          min={0}
          max={total}
          step={0.1}
          value={end}
          aria-valuetext={clock(end)}
          onInput={(event) => write({ start, end: Math.max(Number(event.currentTarget.value), start + MINIMUM_WINDOW) })}
          className="h-11 flex-1"
          style={RANGE_STYLE}
        />
      </label>
    </div>
  );
}

export function StudioSoundControls({ lang, asset, onPage }: { readonly lang: InterfaceLanguage; readonly asset: StudioVisualAsset; readonly onPage: StudioPageEdit }) {
  const muted = asset.muted === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={muted}
      data-story-mute
      onClick={() => onPage((page) => pageWithBackgroundMuted(page, !muted))}
      className="flex items-center justify-between gap-3 rounded-xl px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        outlineColor: 'var(--color-ios-brand)',
        color: muted ? '#111' : 'var(--color-ios-ink)',
        backgroundColor: muted ? '#fff' : 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
      }}
    >
      {translate(lang, 'story.studio.sound.mute')}
      <span aria-hidden="true">{muted ? '●' : '○'}</span>
    </button>
  );
}

const ratioLabel = (lang: InterfaceLanguage, ratio: number | null): string => {
  if (ratio === null) return translate(lang, 'story.studio.crop.original');
  if (ratio === 1) return '1:1';
  if (ratio === 4 / 5) return '4:5';
  return ratio < 1 ? '9:16' : '16:9';
};

export function StudioCropControls({ lang, asset, onPage }: { readonly lang: InterfaceLanguage; readonly asset: StudioVisualAsset; readonly onPage: StudioPageEdit }) {
  const source = asset.aspectRatio ?? 0;
  const current = asset.crop;
  const chosen = (ratio: number | null): boolean => {
    if (ratio === null) return current === undefined || isFullMediaCrop(current);
    const target = centeredCrop(ratio, source);
    return current !== undefined && Math.abs(current.width - target.width) < 0.001 && Math.abs(current.height - target.height) < 0.001;
  };
  return (
    <>
      <p className={LABEL} style={{ color: 'var(--color-ios-ink)' }}>
        {translate(lang, 'story.studio.crop.ratio')}
      </p>
      <div role="radiogroup" aria-label={translate(lang, 'story.studio.crop.ratio')} className="flex flex-wrap gap-1.5">
        {STUDIO_CROP_RATIOS.map((ratio) => {
          const on = chosen(ratio);
          return (
            <button
              key={ratio ?? 'original'}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={ratio !== null && source <= 0}
              data-story-crop-ratio={ratioLabel('en', ratio)}
              onClick={() => onPage((page) => pageWithBackgroundCrop(page, centeredCrop(ratio, source)))}
              className="whitespace-nowrap rounded-xl px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
              style={{
                minHeight: 44,
                outlineColor: 'var(--color-ios-brand)',
                color: on ? '#111' : 'var(--color-ios-ink)',
                backgroundColor: on ? '#fff' : 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
              }}
            >
              {ratioLabel(lang, ratio)}
            </button>
          );
        })}
      </div>
    </>
  );
}
