/**
 * Discrimination clic simple / clic modifié pour les affordances de profil
 * (auteur du fil Focal, avatar DM du rang Lentille — directive produit du
 * 2026-08-17, « le profil s'ouvre en modale »).
 *
 * Les deux affordances restent de VRAIS `<Link href="/u/{…}">` : la modale
 * n'intercepte QUE le clic gauche simple (`preventDefault` + ouverture de la
 * modale) ; ⌘/Ctrl/Maj/Alt-clic et le clic molette traversent intacts vers le
 * navigateur, qui ouvre un nouvel onglet — c'est la forme la plus accessible
 * (le lien reste un lien : atteignable au clavier, contexte "ouvrir dans un
 * nouvel onglet" du clic droit natif, `<a>` sémantique pour un lecteur
 * d'écran) plutôt qu'un `<button>` qui ferait perdre ces trois choses.
 *
 * UNE SEULE loi partagée par les deux affordances — jamais deux
 * implémentations qui pourraient diverger sur un modificateur oublié.
 */
export function isPlainLeftClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
