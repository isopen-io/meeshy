/**
 * UN DÉFILEMENT QUE L'APPLICATION FAIT N'EST PAS UN GESTE (#7242).
 *
 * Le dépôt nomme déjà cette distinction : chaque appelant de `pinToBottom`
 * passe `onFirstFrame: noteProgrammaticScroll` pour que son écriture ne
 * RÉVÈLE pas le chrome comme le ferait un geste (`reading-mode/scene.ts`).
 * Mais ce signal-là ne parle qu'au réducteur de la scène ; rien ne le dit
 * aux autres surfaces qui écoutent `scroll` — et le menu d'un message en
 * écoute un, `document`-level et en CAPTURE (`roving-menu.ts:160`).
 *
 * Conséquence mesurée au navigateur sur `/c/c-deploiement` (gate
 * `check-thread-states.mjs` § 6.2, rouge sous charge) : menu ouvert, un
 * correspondant se met à écrire, la cellule de frappe s'ajoute au fil
 * (`use-thread-typing.ts`), le fil grandit de 30 px, l'ancrage bas écrit
 * `scrollTop` — et le `scroll` natif qui suit démonte le portail, treize
 * millisecondes après son ouverture. Le lecteur visait une entrée.
 *
 * LA DÉCLARATION EST LA POSITION ÉCRITE, PAS UNE FENÊTRE DE TEMPS. On retient
 * le `scrollTop` que le navigateur a RETENU (relu après l'écriture, donc déjà
 * clampé) : le `scroll` qui arrive ensuite sur ce défileur, à cette position,
 * est le nôtre. Aucun délai (leçon 590), aucune horloge de plus — donc aucune
 * image supplémentaire demandée à l'appelant, et rien à nettoyer si le
 * navigateur n'émet finalement aucun événement (une écriture qui ne déplace
 * rien n'en émet pas).
 *
 * ET LA DÉCLARATION SE CONSOMME : un seul `scroll` par écriture. Sans cela,
 * un défileur marqué une fois deviendrait sourd pour toujours — le menu ne se
 * fermerait plus jamais sur le geste d'après, ce qui est le défaut inverse.
 */

/** Ce que l'application a écrit, par défileur — jamais une clé qui survit à
 * son élément (`WeakMap`, pas d'attribut posé dans le DOM). */
const written = new WeakMap<EventTarget, number>();

/** Déclare l'écriture qui vient d'avoir lieu. `top` est la position RELUE. */
export function markProgrammaticScroll(element: EventTarget, top: number): void {
  written.set(element, top);
}

/**
 * `true` si le `scroll` dont `target` est la cible vient de l'application.
 * L'appel CONSOMME la déclaration : le geste suivant compte de nouveau.
 */
export function isProgrammaticScroll(target: EventTarget | null): boolean {
  if (target === null) return false;
  const declared = written.get(target);
  if (declared === undefined) return false;
  written.delete(target);
  const current = (target as { scrollTop?: number }).scrollTop;
  return typeof current === 'number' && Math.abs(current - declared) < 1;
}
