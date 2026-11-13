/**
 * **LA PILE DE TROIS COUCHES** (#17903, décision porteur du 2026-11-13 sur #16979 ; `CallEffectLayers` d'iOS
 * et d'Android) — Effets, filtres et cadres sont UNE famille d'outils : ce qu'on y pose s'EMPILE, au plus trois
 * couches, un genre à la fois. Loi pure — aucune vue, aucun singleton — que le mode Effets et le mode Montage
 * consomment tous les deux ; mêmes vecteurs de test sur les trois plateformes.
 *
 * - **Ajouter** : un genre déjà présent est remplacé À SA PLACE (toucher un autre filtre ne crée pas de couche) ;
 *   un genre absent s'empile au-dessus ; à trois couches, l'ajout est refusé et la pile reste inchangée.
 * - **Retirer** : retire cette couche seule, les autres gardent leur ordre ; « Aucun » dans un genre la retire.
 * - **Lister** : de la couche du dessus à celle du dessous (l'appui long sur (+)).
 *
 * La pile est rangée DU DESSOUS AU DESSUS : la dernière couche posée est la dernière du tableau.
 */
export type EffectGenre = 'frame' | 'color' | 'face' | 'landscape' | 'voice';

export type EffectLayer = { readonly genre: EffectGenre; readonly choice: string };

export type EffectStack = readonly EffectLayer[];

export const MAX_EFFECT_LAYERS = 3;

/** Le choix « Aucun » d'un genre : il retire la couche de ce genre. */
export const NO_CHOICE = 'none';

export const isFull = (stack: EffectStack): boolean => stack.length >= MAX_EFFECT_LAYERS;

const holds = (stack: EffectStack, genre: EffectGenre): boolean => stack.some((layer) => layer.genre === genre);

/** Un genre se pose si la pile a de la place, ou s'il y est déjà (il se remplace alors à sa place). */
export const canAdd = (stack: EffectStack, genre: EffectGenre): boolean => holds(stack, genre) || !isFull(stack);

export function removeLayer(stack: EffectStack, genre: EffectGenre): EffectStack {
  return holds(stack, genre) ? stack.filter((layer) => layer.genre !== genre) : stack;
}

export function addLayer(stack: EffectStack, layer: EffectLayer): EffectStack {
  if (layer.choice === NO_CHOICE) return removeLayer(stack, layer.genre);
  if (holds(stack, layer.genre)) return stack.map((entry) => (entry.genre === layer.genre ? layer : entry));
  return isFull(stack) ? stack : [...stack, layer];
}

export const listLayers = (stack: EffectStack): EffectStack => [...stack].reverse();

/** Les genres que montre le mode Effets (Visage · Couleur), puis ceux du Montage (Cadres) : l'ordre de la rangée commune. */
export const EFFECTS_GENRES: readonly EffectGenre[] = ['face', 'color'];

export const MONTAGE_GENRES: readonly EffectGenre[] = ['frame'];

/**
 * **LA RANGÉE DE GENRES, UNE POUR LES DEUX MODES** (#16979, #17915 ; `CallEffectsGenreRule` d'iOS) — Visage ·
 * Couleur · Cadres : un genre n'y figure que si l'appel offre le mode qui le montre.
 */
export const genreRow = (offersEffects: boolean, offersFrames: boolean): readonly EffectGenre[] => [...(offersEffects ? EFFECTS_GENRES : []), ...(offersFrames ? MONTAGE_GENRES : [])];

/** Le premier genre ABSENT de la pile parmi `available`, en partant APRÈS `current` (tour complet), sans jamais renvoyer `current`. Pile pleine ou tout posé : `null`. */
export function openingGenre(stack: EffectStack, current: EffectGenre | null, available: readonly EffectGenre[]): EffectGenre | null {
  if (isFull(stack) || available.length === 0) return null;
  const at = current === null ? -1 : available.indexOf(current);
  const start = at < 0 ? 0 : at + 1;
  return [...available.slice(start), ...available.slice(0, start)].find((genre) => genre !== current && !holds(stack, genre)) ?? null;
}

const inMontage = (genre: EffectGenre): boolean => MONTAGE_GENRES.includes(genre);

/**
 * (+) : un genre ABSENT de la pile, d'abord dans le mode où l'on est, puis dans l'autre. Quand tout ce que la rangée
 * offre est déjà posé sans remplir la pile, (+) laisse feuilleter l'autre genre du mode, sinon le premier de l'autre
 * mode : rien de ce qu'il faisait ne se perd. Pile pleine, ou genre courant hors de la rangée : `null`.
 */
export function addingGenre(current: EffectGenre, stack: EffectStack, row: readonly EffectGenre[]): EffectGenre | null {
  if (isFull(stack) || !row.includes(current)) return null;
  const sameMode = row.filter((genre) => inMontage(genre) === inMontage(current));
  const otherMode = row.filter((genre) => inMontage(genre) !== inMontage(current));
  const at = sameMode.indexOf(current);
  const browsing = sameMode.length > 1 ? (sameMode[(at + 1) % sameMode.length] ?? null) : null;
  return openingGenre(stack, current, sameMode) ?? openingGenre(stack, null, otherMode) ?? browsing ?? otherMode[0] ?? null;
}

/**
 * La pile SUIT ce qui est réellement appliqué : parmi les genres que le mode possède (`owned`), un genre
 * appliqué mais absent de la pile s'empile au-dessus, un genre qui n'est plus appliqué la quitte, un genre dont
 * le choix change reste À SA PLACE. Les genres que le mode ne possède pas ne sont jamais touchés. Rien à
 * changer ⇒ la MÊME pile, pour ne rien réécrire.
 */
export function syncLayers(stack: EffectStack, actual: EffectStack, owned: readonly EffectGenre[]): EffectStack {
  const choiceOf = (genre: EffectGenre): string | undefined => actual.find((layer) => layer.genre === genre)?.choice;
  const kept = stack.flatMap((layer): EffectLayer[] => {
    if (!owned.includes(layer.genre)) return [layer];
    const choice = choiceOf(layer.genre);
    return choice === undefined ? [] : [{ genre: layer.genre, choice }];
  });
  const arrived = actual.filter((layer) => owned.includes(layer.genre) && !holds(stack, layer.genre));
  const next = [...kept, ...arrived].slice(0, MAX_EFFECT_LAYERS);
  const same = next.length === stack.length && next.every((layer, index) => layer.genre === stack[index]?.genre && layer.choice === stack[index]?.choice);
  return same ? stack : next;
}
