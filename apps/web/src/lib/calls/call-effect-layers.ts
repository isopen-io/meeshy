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

/** (+) ouvre le premier des genres OFFERTS qui manque à la pile ; `null` quand la pile est pleine, ou qu'ils y sont tous. */
export function nextGenre(stack: EffectStack, offered: readonly EffectGenre[]): EffectGenre | null {
  return isFull(stack) ? null : (offered.find((genre) => !holds(stack, genre)) ?? null);
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
