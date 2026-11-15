/**
 * CE QUI, D'UN ÉCRAN D'ACCÈS, VIT HORS DE SA COLONNE (#6643).
 *
 * La géométrie — centrée, jamais plus large que la connexion — se MESURE dans
 * un navigateur (`scripts/check-access-column.mjs`) : un DOM sans mise en page
 * ne connaît aucune largeur. Ce qu'il sait dire, c'est la moitié STRUCTURELLE
 * du contrat : l'écran monte UNE colonne d'accès, et tout ce qui se lit ou se
 * touche y vit — la puce « Fermer » comprise, que la décision D-72 range dans
 * la colonne plutôt qu'au bord de l'écran.
 *
 * Rend la liste de ce qui déborde, lisible dans un échec ; une liste vide
 * signifie « tout tient ».
 */
const PERCEIVABLE = 'a, button, input, select, textarea, h1, h2, p, label, [role="timer"], [role="status"], [role="alert"]';

export function strayFromAuthColumn(root: ParentNode): readonly string[] {
  const columns = [...root.querySelectorAll('[data-auth-column]')];
  const [column] = columns;
  if (columns.length !== 1 || column === undefined) return [`${columns.length} colonne(s) d’accès au lieu d’une`];
  return [...root.querySelectorAll(PERCEIVABLE)]
    .filter((el) => !column.contains(el))
    .map((el) => `${el.tagName.toLowerCase()} « ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 48)} »`);
}

/** La colonne elle-même, pour y chercher un élément précis. */
export function authColumnIn(root: ParentNode): Element | null {
  return root.querySelector('[data-auth-column]');
}
