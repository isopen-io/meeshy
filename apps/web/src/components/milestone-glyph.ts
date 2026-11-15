import type { MilestoneGlyph } from '@/lib/notifications/row-presentation';

import type { GlyphShape } from './glyph';
import { GLYPHS } from './glyphs';
import { PROGRESSION_GLYPHS } from './glyphs-progression';

/**
 * **L'ICÔNE D'UN PALIER** — UNE table pour l'écran « Progression » et pour la
 * ligne de notification d'un badge (#8727, miroir d'`EngagementAxisKey.symbolName`
 * iOS, #8724) : « même mot, même icône » (dimension 6). Les glyphes viennent des
 * DEUX jeux — celui de l'écran (`star`, `fire`, les axes) et le socle (`user`,
 * `smiley`, `microphone`, `trophy`).
 */
export function milestoneGlyph(name: MilestoneGlyph): GlyphShape {
  return name in PROGRESSION_GLYPHS ? PROGRESSION_GLYPHS[name as keyof typeof PROGRESSION_GLYPHS] : GLYPHS[name as keyof typeof GLYPHS];
}
