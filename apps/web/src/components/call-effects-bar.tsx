import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

import { callActions } from '@/lib/calls/call-actions';
import { CAPTURE_HOLD_MS } from '@/lib/calls/call-capture-gesture';
import { listLayers, type EffectGenre, type EffectLayer, type EffectStack } from '@/lib/calls/call-effect-layers';
import { useSwapPresence } from '@/lib/calls/use-mode-motion';
import { FACE_EFFECTS, setVideoEffects, VIDEO_PRESET_CATALOG, type VideoEffects } from '@/lib/calls/video-effects';
import { translateCallStudio, type CallStudioCatalogKey, type TranslateCallStudioArgs } from '@/lib/i18n-call-studio-catalog';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CallModeBar, GLASS_WIDTH, ModeOption, SIDE } from './call-mode-carousel';

/**
 * **LA BARRE D'EFFETS, UNE POUR LES DEUX MODES** (#17903, décision porteur du 2026-11-13 sur #16979 ; P8, C1) —
 * Effets, filtres et cadres sont UNE famille d'outils : le mode Effets et le mode Montage composent la MÊME
 * barre de verre, `‹ · Réglages · (+)`, sous les mêmes puces de tri. Ni « Quitter » ni « Valider » : ce qu'on
 * touche s'applique aussitôt, ‹ rend l'appel en gardant tout, et la barre revient à son menu de base après
 * chaque choix (liste refermée, Réglages rangé).
 *
 * (+) pose un genre de plus par-dessus ; son APPUI LONG — ou le menu contextuel, ou Maj + Entrée au clavier, que
 * le lecteur d'écran annonce — ouvre la liste des effets appliqués, de la couche du dessus à celle du dessous,
 * pour en annuler un (`call-effect-layers.ts` : trois couches au plus). Annuler referme la liste.
 *
 * Chunk partagé par les deux modes, qui n'importe rien de l'écran d'appel.
 */

export type TextOf = <K extends CallStudioCatalogKey>(key: K, ...params: TranslateCallStudioArgs<K>) => string;

/** Les mots de la pile d'effets : au catalogue des contrôles d'appel, chargé avec l'écran d'appel (le catalogue du studio est à son plafond). */
export type LayersText = {
  readonly frames: string;
  readonly title: string;
  readonly none: string;
  readonly full: string;
  readonly hint: string;
  readonly undo: (name: string) => string;
  readonly genre: (genre: EffectGenre) => string;
};

export const layersTextOf = (language: InterfaceLanguage): LayersText => ({
  frames: translateCallControls(language, 'callControls.mode.frames'),
  title: translateCallControls(language, 'callControls.layers.title'),
  none: translateCallControls(language, 'callControls.layers.none'),
  full: translateCallControls(language, 'callControls.layers.full'),
  hint: translateCallControls(language, 'callControls.layers.hint'),
  undo: (name) => translateCallControls(language, 'callControls.layers.undo', { name }),
  genre: (genre) => translateCallControls(language, `callControls.layers.genre.${genre}`),
});

export const textOf = (language: InterfaceLanguage): TextOf => (key, ...params) => translateCallStudio(language, key, ...params);

/** Applique un réglage sur la piste envoyée, aussitôt. */
export const applyNow = (patch: Partial<VideoEffects>): void => {
  setVideoEffects(patch);
  callActions.refreshEffects();
};

const chevron = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const plus = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const gear = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="m12 2.5 1.6 2.2 2.7-.6 1 2.6 2.6 1-.6 2.7 2.2 1.6-2.2 1.6.6 2.7-2.6 1-1 2.6-2.7-.6L12 21.5l-1.6-2.2-2.7.6-1-2.6-2.6-1 .6-2.7L2.5 12l2.2-1.6-.6-2.7 2.6-1 1-2.6 2.7.6z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const undo = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const TEXT_TAB = 'min-h-11 rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none';

