import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CanvasDocument } from '@/lib/canvas/document';
import { announceBackgroundSound, GENERIC_CREDIT, MARQUEE_GAP_PX, marqueePlan, type MarqueePlan } from '@/lib/canvas/sound-announcement';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';

type Measure = (nodes: { readonly box: HTMLElement; readonly content: HTMLElement }) => {
  readonly contentWidth: number;
  readonly boxWidth: number;
};

const domMeasure: Measure = ({ box, content }) => ({ contentWidth: content.scrollWidth, boxWidth: box.clientWidth });

/** L'encre et la largeur que chaque SURFACE déclare : le blanc ombré du chrome
 * posé sur un média (réel, story), l'encre secondaire sur une carte du fil. */
const SURFACES = {
  media: { tint: 'var(--color-on-media)', maxWidth: 200, className: 'viewer-ink-shadow' },
  card: { tint: 'var(--color-ios-ink-2)', maxWidth: 160, className: '' },
} as const;

/** Le muet de la surface et son geste : présent ⇒ la note est le bouton qui
 * coupe le son de fond. Absent (une carte qui ne joue rien, une piste que le
 * transport a refusée) ⇒ la note reste un dessin, jamais un contrôle inerte. */
export type SoundCreditControl = {
  readonly muted: boolean;
  readonly onToggle: () => void;
  /** Les prises que les gates de l'hôte tapent déjà (`data-reel-gesture`, `data-story-sound-toggle`). */
  readonly probe?: Readonly<Record<`data-${string}`, string>>;
};

const stop = (event: { stopPropagation: () => void }): void => event.stopPropagation();

/**
 * LA NOTE (#9698, miroir `BackgroundSoundNote`) — elle précède toujours le
 * crédit, et se BARRE quand le son de fond est coupé. Bouton, sa cible fait 44
 * de côté autour d'un glyphe de 12 : elle déborde vers le bas et les côtés,
 * peu vers le haut, où se tient le nom de l'auteur.
 */
