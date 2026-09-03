/**
 * LE PLEIN ÉCRAN, ÉLEVÉ EN MODALE — la SEULE chose que le JavaScript ajoute à
 * la surimpression (§ 12.10.1, § 12.10.6).
 *
 * Le `<dialog class="plein" open>` est RENDU PAR LE SERVEUR (`app/connecte/
 * plein-vue.ts`) : il s'ouvre et se ferme par un `<a href>`, donc il marche
 * entier sans un octet de script. Ce module ne compose AUCUNE balise et
 * n'ouvre AUCUNE surimpression — il en reprend une déjà servie et la passe en
 * `showModal()`, ce qui donne gratuitement les trois choses qu'un `open` seul
 * n'a pas : le voile (`::backdrop`), le piège à focus, et **Échap**.
 *
 * FERMER RESTE UN SEUL EFFET. Échap déclenche l'événement `close` du dialogue,
 * qui ne fait ici qu'une chose : suivre le MÊME lien que la croix
 * (`data-retour`, posé par le serveur). Sans quoi le lecteur resterait sur une
 * adresse `?media=` dont plus rien ne serait affiché — un état muet, la forme
 * même du contrôle sans effet.
 *
 * IL EST APPELÉ AVANT toute lecture de configuration du module de
 * participation (`participate.ts`), parce qu'il ne dépend NI d'une créance, NI
 * d'un socket, NI d'un peintre : une surimpression doit se fermer à Échap même
 * sur un fil dont l'authentification a échoué.
 */
export const prendsLePleinEcran = (racine: ParentNode = document): void => {
  const dialogue = racine.querySelector<HTMLDialogElement>('dialog.plein[open]');
  if (dialogue === null || typeof dialogue.showModal !== 'function') return;

  const retour = dialogue.dataset.retour ?? '';
  // `showModal()` REFUSE un dialogue qui porte déjà `open` (`InvalidStateError`) :
  // on RETIRE l'attribut avant de le rouvrir en modale — jamais `close()`, qui
  // ÉMET l'événement `close` dans une tâche différée. Mesuré : cette tâche
  // arrivait APRÈS l'écouteur posé douze lignes plus bas, qui suivait alors le
  // lien de retour — la surimpression se fermait toute seule à l'arrivée du
  // module, et le lecteur retombait sur le fil sans avoir rien touché.
  dialogue.removeAttribute('open');
  try {
    dialogue.showModal();
  } catch {
    // Un navigateur sans dialogue modal garde la surimpression telle qu'elle
    // était servie — sans Échap, mais entière.
    dialogue.setAttribute('open', '');
    return;
  }

  dialogue.addEventListener('close', () => {
    // REMPLACE, jamais n'empile : fermer n'est pas naviguer. `assign` ajoutait
    // une entrée d'historique — Échap puis Retour rouvrait la surimpression.
    if (retour !== '') window.location.replace(retour);
  });
};
