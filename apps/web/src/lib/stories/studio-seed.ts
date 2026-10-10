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
 *
 * **« MODIFIER AVANT DE PUBLIER »** (#9286) — un partage entrant (autre
 * application → Meeshy) sème PLUSIEURS fichiers (une scène chacun, la porte
 * multiple du fond) et le TEXTE qui les accompagnait, qui devient le corps
 * de la publication — miroir de l'extension de partage iOS, qui ouvre le
 * composer pré-rempli au lieu de publier à l'aveugle.
 */
export type StudioSeed = {
  readonly files: readonly File[];
  readonly text: string;
};

let pending: StudioSeed | null = null;

export function offerStudioSeedOf(seed: StudioSeed): void {
  pending = seed;
}

export function offerStudioSeed(file: File): void {
  offerStudioSeedOf({ files: [file], text: '' });
}

export function takeStudioSeed(): StudioSeed | null {
  const seed = pending;
  pending = null;
  return seed;
}
