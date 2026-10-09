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

/**
 * L'ANNONCE DU SON DE FOND (#9678) — miroir de `BackgroundSoundBadge` (iOS) sur
 * le réel, la carte de post et le lecteur de story, lue sur la scène QUI JOUE
 * (`announceBackgroundSound`). Sans fond, rien ; la piste originale montre la
 * note et une petite sinusoïde ; un emprunt à la bibliothèque montre son crédit
 * sur UNE ligne, qui défile s'il dépasse (`marqueePlan`) et reste statique,
 * tronqué, sous mouvement réduit.
 *
 * Le lecteur d'écran lit le texte UNE fois : la piste visible est `aria-hidden`
 * (sa copie de défilement comprise), et « ♫ — » se dit « Son de la bibliothèque ».
 */
export const BackgroundSoundCredit = memo(function BackgroundSoundCredit({
  document,
  sceneIndex = 0,
  language,
  surface,
  measure = domMeasure,
  reducedMotion = prefersReducedMotion,
}: {
  readonly document: CanvasDocument | null | undefined;
  readonly sceneIndex?: number;
  readonly language: InterfaceLanguage;
  readonly surface: keyof typeof SURFACES;
  /** Injectables pour les témoins : la production mesure le DOM et lit `prefers-reduced-motion`. */
  readonly measure?: Measure;
  readonly reducedMotion?: () => boolean;
}) {
  const announcement = useMemo(
    () => (document === null || document === undefined ? null : announceBackgroundSound({ document, sceneIndex })),
    [document, sceneIndex],
  );
  const { tint, maxWidth, className } = SURFACES[surface];
  if (announcement === null || announcement.kind === 'none') return null;
  if (announcement.kind === 'original') {
    return (
      <span
        data-sound-credit="original"
        role="img"
        aria-label={translate(language, 'media.sound.original')}
        className={`inline-flex shrink-0 items-center gap-1 ${className}`}
        style={{ color: tint }}
      >
        <GlyphSvg glyph={FEED_GLYPHS.musicNote} size={12} />
        <svg data-sound-wave="" aria-hidden="true" width="22" height="10" viewBox="0 0 22 10" fill="none">
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
  measure,
  reducedMotion,
}: {
  readonly text: string;
  readonly language: InterfaceLanguage;
  readonly tint: string;
  readonly maxWidth: number;
  readonly className: string;
  readonly measure: Measure;
  readonly reducedMotion: () => boolean;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [plan, setPlan] = useState<MarqueePlan>({ kind: 'static' });
  const scrolling = plan.kind === 'scroll';

  /* La largeur du TEXTE : immobile, c'est la piste tronquée qui la porte (son
     `scrollWidth`) ; en défilement, c'est la première copie de la rangée. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = scrolling ? copyRef.current : trackRef.current;
    if (box === null || content === null) return undefined;
    const evaluate = () => {
      const next = marqueePlan({ ...measure({ box, content }), reducedMotion: reducedMotion() });
      setPlan((current) => (samePlan(current, next) ? current : next));
    };
    evaluate();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(evaluate);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, measure, reducedMotion, scrolling]);

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
      ref={boxRef}
      data-sound-credit="credit"
      data-sound-marquee={plan.kind}
      {...(scrolling ? { 'data-sound-cycle': `${plan.shiftPx}px/${plan.durationS}s` } : {})}
      className={`relative block min-w-0 overflow-hidden whitespace-nowrap text-check ${className}`}
      style={{ color: tint, maxWidth }}
    >
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
