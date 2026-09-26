/**
 * « CRÉER AVEC CE MÉDIA » (#6303) — le passage de main entre la visionneuse et
 * le studio (`/stories/new`). Miroir de `onComposeWithMedia` (iOS) : la pièce
 * regardée devient le FOND de la page courante, exactement comme si l'auteur
 * l'avait choisie par la porte « visuel » (`place('visual', file)`) — montée,
 * cadrage et publication suivent le chemin ordinaire.
 *
 * Un fichier, pas une adresse : le studio ne publie que ce qu'il a lui-même
 * téléversé (`uploadPostMedia`), et une adresse de pièce jointe n'est pas un
 * média de publication. La graine se prend UNE fois : un retour arrière vers
 * le studio ne la repose pas.
 */
let pending: File | null = null;

export function offerStudioSeed(file: File): void {
  pending = file;
}

export function takeStudioSeed(): File | null {
  const seed = pending;
  pending = null;
  return seed;
}
