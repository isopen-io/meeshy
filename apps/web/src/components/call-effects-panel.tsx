import type { ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { callActions } from '@/lib/calls/call-actions';
import { FACE_EFFECTS, setVideoEffects, VIDEO_PRESETS, videoEffectsStore, type FaceEffect, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog, translateCallStudio } from '@/lib/i18n-call-studio-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CallPanelFrame, CHIP, chipStyle, PanelRow, type RowKeyDown } from './call-panel-frame';

/**
 * **LE PANNEAU DES EFFETS DE MA VIDÉO** (#8442, #8551) — ouvert par « Effets »
 * de la rangée « Mon image », il s'ouvre DANS le cadre de la pilule (#8550),
 * en trois rangées qui défilent à l'horizontale :
 *
 * - **Effets** : les effets de visage — lissage de peau, crapaud, ange, démon,
 *   éruption —, chacun avec son aperçu dessiné ;
 * - **Couleur** : les cinq préréglages d'iOS (`VideoFiltersPanel.swift`) ;
 * - **Réglages** : la luminosité, et le flou d'arrière-plan là où la caméra
 *   l'offre.
 *
 * Chaque geste part aussitôt sur la piste envoyée — pas de bouton
 * « Appliquer ». Les effets de visage et la couleur passent par le même
 * traitement d'images : sans lui (`colorAvailable`), seul le flou reste.
 * Chunk à part (`budgets.json` › `call_effects_panel`) qui n'importe rien de
 * l'écran d'appel ; il charge son catalogue (`loadEffectsPanelText`) avant de
 * se montrer.
 */

type PanelProps = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly colorAvailable: boolean;
  readonly blurAvailable: boolean;
  readonly onClose: () => void;
  readonly onRowKeyDown: RowKeyDown;
  readonly apply?: (patch: Partial<VideoEffects>) => void;
};

export const loadEffectsPanelText = (language: InterfaceLanguage): Promise<unknown> => loadCallStudioCatalog(language);

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

function FaceGlyph({ effect }: { readonly effect: FaceEffect }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0" data-call-face-glyph={effect}>
      {FACE_GLYPH[effect]}
    </svg>
  );
}

export function CallEffectsPanel({ id, closeGlyph, language, colorAvailable, blurAvailable, onClose, onRowKeyDown, apply = applyNow }: PanelProps) {
  const effects = useStore(videoEffectsStore, (state) => state.effects);
  const percent = Math.round(effects.brightness * 100);
  const settings = colorAvailable || blurAvailable;
  return (
    <CallPanelFrame
      id={id}
      title={translate(language, 'call.effects')}
      closeLabel={translate(language, 'call.effects.close')}
      closeGlyph={closeGlyph}
      onClose={onClose}
      data={{ 'data-call-effects-panel': '' }}
      closeData={{ 'data-call-effects-close': '' }}
    >
      {colorAvailable ? (
        <PanelRow title={translateCallStudio(language, 'callStudio.effects.faces')} role="radiogroup" onRowKeyDown={onRowKeyDown} data={{ 'data-call-effects-row': 'faces' }}>
          {FACE_EFFECTS.map((effect) => {
            const checked = effects.faceEffect === effect;
            return (
              <button
                key={effect}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => apply({ faceEffect: effect })}
                className={`${CHIP} pl-2`}
                style={chipStyle(checked)}
                data-row-item=""
                data-call-effects-face={effect}
              >
                <FaceGlyph effect={effect} />
                {translateCallStudio(language, `callStudio.face.${effect}`)}
              </button>
            );
          })}
        </PanelRow>
      ) : null}
      {colorAvailable ? (
        <PanelRow title={translateCallStudio(language, 'callStudio.effects.color')} role="radiogroup" onRowKeyDown={onRowKeyDown} data={{ 'data-call-effects-row': 'color' }}>
          {VIDEO_PRESETS.map((preset) => {
            const checked = effects.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => apply({ preset })}
                className={CHIP}
                style={chipStyle(checked)}
                data-row-item=""
                data-call-effects-preset={preset}
              >
                {translate(language, `call.effects.preset.${preset}`)}
              </button>
            );
          })}
        </PanelRow>
      ) : null}
      {settings ? (
        <PanelRow title={translateCallStudio(language, 'callStudio.effects.settings')} role="toolbar" onRowKeyDown={onRowKeyDown} data={{ 'data-call-effects-row': 'settings' }}>
          {colorAvailable ? (
            <label className="flex min-h-11 w-60 items-center gap-3 rounded-full px-3 text-mini" style={chipStyle(false)}>
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
          ) : null}
          {blurAvailable ? (
            <button
              type="button"
              role="switch"
              aria-checked={effects.blur}
              onClick={() => apply({ blur: !effects.blur })}
              className={CHIP}
              style={chipStyle(false)}
              data-row-item=""
              data-call-effects-blur=""
            >
              <span>{translate(language, 'call.effects.blur')}</span>
              <span aria-hidden className="relative h-6 w-10 rounded-full transition-colors motion-reduce:transition-none" style={{ background: effects.blur ? 'var(--ios-success)' : 'rgb(255 255 255 / 0.3)' }}>
                <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${effects.blur ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
              </span>
            </button>
          ) : null}
        </PanelRow>
      ) : null}
    </CallPanelFrame>
  );
}
