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
 *  1. taper « a b » dans le composeur de commentaire rendait « ab » — le
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
 * **La loi est donc une question de POSSESSION, pas une liste de touches** :
 * le nœud qui a le focus revendique-t-il des touches ? Écrite ainsi, elle
 * vaut pour les trois symptômes et pour ceux qu'un écran futur apportera —
 * une liste de touches à exclure aurait dû grandir à chaque champ ajouté,
 * et c'est exactement ce qui n'arrive jamais.
 *
 * Le cas NOMINAL rend `false` : au repos le focus est sur `<body>`, la touche
 * appartient à l'écran. Échap fait exception chez l'appelant — il ferme, et
 * fermer depuis un champ reste juste ; la feuille qui veut le garder
 * l'intercepte en phase de CAPTURE (`story-comments-sheet.tsx`).
 */

/**
 * Ce qui REVENDIQUE une touche : les contrôles de formulaire, les liens, les
 * régions éditables, et leurs équivalents ARIA. `[contenteditable]` est
 * énuméré par ses DEUX valeurs vraies plutôt qu'en présence d'attribut :
 * `contenteditable="false"` est un nœud ordinaire, et un sélecteur de
 * présence l'aurait compté.
 */
const CLAIMS_KEYS = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
].join(',');

/**
 * Le nœud visé par cet événement revendique-t-il la touche ? `true` ⇒
 * l'écran RENONCE à son raccourci pour cette frappe.
 *
 * La remontée se fait par `closest()`, jamais par la seule balise : le focus
 * vit bien sur le contrôle, mais un `composedPath` ou un nœud de texte peut
 * désigner un descendant — le glyphe d'un bouton n'est pas une surface
 * neutre.
 */
export function shortcutYieldsToTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false;
  return target.closest(CLAIMS_KEYS) !== null;
}
