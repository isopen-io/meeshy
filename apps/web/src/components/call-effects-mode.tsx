import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';
import { useStore } from 'zustand/react';

import { callActions } from '@/lib/calls/call-actions';
import type { CallCaption } from '@/lib/calls/call-captions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { callAudioOf, hasVideo } from '@/lib/calls/call-view';
import { captureStill, filmedTrack, type ClipEnv } from '@/lib/calls/call-capture-live';
import type { CaptureFile, SaveOutcome } from '@/lib/calls/call-capture-save';
import { addingLook, type EffectsCategory } from '@/lib/calls/call-effects-mode-rule';
import { onRowWheel } from '@/lib/calls/call-row-keys';
import { useSwapPresence } from '@/lib/calls/use-pill-motion';
import { FACE_EFFECTS, setVideoEffects, VIDEO_PRESET_CATALOG, videoEffectsStore, type FaceEffect, type VideoEffects, type VideoPreset } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog, translateCallStudio, type CallStudioCatalogKey, type TranslateCallStudioArgs } from '@/lib/i18n-call-studio-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CaptureFlash, CaptureHint, CaptureStatus, KeyboardRecord, RecordingStop, useCaptureStudio, type StudioVideo } from './call-capture-studio';
import { CallEffectsCompanions, type EffectsCompanion } from './call-effects-companions';
import type { Portrait } from './call-grid';
import { StreamVideo } from './call-media-elements';
import { CallModeBar, GLASS_WIDTH, ModeCarousel, ModeOption, type CarouselItem } from './call-mode-carousel';

/**
 * **LE MODE EFFETS** (#8442, #8551, #8578) — « Effets » (rangée Mon image, ou
 * le rail de ma caméra en plein écran) LIBÈRE l'écran : plus d'en-tête, plus de
 * pilule ni de rangées ; ma vidéo en plein écran, et en bas, seul, le
 * carrousel des effets. Une chose à la fois :
 *
 * - au-dessus du carrousel, la catégorie en texte discret — « Visage ·
 *   Couleur » — n'en montre qu'une ;
 * - la barre est UN verre : ‹ · Réglages · (+) (P8, P8b, #17580), et les puces
 *   « Visage · Couleur » y sont posées au-dessus de sa rangée de base. « Réglages »
 *   remplace la bande de looks et les puces par un verre SÉPARÉ, posé au-dessus
 *   de la barre — Luminosité · Flou du fond, là où la caméra l'offre — qui monte en
 *   fondu depuis elle pendant que la barre se resserre (morphisme) ; le
 *   re-toucher rend la bande de looks par le chemin inverse ;
 * - le look touché s'applique tout de suite et RESTE : ni Valider ni ✕. ‹ (ou
 *   Échap) rend l'appel ; (+) ouvre les looks d'un autre genre, à poser par-dessus ;
 * - plus de déclencheur (#8625) : DEUX TAPES sur l'effet choisi capturent mon
 *   image, un APPUI LONG la filme avec le son de l'appel, jusqu'au stop posé
 *   au centre (`call-capture-studio.tsx`) ;
 * - les autres restent à l'écran (#8737) : un bloc en haut, HORS de l'aperçu
 *   capturé, que le doigt range d'un coin à l'autre (`call-effects-companions.tsx`).
 *   Photo et film lisent MA vidéo par son élément nommé (`selfVideo`), jamais
 *   la première vidéo venue.
 *
 * Chaque choix part aussitôt sur la piste envoyée. Chunk à part
 * (`budgets.json` › `call_effects_mode`) qui n'importe rien de l'écran
 * d'appel ; son catalogue se charge avec lui (`loadEffectsModeText`).
 */

export const loadEffectsModeText = (language: InterfaceLanguage): Promise<unknown> => loadCallStudioCatalog(language);

/**
 * LES AUTRES DE L'APPEL (#8737), remis tels quels par l'écran avec ce qui vit
 * chez lui — le portrait et la couleur d'un locuteur : ce chunk n'importe rien
 * de `call_overlay`, et c'est lui, chargé à l'entrée du mode, qui en fait des
 * compagnons — leur vidéo quand elle se montre, leur portrait sinon — et le son
 * qu'un film emporte (`callAudioOf`).
 */
export type CallOthers = Pick<ActiveCall, 'members' | 'remoteStreams' | 'localStream'> & {
  readonly Portrait: typeof Portrait;
  readonly colorOf: (userId: string) => string;
};

