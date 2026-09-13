import { Glyph, GlyphSvg } from './glyph';
import { FLOATING_GLYPHS } from './glyphs-floating';
import type { MenuGlyph } from '@/lib/view/floating-menu';

/**
 * **LE TRACÉ D'UNE DESTINATION FLOTTANTE, RÉSOLU UNE FOIS** (#6104).
 *
 * Les huit destinations puisent dans DEUX jeux — quatre glyphes vivent déjà au
 * socle (`bell`, `phone`, `link-simple`, `user`), quatre voyagent avec le
 * chunk des menus (`stack`, `binoculars`, `users-three`, `gear`). Ce partage
 * n'est pas un accident d'écriture : dupliquer au jeu flottant les quatre du
 * socle ferait payer leurs octets DEUX FOIS au même démarrage.
 *
 * L'aiguillage entre les deux jeux est donc réel, et il vit ICI plutôt que
 * dans chacun de ses deux appelants — l'échelle et les huit écrans d'attente.
 * Écrit deux fois, il aurait suffi qu'un seul des deux oublie un jeu pour
 * qu'un glyphe disparaisse sur une moitié des surfaces.
 */
export function MenuGlyph({ glyph, size }: { readonly glyph: MenuGlyph; readonly size: number }) {
  return glyph.set === 'socle' ? (
    <Glyph name={glyph.name} size={size} />
  ) : (
    <GlyphSvg glyph={FLOATING_GLYPHS[glyph.name]} size={size} />
  );
}
