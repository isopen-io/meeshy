import { BrandMark } from './brand-mark';
import { Glyph, GlyphSvg } from './glyph';
import { FLOATING_GLYPHS } from './glyphs-floating';
import type { MenuGlyph } from '@/lib/view/floating-menu';

/**
 * **LE TRACÉ D'UNE DESTINATION FLOTTANTE, RÉSOLU UNE FOIS** (#6104).
 *
 * Les destinations puisent dans TROIS jeux — quatre glyphes vivent déjà au
 * socle (`bell`, `phone`, `link-simple`, `user`), quatre voyagent avec le
 * chunk des menus (`stack`, `binoculars`, `users-three`, `gear`), et le retour
 * aux conversations porte la MARQUE (#6456). Ce partage n'est pas un accident
 * d'écriture : dupliquer au jeu flottant les quatre du socle ferait payer leurs
 * octets DEUX FOIS au même démarrage.
 *
 * L'aiguillage entre les jeux est donc réel, et il vit ICI plutôt que chez
 * chacun de ses appelants. Écrit deux fois, il aurait suffi qu'un seul oublie
 * un jeu pour qu'un glyphe disparaisse sur une moitié des surfaces.
 */

/**
 * La marque dans un disque de 52 : `AnimatedLogoView(lineWidth: 3)` dans un
 * cadre de `MeeshySpacing.xxl + MeeshySpacing.xs` (28) — `RootView.swift:1623`.
 * La cote vient d'iOS, pas du `size` des glyphes, dont le tracé ne remplit pas
 * son carré de la même façon.
 */
const MARQUE = { size: 28, lineWidth: 3 } as const;

export function MenuGlyph({ glyph, size }: { readonly glyph: MenuGlyph; readonly size: number }) {
  switch (glyph.set) {
    case 'socle':
      return <Glyph name={glyph.name} size={size} />;
    case 'flottant':
      return <GlyphSvg glyph={FLOATING_GLYPHS[glyph.name]} size={size} />;
    case 'marque':
      return <BrandMark size={MARQUE.size} lineWidth={MARQUE.lineWidth} />;
  }
}