/** Les deux moitiés d'un remplacement se posent l'une sur l'autre, au même endroit : rien ne saute pendant le fondu. */
export const STACKED: CSSProperties = { gridArea: '1 / 1' };

/**
 * Les puces qui repartent quittent la mise en page AUSSITÔT, posées à leur place au-dessus de la
 * rangée de base (le liseré `p-2` du verre) : la barre se resserre PENDANT qu'elles s'effacent — un
 * morphisme, pas un fondu suivi d'un saut (P8b.6, loi 17).
 */
const LEAVING_ROW: CSSProperties = { position: 'absolute', insetInline: '0.5rem', bottom: 'calc(100% - 0.5rem)' };

export type CategoryEntry = { readonly id: string; readonly label: string };

type CategoriesProps = { readonly entries: readonly CategoryEntry[]; readonly pressed: string; readonly onPick: (id: string) => void; readonly label: string };

/** Les puces qui trient les looks (Visage · Couleur · Cadres) : la rangée du haut de la barre, que Réglages ouvert fait partir. */
function EffectsCategories({ entries, pressed, onPick, label }: CategoriesProps) {
  return (
    <>
      <div role="group" aria-label={label} className="flex items-center justify-center text-on-media [text-shadow:0_1px_2px_var(--color-scrim)]" data-call-effects-categories="">
        {entries.map((entry, index) => (
          <span key={entry.id} className="flex items-center">
            {index === 0 ? null : <span aria-hidden className="px-0.5 opacity-60">·</span>}
            <button type="button" aria-pressed={pressed === entry.id} onClick={() => onPick(entry.id)} className={`${TEXT_TAB} ${pressed === entry.id ? 'text-on-media' : 'text-on-media-3'}`} data-call-effects-category={entry.id}>
              {entry.label}
            </button>
          </span>
        ))}
      </div>
      <span aria-hidden className="h-px w-full" style={{ background: 'var(--color-media-hairline)' }} />
    </>
  );
}

/** Une couche telle que la liste la dit : son genre, et ce qu'on y a choisi quand ce mode le sait nommer. */
export const appliedLabel = (text: LayersText, layer: EffectLayer, choiceName: (layer: EffectLayer) => string | undefined): string => {
  const genre = text.genre(layer.genre);
  const choice = choiceName(layer);
  return choice === undefined ? genre : `${genre} · ${choice}`;
};

/** Ce que les réglages de ma caméra posent comme couches : un effet de visage, un filtre de couleur — « Aucun » et « Naturel » n'en posent pas. */
export const effectsApplied = (effects: VideoEffects): EffectStack => [
  ...(effects.faceEffect === 'none' ? [] : [{ genre: 'face' as const, choice: effects.faceEffect }]),
  ...(effects.preset === 'natural' ? [] : [{ genre: 'color' as const, choice: effects.preset }]),
];

/** Le nom d'un effet de visage ou d'un filtre de couleur ; les autres genres se nomment chez le mode qui les porte. */
export const effectChoiceName = (t: TextOf, layer: EffectLayer): string | undefined => {
  const face = FACE_EFFECTS.find((effect) => effect === layer.choice);
  const preset = VIDEO_PRESET_CATALOG.find((entry) => entry === layer.choice);
  if (layer.genre === 'face' && face !== undefined) return t(`callStudio.face.${face}`);
  return layer.genre === 'color' && preset !== undefined ? t(`callStudio.preset.${preset}`) : undefined;
};

type ListProps = {
  readonly open: boolean;
  readonly stack: EffectStack;
  readonly label: (layer: EffectLayer) => string;
  readonly onUndo: (genre: EffectGenre) => void;
  readonly text: LayersText;
};

