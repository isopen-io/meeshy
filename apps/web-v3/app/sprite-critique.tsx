import { lisLActif, memo } from '@/lib/actifs';

/**
 * Le sous-sprite CRITIQUE, inliné dans la coquille racine (conception § 8.5).
 *
 * POURQUOI INLINE, ALORS QUE LE SPRITE EST SERVI EN EXTERNE
 *
 * Le § 8.5 sert les 72 glyphes en une requête à cache immuable — et le § 8.3
 * gate `/l/:token/expired` à DEUX requêtes, le document et sa feuille. Les deux
 * ne se tiennent que par le sous-sprite : les glyphes rendus au-dessus de la
 * ligne de flottaison voyagent DANS le document, le reste attend le fichier.
 * `packages/icons/critique.json` dit lesquels et POURQUOI, glyphe par glyphe ;
 * ce module n'en choisit aucun et n'en recopie aucun tracé — il inline l'actif
 * commité, dont `scripts/build-sprite.ts` est le seul producteur.
 *
 * POURQUOI DANS LA COQUILLE, ET PAS DANS L'ÉCRAN QUI EN A BESOIN
 *
 * Un `<use href="#ph-…">` sans hôte ne résout que dans le DOCUMENT courant : un
 * écran qui inlinerait lui-même son glyphe rendrait le suivant muet, ou
 * obligerait chaque écran à porter sa propre copie. La coquille est le seul
 * endroit d'où les huit glyphes atteignent toutes les pages — c'est ce que
 * `critique.json` appelle « L0 pose le layout ».
 *
 * CE QUE LE FRAGMENT DOIT ÊTRE, ET CE QU'IL NE DOIT PAS ÊTRE
 *
 * Invisible (`display:none`) et muet (`aria-hidden`). Un sprite qui s'annonce
 * fait lire « image » huit fois à un lecteur d'écran, sur CHAQUE page — un
 * défaut d'accessibilité posé une fois et servi partout, exactement le genre que
 * la dimension 5 traque. L'actif porte déjà les deux attributs ; ce module les
 * repose sur l'élément qu'il rend, parce que seul l'INTÉRIEUR du fichier est
 * inliné (un document n'a qu'une racine, et c'est `<html>`).
 */

const ACTIF = 'icons';

const INTERIEUR = /<svg\b[^>]*>([\s\S]*)<\/svg>/;

const symboles = memo((): string => INTERIEUR.exec(lisLActif(ACTIF, 'critical.svg'))?.[1] ?? '');

const NOM = /<symbol id="([^"]+)"/g;

/** Ce que le fragment PORTE réellement — lu sur l'actif, jamais déclaré ici. */
export const glyphesCritiques = (): readonly string[] =>
  [...symboles().matchAll(NOM)].map(([, nom]) => nom ?? '').sort();

export function SpriteCritique() {
  return (
    <svg
      aria-hidden="true"
      style={{ display: 'none' }}
      dangerouslySetInnerHTML={{ __html: symboles() }}
    />
  );
}
