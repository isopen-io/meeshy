/**
 * **LE BALAYAGE DES DÉCLINAISONS D'UN CADRE** (#12685, #17821 C1.6) — la loi pure, jumelle de
 * `CallFrameDeclinationSwipe` d'iOS. Sur la vignette du cadre choisi, un glissement vertical passe
 * d'une déclinaison à l'autre : l'axe se lit au premier mouvement et se garde tout le toucher (le
 * carrousel garde l'horizontal), la page suit le doigt sur une page au plus et résiste aux bords,
 * et elle ne change qu'au-delà de 30 % de la hauteur ou sur un élan de 60 % — jamais de plus d'une
 * page, sans boucler. Vers le haut, la déclinaison suivante.
 */

export const AXIS_LATCH_PX = 8;

/** Au-delà de cette part de la hauteur, le geste change de page. */
export const COMMIT_SHARE = 0.3;

/** Ou quand la fin projetée de l'élan dépasse cette part. */
export const FLING_SHARE = 0.6;

/** L'élan se projette sur ce laps (ms) : la fin du geste si le doigt continuait. */
export const FLING_HORIZON_MS = 150;

/** Au bord, la page ne suit le doigt que de cette part. */
const EDGE_RESISTANCE = 0.25;

export type Axis = 'vertical' | 'horizontal';

export const latchAxis = ({ dx, dy }: { readonly dx: number; readonly dy: number }): Axis | null => {
  if (Math.hypot(dx, dy) < AXIS_LATCH_PX) return null;
  return Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
};

type Page = { readonly index: number; readonly count: number };

/** Vers le haut (translation négative), la page suivante : au dernier, c'est le vide. */
const pastEdge = ({ translation, index, count }: Page & { readonly translation: number }): boolean => (translation < 0 ? index >= count - 1 : index <= 0);

/** Où la page se tient pendant le geste, en px : le doigt, borné à une page, freiné au bord. */
export function declinationOffset({ translation, height, index, count }: Page & { readonly translation: number; readonly height: number }): number {
  const bounded = Math.max(-height, Math.min(height, translation));
  return pastEdge({ translation, index, count }) ? bounded * EDGE_RESISTANCE : bounded;
}

/** L'indice où le geste se pose : un cran au plus, jamais hors des déclinaisons. */
export function declinationTarget({ translation, velocity, height, index, count }: Page & { readonly translation: number; readonly velocity: number; readonly height: number }): number {
  if (height <= 0 || pastEdge({ translation, index, count })) return index;
  const projected = translation + velocity * FLING_HORIZON_MS;
  const committed = Math.abs(translation) >= height * COMMIT_SHARE || Math.abs(projected) >= height * FLING_SHARE;
  return committed ? index + (translation < 0 ? 1 : -1) : index;
}
