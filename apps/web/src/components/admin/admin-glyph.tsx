import type { CSSProperties } from 'react';

import { ADMIN_GLYPHS, type AdminGlyphName } from '@/components/glyphs-admin';
import { GlyphSvg } from '@/components/glyph';

export type { AdminGlyphName };

/**
 * UN GLYPHE DU JEU D'ÉCRAN D'ADMINISTRATION (#8876), par son nom. Même rendu et
 * mêmes règles d'accessibilité que `Glyph` (décoratif par défaut ; `title`
 * en fait le nom accessible d'un glyphe seul) — `GlyphSvg` est le site unique
 * du `<svg>`.
 */
export function AdminGlyph({
  name,
  size = 18,
  title,
  className,
  style,
}: {
  readonly name: AdminGlyphName;
  readonly size?: number;
  readonly title?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <GlyphSvg
      glyph={ADMIN_GLYPHS[name]}
      size={size}
      {...(title === undefined ? {} : { title })}
      {...(className === undefined ? {} : { className })}
      {...(style === undefined ? {} : { style })}
    />
  );
}