/** Les effets appliqués, du dessus au dessous : en annuler un le retire, et referme la liste. */
function EffectLayersList({ open, stack, label, onUndo, text }: ListProps) {
  const presence = useSwapPresence<HTMLDivElement>(open);
  if (!presence.mounted) return null;
  const layers = listLayers(stack);
  return (
    <div ref={presence.ref} role="group" aria-label={text.title} {...(open ? {} : { 'aria-hidden': true })} className={`glass-call absolute bottom-full mb-2 flex ${GLASS_WIDTH} flex-col rounded-[24px] p-2 ${open ? '' : 'pointer-events-none'}`} data-call-effect-layers="">
      {layers.length === 0 ? (
        <p className="flex min-h-11 items-center px-3 text-mini font-semibold text-on-media-3">{text.none}</p>
      ) : (
        <ul className="flex flex-col">
          {layers.map((layer) => {
            const name = label(layer);
            return (
              <li key={layer.genre} data-call-effect-layer={layer.genre}>
                <button type="button" aria-label={text.undo(name)} onClick={() => onUndo(layer.genre)} className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 rounded-full px-3 text-mini font-semibold text-on-media" data-call-effect-layer-undo={layer.genre}>
                  <span>{name}</span>
                  {undo}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type AddProps = {
  readonly label: string;
  readonly hint: string;
  readonly full: boolean;
  readonly onAdd: () => void;
  readonly onList: () => void;
};

/** (+) : une tape pose un genre de plus ; l'appui long, le menu contextuel ou Maj + Entrée ouvrent la liste des effets appliqués. */
function AddLookButton({ label, hint, full, onAdd, onList }: AddProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button > 0) return;
    clear();
    fired.current = false;
    timer.current = setTimeout(() => {
      timer.current = null;
      fired.current = true;
      onList();
    }, CAPTURE_HOLD_MS);
  };
  const press = (): void => {
    if (fired.current) {
      fired.current = false;
      return;
    }
    onAdd();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' || !event.shiftKey) return;
    event.preventDefault();
    onList();
  };
  return (
    <button
      type="button"
      aria-label={label}
      aria-description={hint}
      aria-keyshortcuts="Shift+Enter"
      aria-disabled={full ? true : undefined}
      title={label}
      onClick={press}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(event) => {
        event.preventDefault();
        clear();
        fired.current = false;
        onList();
      }}
      onKeyDown={onKeyDown}
      className={`glass-call touch-manipulation select-none [-webkit-touch-callout:none] ${SIDE} ${full ? 'opacity-60' : ''}`}
      data-call-effects-add-look=""
    >
      {plus}
    </button>
  );
}

type BarProps = {
  readonly language: InterfaceLanguage;
  /** Les puces de tri, déjà composées (`EffectsCategories` via `categories`), ou rien. */
  readonly categories: { readonly entries: readonly CategoryEntry[]; readonly pressed: string; readonly onPick: (id: string) => void } | null;
  /** Réglages : le centre de la barre ; sans traitement d'images, rien. */
  readonly settings: { readonly open: boolean; readonly onToggle: () => void } | null;
  /** (+) : rien quand le mode n'a pas de looks à ajouter. */
  readonly add: { readonly onAdd: () => void } | null;
  readonly stack: EffectStack;
  readonly full: boolean;
  readonly list: { readonly open: boolean; readonly onOpen: () => void; readonly onUndo: (genre: EffectGenre) => void; readonly label: (layer: EffectLayer) => string };
  readonly onBack: () => void;
  /** Ce qui est posé sur la barre, hors de son verre : il suit son bord du haut pendant le morphisme. */
  readonly rider: RefObject<HTMLElement | null>;
  /** Les puces et leur rangée sont en place (jamais pendant Réglages ouvert). */
  readonly chips: { readonly mounted: boolean; readonly ref: RefObject<HTMLDivElement | null>; readonly leaving: boolean };
};

/** La barre de verre, la même en Effets et en Montage. */
export function EffectsBar({ language, categories, settings, add, stack, full, list, onBack, rider, chips }: BarProps) {
  const t = textOf(language);
  const text = layersTextOf(language);
  return (
    <div className="relative flex w-full flex-col items-center">
      <EffectLayersList open={list.open} stack={stack} label={list.label} onUndo={list.onUndo} text={text} />
      <CallModeBar
        glass
        rider={rider}
        above={
          chips.mounted && categories !== null ? (
            <div ref={chips.ref} className={`flex w-full flex-col items-center ${chips.leaving ? 'pointer-events-none' : ''}`} style={chips.leaving ? LEAVING_ROW : undefined} data-call-effects-categories-row="">
              <EffectsCategories entries={categories.entries} pressed={categories.pressed} onPick={categories.onPick} label={t('callStudio.mode.categories')} />
            </div>
          ) : null
        }
        quit={{ label: t('callStudio.mode.backEffects'), glyph: chevron, onPress: onBack, data: { 'data-call-mode-quit': '' } }}
        center={settings === null ? null : <ModeOption label={t('callStudio.mode.settingsLabel')} glyph={gear} caption={t('callStudio.effects.settings')} pressed={settings.open} onPress={settings.onToggle} data={{ 'data-call-effects-settings-toggle': '' }} />}
        options={add === null ? null : <AddLookButton label={full ? text.full : t('callStudio.mode.addLook')} hint={text.hint} full={full} onAdd={add.onAdd} onList={list.onOpen} />}
      />
    </div>
  );
}

/** Le menu de base : la liste refermée, et le geste qui la rouvre — l'état que chaque mode garde pour sa barre. */
export function useLayersList(): { readonly open: boolean; readonly show: () => void; readonly hide: () => void } {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

type SettingsProps = {
  readonly language: InterfaceLanguage;
  readonly effects: VideoEffects;
  readonly colorAvailable: boolean;
  readonly blurAvailable: boolean;
  readonly apply: (patch: Partial<VideoEffects>) => void;
};

/**
 * Le panneau Réglages (P8b) : un verre SÉPARÉ, posé au-dessus de la barre — « Luminosité » au-dessus
 * de son curseur, « Flou du fond » et son interrupteur en dessous (là où la caméra l'offre).
 */
export function EffectsSettings({ language, effects, colorAvailable, blurAvailable, apply }: SettingsProps) {
  const percent = Math.round(effects.brightness * 100);
  return (
    <>
      {colorAvailable ? (
        <label className="flex flex-col gap-1 text-mini font-semibold text-on-media">
          <span>{translate(language, 'call.effects.brightness')}</span>
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
            className="h-11 w-full accent-on-media"
          />
        </label>
      ) : null}
      {blurAvailable ? (
        <button type="button" role="switch" aria-checked={effects.blur} onClick={() => apply({ blur: !effects.blur })} className="flex min-h-11 w-full items-center justify-between gap-3 text-mini font-semibold text-on-media" data-call-effects-blur="">
          <span>{translate(language, 'call.effects.blur')}</span>
          <span aria-hidden className="relative h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none" style={{ background: effects.blur ? 'var(--ios-success)' : 'var(--color-media-hairline)' }}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-on-media transition-transform motion-reduce:transition-none ${effects.blur ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
          </span>
        </button>
      ) : null}
    </>
  );
}

/** Le verre de Réglages, tel que les deux modes le posent au-dessus de leur barre. */
export function SettingsGlass({ presence, open, language, effects, colorAvailable, blurAvailable, apply }: SettingsProps & { readonly presence: { readonly ref: RefObject<HTMLDivElement | null> }; readonly open: boolean }) {
  return (
    <div ref={presence.ref} role="group" aria-label={translateCallStudio(language, 'callStudio.effects.settings')} className={`glass-call flex ${GLASS_WIDTH} flex-col gap-1 rounded-[24px] px-4 py-3 ${open ? '' : 'pointer-events-none'}`} style={STACKED} data-call-effects-settings="">
      <EffectsSettings language={language} effects={effects} colorAvailable={colorAvailable} blurAvailable={blurAvailable} apply={apply} />
    </div>
  );
}