export const companionsOf = ({ members, remoteStreams, Portrait: Face, colorOf }: CallOthers): readonly EffectsCompanion[] =>
  Object.values(members).map((member) => {
    const stream = remoteStreams[member.userId] ?? null;
    const shows = (member.cameraOn || member.screenSharing) && hasVideo(stream);
    return {
      id: member.userId,
      name: member.name,
      color: colorOf(member.userId),
      render: (width) =>
        shows ? <StreamVideo stream={stream} mirrored={false} fit={member.screenSharing ? 'contain' : 'cover'} className="absolute inset-0 size-full" label={member.name} /> : <Face name={member.name} avatar={member.avatar} size={Math.round(width / 2)} pulse={member.link === 'ringing'} presenceKey={member.userId} />,
    };
  });

type ModeProps = {
  readonly language: InterfaceLanguage;
  readonly colorAvailable: boolean;
  readonly blurAvailable: boolean;
  /** Ma vidéo en plein écran, posée par l'écran d'appel. */
  readonly preview: ReactNode;
  /** L'élément de MA vidéo (#8737) : la seule source des photos et des films du mode. */
  readonly selfVideo: () => HTMLVideoElement | null;
  /** Les autres participants, qui accompagnent mon image (#8737) : remis par l'écran (`others`), ou déjà composés. */
  readonly others?: CallOthers;
  readonly companions?: readonly EffectsCompanion[];
  /** Les sous-titres de l'appel : qui parle, faute d'un niveau audio (#8737). */
  readonly captions?: readonly CallCaption[];
  readonly onExit: () => void;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
  readonly apply?: (patch: Partial<VideoEffects>) => void;
  /** Le son de l'appel : mon micro et les voix des autres. */
  readonly audio?: () => readonly MediaStream[];
  readonly grab?: FrameGrab;
  readonly save?: (files: readonly CaptureFile[]) => Promise<SaveOutcome>;
  readonly clipEnv?: () => ClipEnv;
};

/** Ce qu'on tire de ma vidéo affichée : une image, ou une piste à filmer. */
export type FrameGrab = {
  readonly still: (video: HTMLVideoElement, style: string) => Promise<CaptureFile | null>;
  readonly film: (video: HTMLVideoElement) => StudioVideo | null;
};

export const EFFECTS_RECORD_FPS = 30;

