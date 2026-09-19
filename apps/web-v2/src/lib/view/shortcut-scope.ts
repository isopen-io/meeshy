/**
 * **UNE FRAPPE ADRESSÉE À UN CONTRÔLE N'EST PAS UN RACCOURCI D'ÉCRAN.**
 *
 * Un écran plein cadre (le lecteur de stories, les Réels) écoute le clavier
 * sur `window` : c'est la seule portée où « Espace met en pause » et « les
 * flèches changent de story » ont un sens, personne n'ayant le focus au
 * repos. Mais `window` reçoit AUSSI, par bouillonnement, chaque touche
 * destinée au nœud qui a le focus — et un raccourci qui appelle
 * `preventDefault()` la lui VOLE.
 *
 * TROIS SYMPTÔMES MESURÉS AU NAVIGATEUR, UNE SEULE CAUSE (#7112, revue) —
 * le lecteur de stories, dont la feuille de commentaires porte une zone de
 * saisie depuis D-89 :
 *
 *  1. taper « a b c » dans le composeur de commentaire rendait « abc » — le
 *     raccourci « Espace = pause » consommait chaque espace ;
 *  2. une flèche pendant la frappe faisait AVANCER la story, ce qui ferme la
 *     feuille (`setCommentsOpen(false)` au changement de story) : le
 *     commentaire à moitié écrit partait avec ;
 *  3. Espace sur un bouton du rail qui a le focus ne l'activait PAS — le
 *     `click` d'un `<button>` naît du `keyup` d'Espace, qu'un
 *     `preventDefault()` de `keydown` supprime. Chaque bouton du lecteur
 *     n'était donc activable qu'à Entrée : un contrôle à moitié inerte, la
 *     forme d'inertie que la loi 4 du dépôt interdit, et celle qu'aucun
 *     témoin de DOM ne voit.
 *
 * **LA CESSION EST FINE, ET C'EST LE CŒUR DE LA LOI.** Une cession EN BLOC
 * — « un contrôle a le focus ⇒ l'écran se tait » — corrigerait les trois
 * symptômes et en fabriquerait un quatrième : cliquer le bouton « muet » le
 * FOCALISE (comportement natif du navigateur), et les flèches cesseraient
 * alors d'avancer la story jusqu'au prochain clic ailleurs. On rend donc
 * exactement ce que la cible RÉCLAME :
 *
 *  - une zone de SAISIE réclame TOUT (les lettres, l'espace, les flèches qui
 *    déplacent le curseur) ;
 *  - un contrôle d'ACTIVATION — bouton, lien — ne réclame que ses touches
 *    d'activation, Espace et Entrée. Les flèches ne lui servent à rien, et
 *    l'écran les garde.
 *
 * Échap n'entre pas dans cette loi : il appartient à l'appelant, qui le
 * traite AVANT (fermer depuis un champ reste juste), et la couche qui veut
 * le garder l'intercepte en phase de CAPTURE (`story-comments-sheet.tsx`).
 */

/**
 * Ce qui réclame TOUTE touche : les zones de saisie. `[contenteditable]` est
 * énuméré par ses valeurs VRAIES plutôt qu'en présence d'attribut —
 * `contenteditable="false"` est un nœud ordinaire, et un sélecteur de
 * présence l'aurait compté.
 */
const CLAIMS_EVERY_KEY = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
].join(',');

/** Ce qui ne réclame que ses touches d'ACTIVATION. */
const CLAIMS_ACTIVATION_KEYS = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
].join(',');

/** Les DEUX touches dont un contrôle natif tire son `click`. */
const ACTIVATION_KEYS: ReadonlySet<string> = new Set([' ', 'Enter']);

/**
 * Le nœud visé par cet événement réclame-t-il CETTE touche ? `true` ⇒
 * l'écran RENONCE à son raccourci pour cette frappe.
 *
 * La remontée se fait par `closest()`, jamais par la seule balise : le focus
 * vit bien sur le contrôle, mais un `composedPath` ou un nœud intermédiaire
 * peut désigner un descendant — le glyphe d'un bouton n'est pas une surface
 * neutre.
 */
export function shortcutYieldsToTarget({
  target,
  key,
}: {
  readonly target: EventTarget | null;
  readonly key: string;
}): boolean {
  if (target === null || !(target instanceof Element)) return false;
  if (target.closest(CLAIMS_EVERY_KEY) !== null) return true;
  return ACTIVATION_KEYS.has(key) && target.closest(CLAIMS_ACTIVATION_KEYS) !== null;
}
