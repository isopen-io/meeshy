/**
 * LE BANDEAU DIFFÉRÉ — CÔTÉ CLIENT (§ 12.4). Un module de participation ne
 * CRÉE jamais le nœud : il révèle celui que la vue a déjà SERVI caché
 * (`app/connecte/bandeau-vue.ts`, doc-comment de tête — « une région de
 * statut créée après coup n'est annoncée par aucun lecteur d'écran »). Site
 * UNIQUE du geste `hidden = !visible` : extrait de `participate.ts`, où il
 * vivait seul, pour que tout module qui a besoin du MÊME bandeau — le fil et
 * désormais `prefs.ts` — l'appelle plutôt que d'écrire sa propre bascule de
 * visibilité, qui aurait divergé du jour où l'une des deux aurait changé de
 * mécanisme (classe CSS au lieu de l'attribut, par exemple).
 */
export const montreLeBandeau = (racine: ParentNode, identifiant: string, visible: boolean): void => {
  const noeud = racine.querySelector<HTMLElement>(`#${identifiant}`);
  if (noeud !== null) noeud.hidden = !visible;
};