const VIDEO_GRAB: FrameGrab = {
  still: (video, style) => captureStill({ video, style, now: new Date() }),
  film: (video) => filmedTrack(video, EFFECTS_RECORD_FPS),
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
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <ellipse cx="12" cy="13" rx="6.5" ry="7.5" fill="#f5c9a8" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M9 18c2 1 4 1 6 0" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.9" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M18.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#fff" />
    </>
  ),
  toad: (
    <>
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <ellipse cx="12" cy="15" rx="8.5" ry="6.5" fill="#6fbf3f" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="7.5" cy="8.5" r="3.4" fill="#6fbf3f" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="16.5" cy="8.5" r="3.4" fill="#6fbf3f" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="7.5" cy="8.5" r="2.2" fill="#fbf6d8" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="16.5" cy="8.5" r="2.2" fill="#fbf6d8" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <ellipse cx="7.5" cy="8.5" rx="1" ry="0.6" fill="#1b1b10" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <ellipse cx="16.5" cy="8.5" rx="1" ry="0.6" fill="#1b1b10" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M8 17c2.5 1.4 5.5 1.4 8 0" stroke="#2f5a1a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),
  angel: (
    <>
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <ellipse cx="12" cy="4.6" rx="6" ry="1.8" fill="none" stroke="#ffd666" strokeWidth="1.8" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="12" cy="14" r="6.5" fill="#fbe3c8" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M5 13c-2-1-3-3-2.5-5 1.5.5 3 2 3.5 3.5M19 13c2-1 3-3 2.5-5-1.5.5-3 2-3.5 3.5" fill="#fff" />
    </>
  ),
  demon: (
    <>
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M6 9 4.5 2.8 9 7M18 9l1.5-6.2L15 7" fill="#d9301f" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="12" cy="14" r="7" fill="#b3261e" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="9.3" cy="13" r="1.3" fill="#ffb347" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="14.7" cy="13" r="1.3" fill="#ffb347" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M9 17.2c2 1 4 1 6 0" stroke="#3a0b08" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  ),
  volcano: (
    <>
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M2.5 21 9 10h6l6.5 11z" fill="#5b3a2e" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <path d="M9 10h6l-1.2 3.2-1.8-1.2-1.8 1.4z" fill="#ff7a00" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="10" cy="5.5" r="1.4" fill="#ff9a1f" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="14" cy="3.8" r="1.1" fill="#ffcf40" />
      {/* harmony-exempt: illustration d un effet de visage, teintes propres a chaque effet */}
      <circle cx="12.4" cy="7" r="0.9" fill="#ff5a00" />
    </>
  ),
};

const SWATCH: Readonly<Record<VideoPreset, string>> = {
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  natural: 'linear-gradient(135deg, #f1d3b8, #9c7b62)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  warm: 'linear-gradient(135deg, #ffcf8a, #e0662c)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  cool: 'linear-gradient(135deg, #b8e1ff, #3a6fc4)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  vivid: 'linear-gradient(135deg, #ff5fa2, #ffd23f 55%, #36d1a6)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  muted: 'linear-gradient(135deg, #d7d2cc, #8a8580)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  golden: 'linear-gradient(135deg, #ffe0a3, #e8962e)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  film: 'linear-gradient(135deg, #cdb79a, #4f6f7a)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  softNight: 'linear-gradient(135deg, #9fb0d8, #2b3a67)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  bright: 'linear-gradient(135deg, #ffffff, #cfe4ee)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  velvet: 'linear-gradient(135deg, #c98aa6, #5a2a4a)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  sky: 'linear-gradient(135deg, #bfe3ff, #4a90d9)',
  // harmony-exempt: pastille de preset video, teintes propres a chaque preset
  monochrome: 'linear-gradient(135deg, #f2f2f2, #1a1a1a)',
};

const faceVisual = (effect: FaceEffect): ReactNode => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-9 text-on-media" data-call-face-glyph={effect}>
    {FACE_GLYPH[effect]}
  </svg>
);

const swatch = (preset: VideoPreset): ReactNode => <span aria-hidden className="size-full" style={{ background: SWATCH[preset] }} />;

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

const TEXT_TAB = 'min-h-11 rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none';

/** Les deux moitiés d'un remplacement se posent l'une sur l'autre, au même endroit : rien ne saute pendant le fondu. */
const STACKED = { gridArea: '1 / 1' } as const;

/**
 * Les puces qui repartent quittent la mise en page AUSSITÔT, posées à leur place au-dessus de la
 * rangée de base (le liseré `p-2` du verre) : la barre se resserre PENDANT qu'elles s'effacent — un
 * morphisme, pas un fondu suivi d'un saut (P8b.6, loi 17).
 */
const LEAVING_ROW = { position: 'absolute', insetInline: '0.5rem', bottom: 'calc(100% - 0.5rem)' } as const;

type TextOf = <K extends CallStudioCatalogKey>(key: K, ...params: TranslateCallStudioArgs<K>) => string;

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
function EffectsSettings({ language, effects, colorAvailable, blurAvailable, apply }: SettingsProps) {
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

/** Les puces « Visage · Couleur » : la rangée du haut de la barre, que Réglages ouvert fait partir. */
function EffectsCategories({ category, onPick, t }: { readonly category: EffectsCategory; readonly onPick: (entry: EffectsCategory) => void; readonly t: TextOf }) {
  return (
    <>
      <div role="group" aria-label={t('callStudio.mode.categories')} className="flex items-center justify-center text-on-media [text-shadow:0_1px_2px_var(--color-scrim)]" data-call-effects-categories="">
        {(['face', 'color'] as const).map((entry, index) => (
          <span key={entry} className="flex items-center">
            {index === 0 ? null : <span aria-hidden className="px-0.5 opacity-60">·</span>}
            <button type="button" aria-pressed={category === entry} onClick={() => onPick(entry)} className={`${TEXT_TAB} ${category === entry ? 'text-on-media' : 'text-on-media-3'}`} data-call-effects-category={entry}>
              {entry === 'face' ? t('callStudio.mode.face') : t('callStudio.effects.color')}
            </button>
          </span>
        ))}
      </div>
      <span aria-hidden className="h-px w-full" style={{ background: 'var(--color-media-hairline)' }} />
    </>
  );
}

export function CallEffectsMode({ language, colorAvailable, blurAvailable, preview, selfVideo, others, companions = others === undefined ? [] : companionsOf(others), captions = [], onExit, onWheel = onRowWheel, apply = applyNow, audio = () => callAudioOf(others), grab = VIDEO_GRAB, save, clipEnv }: ModeProps) {
  const effects = useStore(videoEffectsStore, (state) => state.effects);
  const root = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<EffectsCategory>('face');
  const [settings, setSettings] = useState(!colorAvailable);
  const t: TextOf = (key, ...params) => translateCallStudio(language, key, ...params);
  const controls = useRef<HTMLDivElement>(null);
  const rider = useRef<HTMLDivElement>(null);
  const style = useRef('none');
  const puces = useSwapPresence<HTMLDivElement>(colorAvailable && !settings);
  const looks = useSwapPresence<HTMLDivElement>(colorAvailable && !settings);
  const panel = useSwapPresence<HTMLDivElement>(settings);
  const studio = useCaptureStudio({
    language,
    still: async () => {
      const mine = selfVideo();
      return mine === null ? null : grab.still(mine, style.current);
    },
    video: () => {
      const mine = selfVideo();
      return mine === null ? null : grab.film(mine);
    },
    audio,
    style: () => style.current,
    ...(save === undefined ? {} : { save }),
    ...(clipEnv === undefined ? {} : { clipEnv }),
  });

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [data-call-mode-quit]')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onExit();
  };

  const items: readonly CarouselItem[] =
    category === 'face'
      ? FACE_EFFECTS.map((effect) => ({ id: effect, label: t(`callStudio.face.${effect}`), visual: faceVisual(effect) }))
      : VIDEO_PRESET_CATALOG.map((preset) => ({ id: preset, label: t(`callStudio.preset.${preset}`), visual: swatch(preset) }));
  const selected = category === 'face' ? effects.faceEffect : effects.preset;
  style.current = selected;
  const select = (id: string): void => {
    const face = FACE_EFFECTS.find((effect) => effect === id);
    const preset = VIDEO_PRESET_CATALOG.find((entry) => entry === id);
    if (category === 'face' && face !== undefined && face !== effects.faceEffect) apply({ faceEffect: face });
    if (category === 'color' && preset !== undefined && preset !== effects.preset) apply({ preset });
  };
  const addLook = (): void => {
    setSettings(false);
    setCategory(addingLook(category));
  };

  return (
    <div ref={root} role="region" aria-label={t('callStudio.mode.effects')} onKeyDown={onKeyDown} className="flex w-full flex-col items-center gap-3" data-call-mode="effects">
      <div className="pointer-events-none fixed inset-0 z-0 bg-media-backdrop" data-call-mode-preview="effects">
        {preview}
      </div>
      {companions.length === 0 ? null : <CallEffectsCompanions language={language} companions={companions} captions={captions} floor={controls} />}
      {studio.recording ? <RecordingStop language={language} elapsedMs={studio.elapsedMs} onStop={() => void studio.stop()} /> : null}
      <div ref={controls} className="relative z-10 flex w-full flex-col items-center gap-3">
        <div ref={rider} className="flex w-full flex-col items-center gap-3" data-call-mode-rider="">
          <CaptureStatus status={studio.status} />
          <div className="grid w-full items-end justify-items-center" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {looks.mounted ? (
              <div ref={looks.ref} className={`flex w-full flex-col items-center gap-3 ${settings ? 'pointer-events-none' : ''}`} style={STACKED} data-call-effects-looks="">
                <CaptureHint language={language} />
                <ModeCarousel
                  key={category}
                  label={t('callStudio.mode.pickEffect')}
                  items={items}
                  selected={selected}
                  onSelect={select}
                  onWheel={onWheel}
                  capture={{ recording: studio.recording, onCapture: studio.capture, hint: t('callStudio.capture.gestures') }}
                />
              </div>
            ) : null}
            {panel.mounted ? (
              <div ref={panel.ref} role="group" aria-label={t('callStudio.effects.settings')} className={`glass-call flex ${GLASS_WIDTH} flex-col gap-1 rounded-[24px] px-4 py-3 ${settings ? '' : 'pointer-events-none'}`} style={STACKED} data-call-effects-settings="">
                <EffectsSettings language={language} effects={effects} colorAvailable={colorAvailable} blurAvailable={blurAvailable} apply={apply} />
              </div>
            ) : null}
          </div>
          <KeyboardRecord language={language} recording={studio.recording} onPress={() => void (studio.recording ? studio.stop() : studio.record())} />
        </div>
        <CallModeBar
          glass
          rider={rider}
          above={
            puces.mounted ? (
              <div ref={puces.ref} className={`flex w-full flex-col items-center ${settings ? 'pointer-events-none' : ''}`} style={settings ? LEAVING_ROW : undefined} data-call-effects-categories-row="">
                <EffectsCategories category={category} onPick={setCategory} t={t} />
              </div>
            ) : null
          }
          quit={{ label: t('callStudio.mode.backEffects'), glyph: chevron, onPress: onExit, data: { 'data-call-mode-quit': '' } }}
          center={colorAvailable ? <ModeOption label={t('callStudio.mode.settingsLabel')} glyph={gear} caption={t('callStudio.effects.settings')} pressed={settings} onPress={() => setSettings((open) => !open)} data={{ 'data-call-effects-settings-toggle': '' }} /> : null}
          options={colorAvailable ? <ModeOption label={t('callStudio.mode.addLook')} glyph={plus} onPress={addLook} data={{ 'data-call-effects-add-look': '' }} /> : null}
        />
      </div>
      {studio.flashing ? <CaptureFlash onDone={studio.endFlash} /> : null}
    </div>
  );
}
