import { glyphesCritiques } from '@/app/sprite-critique';
import { lisLActif, memo } from '@/lib/actifs';

/**
 * Les icônes d'un écran RENDU PAR UNE PAGE — et pourquoi elles ne se servent pas
 * comme celles du gestionnaire de route.
 *
 * TROIS FAITS QUI SE TIENNENT
 *
 *   1. Un `<use href="#ph-…">` ne résout QUE dans le document courant. La
 *      coquille racine (`app/layout.tsx`) y pose déjà le sous-sprite CRITIQUE —
 *      les huit glyphes que `packages/icons/critique.json` justifie un par un.
 *      Tout `<use>` d'un de ces huit fonctionne donc partout, sans un octet de
 *      plus.
 *   2. Le sprite COMPLET est servi en externe (§ 8.5), et un `<use>` vers un
 *      document externe n'est honoré ni par Chrome ni par Safari : le référencer
 *      rendrait un trou, silencieusement, sur les deux moteurs qui portent le
 *      rôle premier. C'est exactement la « défaillance silencieuse d'un sprite »
 *      que le § 8.5 fait mesurer.
 *   3. Le § 8.3 gate `/chats/:key` à quatre requêtes avant le premier pixel.
 *
 * D'où la forme retenue : un écran DÉCLARE les glyphes qu'il rend, et
 * `SpriteDeLEcran` inline ceux que la coquille ne porte pas déjà — une seule
 * fois, quel que soit le nombre d'occurrences, aucune requête, aucun tracé
 * recopié à la main. Les symboles viennent de l'actif COMMITÉ
 * (`packages/icons/sprite.svg`), dont `scripts/build-sprite.ts` reste le seul
 * producteur : ce module ne dessine rien.
 *
 * IL NE REDÉCLARE PAS CE QUE LA COQUILLE PORTE
 *
 * Deux `<symbol>` de même `id` dans un document : le premier gagne, le second
 * est du poids mort — et le jour où l'un des deux change, l'écran rend l'ancien.
 * `glyphesCritiques()` est lu sur l'ACTIF, jamais déclaré ici, donc la frontière
 * suit le fichier plutôt qu'une liste à tenir.
 */

const SYMBOLE = (nom: string): RegExp =>
  new RegExp(`<symbol id="${nom}"[^>]*>[\\s\\S]*?</symbol>`);

const sprite = memo((): string => lisLActif('icons', 'sprite.svg'));

/** Un symbole absent rend la chaîne vide : un glyphe manquant dégrade, une exception supprime. */
const symbole = (nom: string): string => SYMBOLE(nom).exec(sprite())?.[0] ?? '';

export const symbolesAInliner = (glyphes: readonly string[]): readonly string[] => {
  const deLaCoquille = new Set(glyphesCritiques());
  return [...new Set(glyphes)].filter((nom) => !deLaCoquille.has(nom));
};

export function SpriteDeLEcran({ glyphes }: { readonly glyphes: readonly string[] }) {
  const contenu = symbolesAInliner(glyphes).map(symbole).join('');

  return contenu === '' ? null : (
    <svg aria-hidden="true" style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: contenu }} />
  );
}

/**
 * `Icone` vit dans `components/ui/icone.tsx`, et ce fichier ne la RÉ-EXPORTE
 * pas : ce module lit l'actif par `node:fs`, donc tout import depuis un
 * composant `'use client'` tirerait `node:fs` dans le graphe du navigateur. Un
 * barrel aimable rouvrirait exactement le défaut que la séparation ferme.
 */
