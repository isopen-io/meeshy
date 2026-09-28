import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';
import { useStore } from 'zustand/react';

import { callActions } from '@/lib/calls/call-actions';
import { FACE_EFFECTS, setVideoEffects, VIDEO_PRESETS, videoEffectsStore, type FaceEffect, type VideoEffects, type VideoPreset } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog, translateCallStudio, type CallStudioCatalogKey, type TranslateCallStudioArgs } from '@/lib/i18n-call-studio-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CallModeBar, ModeCarousel, ModeOption, type CarouselItem } from './call-mode-carousel';

/**
 * **LE MODE EFFETS** (#8442, #8551, #8578) — « Effets » (rangée Mon image, ou
 * le rail de ma caméra en plein écran) LIBÈRE l'écran : plus d'en-tête, plus de
 * pilule ni de rangées ; ma vidéo en plein écran, et en bas, seul, le
 * carrousel des effets. Une chose à la fois :
 *
 * - au-dessus du carrousel, la catégorie en texte discret — « Visage ·
 *   Couleur » — n'en montre qu'une ;
 * - « Réglages », à droite de la barre, remplace le carrousel par une rangée
 *   compacte (luminosité, flou d'arrière-plan là où la caméra l'offre) ; le
 *   re-toucher rend le carrousel ;
 * - le déclencheur « Valider » garde l'effet et rend l'appel ; ✕ (ou Échap)
 *   quitte en rendant les effets d'avant le mode.
 *
 * Chaque choix part aussitôt sur la piste envoyée. Chunk à part
 * (`budgets.json` › `call_effects_mode`) qui n'importe rien de l'écran
 * d'appel ; son catalogue se charge avec lui (`loadEffectsModeText`).
 */

export const loadEffectsModeText = (language: InterfaceLanguage): Promise<unknown> => loadCallStudioCatalog(language);

type Category = 'face' | 'color';

type ModeProps = {
  readonly language: InterfaceLanguage;
  readonly colorAvailable: boolean;
  readonly blurAvailable: boolean;
  /** Ma vidéo en plein écran, posée par l'écran d'appel. */
  readonly preview: ReactNode;
  readonly quitGlyph: ReactNode;
  readonly onExit: () => void;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
  readonly apply?: (patch: Partial<VideoEffects>) => void;
};

const applyNow = (patch: Partial<VideoEffects>): void => {
  setVideoEffects(patch);
  callActions.refreshEffects();
};

const FACE_GLYPH: Readonly<Record<FaceEffect, ReactNode>> = {
  none: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 17.5 17.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  smoothing: (
    <>
      <ellipse cx="12" cy="13" rx="6.5" ry="7.5" fill="#f5c9a8" />
      <path d="M9 18c2 1 4 1 6 0" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M18.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#fff" />
    </>
  ),
  toad: (
    <>
      <ellipse cx="12" cy="15" rx="8.5" ry="6.5" fill="#6fbf3f" />
      <circle cx="7.5" cy="8.5" r="3.4" fill="#6fbf3f" />
      <circle cx="16.5" cy="8.5" r="3.4" fill="#6fbf3f" />
      <circle cx="7.5" cy="8.5" r="2.2" fill="#fbf6d8" />
      <circle cx="16.5" cy="8.5" r="2.2" fill="#fbf6d8" />
      <ellipse cx="7.5" cy="8.5" rx="1" ry="0.6" fill="#1b1b10" />
      <ellipse cx="16.5" cy="8.5" rx="1" ry="0.6" fill="#1b1b10" />
      <path d="M8 17c2.5 1.4 5.5 1.4 8 0" stroke="#2f5a1a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),
  angel: (
    <>
      <ellipse cx="12" cy="4.6" rx="6" ry="1.8" fill="none" stroke="#ffd666" strokeWidth="1.8" />
      <circle cx="12" cy="14" r="6.5" fill="#fbe3c8" />
      <path d="M5 13c-2-1-3-3-2.5-5 1.5.5 3 2 3.5 3.5M19 13c2-1 3-3 2.5-5-1.5.5-3 2-3.5 3.5" fill="#fff" />
    </>
  ),
  demon: (
    <>
      <path d="M6 9 4.5 2.8 9 7M18 9l1.5-6.2L15 7" fill="#d9301f" />
      <circle cx="12" cy="14" r="7" fill="#b3261e" />
      <circle cx="9.3" cy="13" r="1.3" fill="#ffb347" />
      <circle cx="14.7" cy="13" r="1.3" fill="#ffb347" />
      <path d="M9 17.2c2 1 4 1 6 0" stroke="#3a0b08" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  ),
  volcano: (
    <>
      <path d="M2.5 21 9 10h6l6.5 11z" fill="#5b3a2e" />
      <path d="M9 10h6l-1.2 3.2-1.8-1.2-1.8 1.4z" fill="#ff7a00" />
      <circle cx="10" cy="5.5" r="1.4" fill="#ff9a1f" />
      <circle cx="14" cy="3.8" r="1.1" fill="#ffcf40" />
      <circle cx="12.4" cy="7" r="0.9" fill="#ff5a00" />
    </>
  ),
};

const SWATCH: Readonly<Record<VideoPreset, string>> = {
  natural: 'linear-gradient(135deg, #f1d3b8, #9c7b62)',
  warm: 'linear-gradient(135deg, #ffcf8a, #e0662c)',
  cool: 'linear-gradient(135deg, #b8e1ff, #3a6fc4)',
  vivid: 'linear-gradient(135deg, #ff5fa2, #ffd23f 55%, #36d1a6)',
  muted: 'linear-gradient(135deg, #d7d2cc, #8a8580)',
};

const faceVisual = (effect: FaceEffect): ReactNode => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-9 text-white" data-call-face-glyph={effect}>
    {FACE_GLYPH[effect]}
  </svg>
);

