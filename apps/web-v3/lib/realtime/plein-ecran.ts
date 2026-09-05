/**
 * TOUTE SURIMPRESSION SERVIE, ÉLEVÉE EN MODALE — la SEULE chose que le
 * JavaScript y ajoute (§ 12.10.1, § 12.10.6). Généralisé depuis le plein écran
 * d'un média (issue #4835) au profil d'un participant (§ 12.10.3) : les DEUX
 * sont un `<dialog open data-retour>` RENDU PAR LE SERVEUR — `class="plein"`
 * ou `class="profil"`, peu importe — qui s'ouvre et se ferme par un `<a href>`,
 * donc marche ENTIER sans un octet de script. Une TROISIÈME surimpression
 * future n'a donc besoin d'AUCUNE ligne de plus ici : elle sert son propre
 * `<dialog open data-retour>`, et ce module l'élève déjà.
 *
 * Ce module ne compose AUCUNE balise et n'ouvre AUCUNE surimpression — il en
 * reprend une déjà servie et la passe en `showModal()`, ce qui donne
 * gratuitement les trois choses qu'un `open` seul n'a pas : le voile
 * (`::backdrop`), le piège à focus, et **Échap**.
 *
 * FERMER RESTE UN SEUL EFFET. Échap déclenche l'événement `close` du dialogue,
 * qui ne fait ici qu'une chose : suivre le MÊME lien que la croix
 * (`data-retour`, posé par le serveur). Sans quoi le lecteur resterait sur une
 * adresse `?media=`/`?profil=` dont plus rien ne serait affiché — un état
 * muet, la forme même du contrôle sans effet.
 *
 * IL EST APPELÉ AVANT toute lecture de configuration du module de
 * participation (`participate.ts`), parce qu'il ne dépend NI d'une créance, NI
 * d'un socket, NI d'un peintre : une surimpression doit se fermer à Échap même
 * sur un fil dont l'authentification a échoué.
 */
export const prendsLePleinEcran = (racine: ParentNode = document): void => {
  const dialogue = racine.querySelector<HTMLDialogElement>('dialog[open][data-retour]');
  if (dialogue === null || typeof dialogue.showModal !== 'function') return;

  const retour = dialogue.dataset.retour ?? '';
  // LE FOCUS DU LECTEUR SURVIT À L'ÉLÉVATION. `showModal()` pose le focus sur le
  // PREMIER focalisable du dialogue — la poignée « Fermer » —, et ce module
  // arrive APRÈS le premier pixel : un lecteur au clavier qui tenait déjà
  // « Se déconnecter » se retrouvait sur la poignée, et Entrée FERMAIT au lieu
  // de sortir (mesuré, `v3-deconnexion.spec.ts:51` : `/chats` au lieu de `/`).
  // On note ce qu'il tenait AVANT de toucher au dialogue et on le lui rend
  // après — seulement si c'était DANS le dialogue : hors de lui, le choix du
  // navigateur (le premier focalisable) est le bon.
  const tenu = dialogue.ownerDocument.activeElement;
  const tenuDansLeDialogue = tenu instanceof HTMLElement && dialogue.contains(tenu) ? tenu : null;
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
  tenuDansLeDialogue?.focus();

  dialogue.addEventListener('close', () => {
    // REMPLACE, jamais n'empile : fermer n'est pas naviguer. `assign` ajoutait
    // une entrée d'historique — Échap puis Retour rouvrait la surimpression.
    if (retour !== '') window.location.replace(retour);
  });
};
