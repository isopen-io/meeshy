import type { CSSProperties } from 'react';

import { GLYPHS, type GlyphName } from './glyphs';

/** La forme d'un tracé — celle que `scripts/extract-glyphs.mjs` émet, pour le socle comme pour un jeu d'écran. */
export type GlyphShape = { readonly viewBox: string; readonly body: string };

type GlyphProps = {
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
};

/**
 * Un tracé INLINE, quel que soit le jeu dont il vient.
 *
 * `aria-hidden` par defaut : un glyphe qui accompagne un libelle visible est
 * decoratif, et le nommer une seconde fois fait lire deux fois la meme chose
 * au lecteur d'ecran. Un glyphe SEUL (un bouton sans texte) doit recevoir un
 * `title`, qui devient alors son nom accessible.
 *
 * `Glyph` (ci-dessous) le sert depuis le SOCLE (`glyphs.ts`) ; un écran qui
 * porte son propre jeu — `glyphs-progression.ts`, chargé avec sa route et
 * jamais avant le premier pixel (#5547) — le monte directement, avec le même
 * rendu et les mêmes règles d'accessibilité : une seule écriture du `<svg>`.
 */
export function GlyphSvg({ glyph, size = 24, className, title, style }: GlyphProps & { glyph: GlyphShape }) {
  return (
    <svg
      viewBox={glyph.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: glyph.body }}
    />
  );
}

/** Un glyphe du SOCLE, par son nom. */
export function Glyph({ name, ...rest }: GlyphProps & { name: GlyphName }) {
  return <GlyphSvg glyph={GLYPHS[name]} {...rest} />;
}
