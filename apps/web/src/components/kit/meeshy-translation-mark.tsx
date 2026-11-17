import '@/styles/kit-translation-mark.css';
import '@/styles/kit-motion.css';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { memo } from 'react';

import { impact } from '@/lib/view/haptics';

import { MeeshyGlass, type MeeshyGlassTone } from './meeshy-glass-tone';
import {
  meeshyTranslationMarkRecipe,
  meeshyTranslationMarkStyle,
  meeshyTranslationMarkTexts,
  type MeeshyTranslationMarkDensity,
  type MeeshyTranslationMarkMode,
  type MeeshyTranslationMarkWords,
} from './meeshy-translation-mark-recipe';

export * from './meeshy-translation-mark-recipe';

export type MeeshyTranslationMarkProps = {
  readonly isShowingOriginal: boolean;
  readonly words: MeeshyTranslationMarkWords;
  readonly sourceLanguageName?: string | undefined;
  readonly originalLanguageName?: string | undefined;
  readonly onToggle?: (() => void) | undefined;
  readonly density?: MeeshyTranslationMarkDensity | undefined;
  readonly mode?: MeeshyTranslationMarkMode | undefined;
  readonly announcement?: string | undefined;
  readonly isPending?: boolean | undefined;
  readonly tint?: string | undefined;
  readonly tone?: MeeshyGlassTone | undefined;
  readonly onExplore?: (() => void) | undefined;
  readonly label?: string | undefined;
  readonly haptic?: 'selection' | 'none' | undefined;
  readonly glyph?: ReactNode;
  readonly caption?: ReactNode;
  readonly className?: string | undefined;
};

const TRANSLATE_GLYPH = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h7M5.5 2.5V4M3.5 4c.4 2.2 2 4.1 4.2 5M7.5 4c-.4 2.2-2.1 4.1-4.4 5M8.5 13.5l2.5-6 2.5 6M9.3 11.5h3.4" />
  </svg>
);

/**
 * La marque de traduction : trois densités (le glyphe seul devant un aperçu, la ligne
 * sous un texte, la légende de verre sur un média), trois modes (traduit, original,
 * annonce avant l'envoi). Aucun état : elle annonce ce que l'hôte rend, jamais autre
 * chose. Sans `onToggle`, elle informe et ne promet aucun geste (ni bouton, ni halte de
 * clavier, ni point). Seule l'opacité s'anime.
 */
export const MeeshyTranslationMark = memo(function MeeshyTranslationMark({
  isShowingOriginal,
  words,
  sourceLanguageName,
  originalLanguageName,
  onToggle,
  density = 'line',
  mode,
  announcement,
  isPending,
  tint,
  tone,
  onExplore,
  label,
  haptic = 'selection',
  glyph,
  caption,
  className,
}: MeeshyTranslationMarkProps) {
  const resolvedMode: MeeshyTranslationMarkMode = mode ?? (isShowingOriginal ? 'original' : 'translated');
  const recipe = meeshyTranslationMarkRecipe({ density, mode: resolvedMode, hasToggle: onToggle !== undefined, isPending });
  const texts = meeshyTranslationMarkTexts({ mode: resolvedMode, sourceLanguageName, originalLanguageName, words });
  const glyphNode = (
    <span className="kit-translation__glyph" data-kit-translation-glyph="" data-tone={recipe.glyphTone} aria-hidden="true">
      {glyph ?? TRANSLATE_GLYPH}
    </span>
  );
  const toggle = (): void => {
    if (onToggle === undefined || isPending === true) return;
    if (haptic !== 'none') impact('light');
    onToggle();
  };
  const explore = (event: MouseEvent<HTMLElement>): void => {
    if (onExplore === undefined) return;
    event.preventDefault();
    onExplore();
  };
  const exploreByKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (onExplore === undefined) return;
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      onExplore();
    }
  };
  const rootProps = {
    className: className === undefined ? 'kit-translation' : `kit-translation ${className}`,
    style: meeshyTranslationMarkStyle(recipe, tint),
    'data-kit-translation-mark': '',
    'data-density': density,
    'data-mode': resolvedMode,
    'data-enters': '',
  };

  if (density === 'icon') {
    return (
      <span {...rootProps} role="img" aria-label={label ?? texts.mention}>
        {glyphNode}
      </span>
    );
  }
  if (resolvedMode === 'announce') {
    return (
      <span {...rootProps}>
        {glyphNode}
        <span className="kit-translation__announce">{announcement}</span>
      </span>
    );
  }
  if (density === 'legend') {
    const content = (
      <>
        {glyphNode}
        <span className="kit-translation__caption">{caption}</span>
      </>
    );
    return (
      <span {...rootProps}>
        {onToggle === undefined ? (
          <MeeshyGlass as="span" tone={tone} className="kit-translation__legend" data-kit-translation-legend="">
            {content}
          </MeeshyGlass>
        ) : (
          <MeeshyGlass as="button" type="button" interactive tone={tone} className="kit-translation__legend" data-kit-translation-legend="" aria-pressed={isShowingOriginal} aria-label={label ?? texts.toggle} aria-disabled={isPending === true ? 'true' : undefined} onClick={toggle} onContextMenu={explore} onKeyDown={exploreByKey}>
            {content}
          </MeeshyGlass>
        )}
      </span>
    );
  }
  return (
    <span {...rootProps}>
      {glyphNode}
      <span className="kit-translation__mention" data-kit-translation-mention="">
        {texts.mention}
      </span>
      {recipe.showsSeparator ? (
        <span className="kit-translation__dot" data-kit-translation-dot="" aria-hidden="true">
          ·
        </span>
      ) : null}
      {recipe.showsToggle ? (
        <button
          type="button"
          className="kit-translation__toggle"
          aria-pressed={isShowingOriginal}
          aria-label={label}
          aria-disabled={isPending === true ? 'true' : undefined}
          onClick={toggle}
          onContextMenu={explore}
          onKeyDown={exploreByKey}
        >
          {texts.toggle}
        </button>
      ) : null}
    </span>
  );
});
