import type { CSSProperties } from 'react';

import { GLYPHS, type GlyphName } from './glyphs';

/**
 * Un glyphe du sprite du depot, INLINE.
 *
 * `aria-hidden` par defaut : un glyphe qui accompagne un libelle visible est
 * decoratif, et le nommer une seconde fois fait lire deux fois la meme chose
 * au lecteur d'ecran. Un glyphe SEUL (un bouton sans texte) doit recevoir un
 * `titre`, qui devient alors son nom accessible.
 */
export function Glyph({
  name,
  size = 24,
  className,
  title,
  style,
}: {
  name: GlyphName;
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const glyph = GLYPHS[name];
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
