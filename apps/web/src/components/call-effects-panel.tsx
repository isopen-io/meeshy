import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useStore } from 'zustand/react';

import { CALL_EFFECTS_PANEL_ID } from '@/components/call-control-actions';
import { CallButton } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import { setVideoEffects, VIDEO_PRESETS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE PANNEAU DES EFFETS DE MA VIDÉO** (#8442) — ouvert par « Effets » du rail
 * « mon image », il monte au-dessus de la pilule, comme les actions de la vue
 * « C adapté ». Miroir de `VideoFiltersPanel.swift` : les cinq préréglages,
 * la luminosité, le flou d'arrière-plan (là où la caméra l'offre).
 *
 * Un verre d'appel sombre (`glass-call-prominent`, ce qu'on lit), ses boutons
 * transparents : jamais de verre sur du verre. Chaque geste part aussitôt sur
 * la piste envoyée — pas de bouton « Appliquer ». Échap ferme le panneau sans
 * réduire l'appel. Chunk à part (`budgets.json` › `call_effects_panel`), chargé
 * au premier « Effets ».
 */

type PanelProps = {
  readonly language: InterfaceLanguage;
  readonly colorAvailable: boolean;
  readonly blurAvailable: boolean;
  readonly onClose: () => void;
  readonly apply?: (patch: Partial<VideoEffects>) => void;
};

const applyNow = (patch: Partial<VideoEffects>): void => {
  setVideoEffects(patch);
  callActions.refreshEffects();
};

const CHIP = 'min-h-11 rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none';

export function CallEffectsPanel({ language, colorAvailable, blurAvailable, onClose, apply = applyNow }: PanelProps) {
  const effects = useStore(videoEffectsStore, (state) => state.effects);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[aria-checked="true"], button')?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  const percent = Math.round(effects.brightness * 100);
  return (
    <div
      ref={panel}
      id={CALL_EFFECTS_PANEL_ID}
      role="dialog"
      aria-labelledby="call-effects-title"
      onKeyDown={onKeyDown}
      className="glass-call-prominent mx-auto flex w-[min(calc(100%-2rem),24rem)] flex-col gap-3 rounded-[28px] p-3"
      data-call-effects-panel=""
    >
      <div className="flex items-center justify-between gap-2 pl-2">
        <h2 id="call-effects-title" className="text-body font-semibold">
          {translate(language, 'call.effects')}
        </h2>
        <CallButton label={translate(language, 'call.effects.close')} glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.x} size={20} />} onPress={onClose} size={44} data={{ 'data-call-effects-close': '' }} />
      </div>
      {colorAvailable ? (
        <>
          <div role="radiogroup" aria-label={translate(language, 'call.effects.presets')} className="flex flex-wrap gap-1.5">
            {VIDEO_PRESETS.map((preset) => {
              const checked = effects.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => apply({ preset })}
                  className={CHIP}
                  style={checked ? { background: 'white', color: 'var(--ios-indigo-950)' } : { background: 'transparent', color: 'white', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.35)' }}
                  data-call-effects-preset={preset}
                >
                  {translate(language, `call.effects.preset.${preset}`)}
                </button>
              );
            })}
          </div>
          <label className="flex min-h-11 items-center gap-3 px-1 text-mini">
            <span className="shrink-0">{translate(language, 'call.effects.brightness')}</span>
            <input
              type="range"
              min="-50"
              max="50"
              step="5"
              value={percent}
              aria-label={translate(language, 'call.effects.brightness')}
              aria-valuetext={`${percent > 0 ? '+' : ''}${percent} %`}
              onInput={(event) => apply({ brightness: Number((event.target as HTMLInputElement).value) / 100 })}
              onChange={() => undefined}
              className="h-11 min-w-0 flex-1 accent-white"
            />
          </label>
        </>
      ) : null}
      {blurAvailable ? (
        <button
          type="button"
          role="switch"
          aria-checked={effects.blur}
          onClick={() => apply({ blur: !effects.blur })}
          className="flex min-h-11 items-center justify-between gap-3 rounded-full px-2 text-mini font-semibold"
          data-call-effects-blur=""
        >
          <span>{translate(language, 'call.effects.blur')}</span>
          <span aria-hidden className="relative h-6 w-10 rounded-full transition-colors motion-reduce:transition-none" style={{ background: effects.blur ? 'var(--ios-success)' : 'rgb(255 255 255 / 0.3)' }}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${effects.blur ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
          </span>
        </button>
      ) : null}
    </div>
  );
}