const swatch = (preset: VideoPreset): ReactNode => <span aria-hidden className="size-full" style={{ background: SWATCH[preset] }} />;

const check = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

const sliders = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

const TEXT_TAB = 'min-h-11 rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none';

export function CallEffectsMode({ language, colorAvailable, blurAvailable, preview, quitGlyph, onExit, onWheel, apply = applyNow }: ModeProps) {
  const effects = useStore(videoEffectsStore, (state) => state.effects);
  const before = useRef(effects);
  const root = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<Category>('face');
  const [settings, setSettings] = useState(!colorAvailable);
  const t = <K extends CallStudioCatalogKey>(key: K, ...params: TranslateCallStudioArgs<K>): string => translateCallStudio(language, key, ...params);
  const percent = Math.round(effects.brightness * 100);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [data-call-effects-validate]')?.focus();
  }, []);

  const quit = (): void => {
    apply(before.current);
    onExit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    quit();
  };

  const items: readonly CarouselItem[] =
    category === 'face'
      ? FACE_EFFECTS.map((effect) => ({ id: effect, label: t(`callStudio.face.${effect}`), visual: faceVisual(effect) }))
      : VIDEO_PRESETS.map((preset) => ({ id: preset, label: translate(language, `call.effects.preset.${preset}`), visual: swatch(preset) }));
  const selected = category === 'face' ? effects.faceEffect : effects.preset;
  const select = (id: string): void => {
    const face = FACE_EFFECTS.find((effect) => effect === id);
    const preset = VIDEO_PRESETS.find((entry) => entry === id);
    if (category === 'face' && face !== undefined && face !== effects.faceEffect) apply({ faceEffect: face });
    if (category === 'color' && preset !== undefined && preset !== effects.preset) apply({ preset });
  };

  return (
    <div ref={root} role="region" aria-label={t('callStudio.mode.effects')} onKeyDown={onKeyDown} className="flex w-full flex-col items-center gap-3" data-call-mode="effects">
      <div className="pointer-events-none fixed inset-0 z-0 bg-black" data-call-mode-preview="effects">
        {preview}
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-3">
        {settings ? (
          <div role="group" aria-label={t('callStudio.effects.settings')} className="glass-call flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-3 rounded-[24px] px-4 py-2" data-call-effects-settings="">
            {colorAvailable ? (
              <label className="flex min-h-11 items-center gap-3 text-mini text-white">
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
                  className="h-11 w-36 accent-white"
                />
              </label>
            ) : null}
            {blurAvailable ? (
              <button type="button" role="switch" aria-checked={effects.blur} onClick={() => apply({ blur: !effects.blur })} className="flex min-h-11 items-center gap-2 text-mini font-semibold text-white" data-call-effects-blur="">
                <span>{translate(language, 'call.effects.blur')}</span>
                <span aria-hidden className="relative h-6 w-10 rounded-full transition-colors motion-reduce:transition-none" style={{ background: effects.blur ? 'var(--ios-success)' : 'rgb(255 255 255 / 0.3)' }}>
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${effects.blur ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div role="group" aria-label={t('callStudio.mode.categories')} className="flex items-center text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.6)]" data-call-effects-categories="">
              {(['face', 'color'] as const).map((entry, index) => (
                <span key={entry} className="flex items-center">
                  {index === 0 ? null : <span aria-hidden className="px-0.5 opacity-60">·</span>}
                  <button type="button" aria-pressed={category === entry} onClick={() => setCategory(entry)} className={`${TEXT_TAB} ${category === entry ? 'text-white' : 'text-white/55'}`} data-call-effects-category={entry}>
                    {entry === 'face' ? t('callStudio.mode.face') : t('callStudio.effects.color')}
                  </button>
                </span>
              ))}
            </div>
            <ModeCarousel key={category} label={t('callStudio.mode.pickEffect')} items={items} selected={selected} onSelect={select} onWheel={onWheel} />
          </>
        )}
        <CallModeBar
          quit={{ label: t('callStudio.mode.quitEffects'), glyph: quitGlyph, onPress: quit, data: { 'data-call-mode-quit': '' } }}
          shutter={{ label: t('callStudio.mode.validateLabel'), glyph: check, onPress: onExit, data: { 'data-call-effects-validate': '' } }}
          options={colorAvailable ? <ModeOption label={t('callStudio.mode.settingsLabel')} glyph={sliders} pressed={settings} onPress={() => setSettings((open) => !open)} data={{ 'data-call-effects-settings-toggle': '' }} /> : null}
        />
      </div>
    </div>
  );
}