function SoundNote({ control, language }: { readonly control: SoundCreditControl | undefined; readonly language: InterfaceLanguage }) {
  const muted = control?.muted === true;
  const note = (
    <span data-sound-note={muted ? 'barred' : 'plain'} aria-hidden="true" className="relative inline-grid shrink-0 place-items-center">
      <GlyphSvg glyph={FEED_GLYPHS.musicNote} size={12} />
      {muted ? (
        <svg data-sound-bar="" className="absolute inset-0 size-full" viewBox="0 0 12 12" fill="none">
          <path d="M1.5 1.5 10.5 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
  if (control === undefined) return note;
  return (
    <button
      type="button"
      {...control.probe}
      data-sound-toggle=""
      aria-pressed={muted}
      aria-label={translate(language, muted ? 'media.sound.unmute' : 'media.sound.mute')}
      onClick={(event) => {
        event.stopPropagation();
        control.onToggle();
      }}
      onPointerDown={stop}
      onPointerUp={stop}
      className="pointer-events-auto relative inline-grid shrink-0 place-items-center rounded-full after:absolute after:-inset-x-4 after:-top-2 after:-bottom-6 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4"
      style={{ color: 'inherit', outlineColor: 'currentColor' }}
    >
      {note}
    </button>
  );
}

/**
 * L'ANNONCE DU SON DE FOND (#9678, #9698) — miroir de `BackgroundSoundBadge`
 * (iOS) sur le réel, la carte de post et le lecteur de story, lue sur la scène
 * QUI JOUE (`announceBackgroundSound`). Sans fond, rien ; la piste originale
 * montre la note et une petite sinusoïde ; un emprunt à la bibliothèque montre
 * la note et son crédit sur UNE ligne, qui défile s'il dépasse (`marqueePlan`)
 * et reste statique, tronqué, sous mouvement réduit ou quand le son est coupé.
 *
 * Le son de fond ne se dit QU'ICI, hors de la scène (#9737).
 *
 * Le lecteur d'écran lit le texte UNE fois : la piste visible est `aria-hidden`
 * (sa copie de défilement comprise), et « — » se dit « Son de la bibliothèque ».
 */
export const BackgroundSoundCredit = memo(function BackgroundSoundCredit({
  document,
  sceneIndex = 0,
  language,
  surface,
  control,
  measure = domMeasure,
  reducedMotion = prefersReducedMotion,
}: {
  readonly document: CanvasDocument | null | undefined;
  readonly sceneIndex?: number;
  readonly language: InterfaceLanguage;
  readonly surface: keyof typeof SURFACES;
  readonly control?: SoundCreditControl | undefined;
  /** Injectables pour les témoins : la production mesure le DOM et lit `prefers-reduced-motion`. */
  readonly measure?: Measure;
  readonly reducedMotion?: () => boolean;
}) {
  const announcement = useMemo(
    () => (document === null || document === undefined ? null : announceBackgroundSound({ document, sceneIndex, language })),
    [document, sceneIndex, language],
  );
  const { tint, maxWidth, className } = SURFACES[surface];
  if (announcement === null || announcement.kind === 'none') return null;
  const muted = control?.muted === true;
  if (announcement.kind === 'original') {
    const name = translate(language, 'media.sound.original');
    return (
      <span
        data-sound-credit="original"
        {...(control === undefined ? { role: 'img', 'aria-label': name } : {})}
        className={`inline-flex shrink-0 items-center gap-1 ${className}`}
        style={{ color: tint }}
      >
        <SoundNote control={control} language={language} />
        {control === undefined ? null : <span className="sr-only">{name}</span>}
        <svg data-sound-wave="" aria-hidden="true" width="22" height="10" viewBox="0 0 22 10" fill="none" style={{ opacity: muted ? 0.55 : 1 }}>
          <path d="M1 5 Q3.5 0 6 5 T11 5 T16 5 T21 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <CreditMarquee
      text={announcement.text}
      language={language}
      tint={tint}
      maxWidth={maxWidth}
      className={className}
      control={control}
      measure={measure}
      reducedMotion={reducedMotion}
    />
  );
});

function CreditMarquee({
  text,
  language,
  tint,
  maxWidth,
  className,
  control,
  measure,
  reducedMotion,
}: {
  readonly text: string;
  readonly language: InterfaceLanguage;
  readonly tint: string;
  readonly maxWidth: number;
  readonly className: string;
  readonly control: SoundCreditControl | undefined;
  readonly measure: Measure;
  readonly reducedMotion: () => boolean;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [plan, setPlan] = useState<MarqueePlan>({ kind: 'static' });
  const scrolling = plan.kind === 'scroll';
  const muted = control?.muted === true;

  /* La largeur du TEXTE : immobile, c'est la piste tronquée qui la porte (son
     `scrollWidth`) ; en défilement, c'est la première copie de la rangée.
     Un son COUPÉ fige son crédit, comme le mouvement réduit. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = scrolling ? copyRef.current : trackRef.current;
    if (box === null || content === null) return undefined;
    const evaluate = () => {
      const next = marqueePlan({ ...measure({ box, content }), reducedMotion: muted || reducedMotion() });
      setPlan((current) => (samePlan(current, next) ? current : next));
    };
    evaluate();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(evaluate);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, measure, reducedMotion, scrolling, muted]);

  /* LE DÉFILEMENT (`AudioChipMarquee`, 28 px/s) — un cycle déplace d'une copie
     plus l'espace : la seconde copie arrive exactement où la première
     commençait. Vers la gauche, ou vers la droite en écriture de droite à gauche. */
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (plan.kind !== 'scroll' || track === null || typeof track.animate !== 'function') return undefined;
    const rtl = getComputedStyle(track).direction === 'rtl';
    const shift = rtl ? plan.shiftPx : -plan.shiftPx;
    const animation = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${shift}px)` }], {
      duration: plan.durationS * 1000,
      iterations: Infinity,
      easing: 'linear',
    });
    /* `cancel()` rejette `finished` : la promesse est attendue ici pour que
       l'arrêt voulu (démontage, nouveau texte) ne devienne pas un rejet orphelin. */
    animation.finished.catch(() => undefined);
    return () => animation.cancel();
  }, [plan]);

  const spoken = text === GENERIC_CREDIT ? translate(language, 'media.sound.library') : translate(language, 'media.sound.credit', { credit: text });

  return (
    <span
      data-sound-credit="credit"
      data-sound-marquee={plan.kind}
      {...(scrolling ? { 'data-sound-cycle': `${plan.shiftPx}px/${plan.durationS}s` } : {})}
      className={`flex min-w-0 items-center gap-1 text-check ${className}`}
      style={{ color: tint, maxWidth }}
    >
      <SoundNote control={control} language={language} />
      <span ref={boxRef} className="relative block min-w-0 flex-1 overflow-hidden whitespace-nowrap" style={{ opacity: muted ? 0.55 : 1 }}>
        <span className="sr-only">{spoken}</span>
        <span
          ref={trackRef}
          aria-hidden="true"
          data-sound-track=""
          className={scrolling ? 'inline-flex' : 'block truncate'}
          style={scrolling ? { gap: MARQUEE_GAP_PX } : undefined}
        >
          <span ref={copyRef} data-sound-copy="">
            {text}
          </span>
          {scrolling ? (
            <span data-sound-copy="" aria-hidden="true">
              {text}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}

function samePlan(a: MarqueePlan, b: MarqueePlan): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'static' || b.kind === 'static') return true;
  return a.shiftPx === b.shiftPx && a.durationS === b.durationS;
}

/** Chargé À LA DEMANDE par ses hôtes (`lazy`) : importé statiquement par trois
 * écrans, ce module devenait un nom de plus dans la table de préchargement de
 * l'entrée, donc un poids sur la première peinture de tout le monde. */
export default BackgroundSoundCredit;
