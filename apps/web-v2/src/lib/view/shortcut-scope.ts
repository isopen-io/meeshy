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

/**
 * **UNE COUCHE DE SAISIE RÉCLAME LE GESTE COMME ELLE RÉCLAME LA TOUCHE**
 * (#7112, revue) — la loi ci-dessus, écrite pour le clavier, avait une
 * porte JUMELLE laissée ouverte : le POINTEUR.
 *
 * Le symptôme, mesuré au navigateur sur le `dist/` servi : la feuille de
 * commentaires du lecteur de stories n'occupe que le bas de l'écran ; les
 * ~550 px de scène NUE au-dessus gardaient leurs trois bandes de geste
 * vivantes. Un tap sur un bord y vaut « reprendre » (`decideTouchDown`,
 * `lib/stories/gesture.ts`), la lecture repartait SOUS la feuille, la
 * diapositive suivante arrivait, `setCommentsOpen(false)` fermait le fil —
 * et le commentaire à moitié écrit partait avec. C'est le symptôme 2 de
 * D-91 (« une flèche pendant la frappe détruit le brouillon ») survivant
 * par l'autre entrée : la cession avait été écrite pour les touches, jamais
 * pour le doigt.
 *
 * **LA LOI EST DONC ÉNONCÉE UNE FOIS, ICI, POUR LES DEUX ENTRÉES**, plutôt
 * que deux gardes jumelles qui divergeraient au prochain écran — c'est
 * exactement la forme de dette que le dépôt paie sur les trois familles de
 * résolveurs du Prisme.
 *
 * Deux motifs de cession, et le second n'est pas une commodité :
 *
 *  1. `layerOpen` — une couche de saisie est OUVERTE. Le geste de l'écran se
 *     tait PARTOUT, y compris loin de la couche : l'utilisateur écrit, et ce
 *     que l'écran ferait de son geste (avancer, reprendre) détruirait ce
 *     qu'il écrit. C'est une cession d'ÉTAT, pas de position.
 *  2. `[data-claims-gesture]` — la cible est DANS une couche qui réclame le
 *     geste. Une couche qui se protège aujourd'hui par
 *     `stopPropagation()` sur ses propres gestionnaires le fait bien, mais
 *     cette protection est INVISIBLE à l'hôte : la deuxième couche posée un
 *     jour sur la même scène oubliera l'appel, et rien ne rougira. La
 *     remontée par `closest()` rend la règle lisible depuis l'hôte, qui est
 *     le seul à savoir ce que son geste FAIT.
 */
export const CLAIMS_GESTURE_ATTRIBUTE = 'data-claims-gesture';

export function screenGestureYields({
  target,
  layerOpen,
}: {
  readonly target: EventTarget | null;
  readonly layerOpen: boolean;
}): boolean {
  if (layerOpen) return true;
  if (target === null || !(target instanceof Element)) return false;
  return target.closest(`[${CLAIMS_GESTURE_ATTRIBUTE}]`) !== null;
}
