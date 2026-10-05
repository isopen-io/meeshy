import { GlyphSvg, type GlyphShape } from './glyph';
import { GLYPHS } from './glyphs';

/**
 * LE PICTOGRAMME DE LA FLAMME-ŒIL (#8304) — « une flamme avec un œil »
 * (directive porteur 2026-09-27), la forme qu'iOS dessine pour le même choix.
 *
 * Phosphor n'a pas de pendant : le tracé est COMPOSÉ, jamais recopié — la
 * flamme pleine du socle (`GLYPHS.flameFill`, projection de
 * `@phosphor-icons/core`) reçoit un œil en amande et sa pupille, dans UN seul
 * `<path>` en `evenodd` : l'amande perce la flamme, la pupille la rebouche.
 * L'œil se pose dans le haut de la flamme, au-dessus de la languette intérieure
 * que le tracé d'origine découpe déjà — aucune des deux découpes ne touche
 * l'autre.
 */
const FLAME_FILL_PATH = /d="([^"]+)"/.exec(GLYPHS.flameFill.body)?.[1] ?? '';

const EYE_OUTLINE = 'M84,94 Q128,54 172,94 Q128,134 84,94 Z';
const EYE_PUPIL = 'M142,94 A14,14 0 1 1 114,94 A14,14 0 1 1 142,94 Z';

export const FLAME_EYE_GLYPH: GlyphShape = {
  viewBox: GLYPHS.flameFill.viewBox,
  body: `<path fill-rule="evenodd" d="${FLAME_FILL_PATH} ${EYE_OUTLINE} ${EYE_PUPIL}"/>`,
};

export function FlameEyeGlyph({ size = 16, title }: { readonly size?: number; readonly title?: string }) {
  return <GlyphSvg glyph={FLAME_EYE_GLYPH} size={size} {...(title === undefined ? {} : { title })} />;
}
