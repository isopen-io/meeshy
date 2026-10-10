/**
 * **CE QU'UNE CARTE D'EXPORT PEINT** — le vocabulaire commun de la mise en
 * page (`message-card-layout.ts`, `message-card-frame.ts`,
 * `message-card-media.ts`) et de la peinture (`message-card-paint.ts`). Une
 * opération est une donnée : la loi la calcule sans canvas, le peintre la
 * rend sans rien décider.
 */

export type CardTextOp = {
  readonly kind: 'text';
  readonly text: string;
  readonly x: number;
  /** La ligne de base — ou le CENTRE du texte quand il est tourné (`rotate`). */
  readonly y: number;
  readonly font: string;
  readonly color: string;
  readonly align: 'left' | 'right' | 'center';
  readonly direction: 'ltr' | 'rtl';
  /** Une rotation autour de (`x`, `y`), en radians — l'en-tête couché de l'onglet Frame. */
  readonly rotate?: number;
};

export type CardBarOp = {
  readonly kind: 'bar';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
};

/** Un trait horizontal — interrompu par un cercle au milieu quand `radius` > 0. */
export type CardSeparatorOp = {
  readonly kind: 'separator';
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly dash: readonly number[];
  readonly lineWidth: number;
};

/** Une bulle : un rectangle arrondi sous un bloc de texte. */
export type CardPanelOp = {
  readonly kind: 'panel';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly color: string;
};

export type CardDotOp = {
  readonly kind: 'dot';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  /** Une marque de l'image FIXE (le bouton « lecture » posé sur une vidéo) : un export animé ne la peint pas, la vidéo y joue. */
  readonly still?: true;
};

/** Le triangle « lecture » d'un média temporel, centré sur (`x`, `y`). */
export type CardPlayOp = {
  readonly kind: 'play';
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly still?: true;
};

/**
 * UNE PIÈCE VISUELLE — l'image, ou la PREMIÈRE image d'une vidéo, posée en
 * « cover » dans son cadre. `index` désigne la pièce dans `MessageCardInput.media` :
 * le peintre reçoit les sources décodées à part, la loi n'en connaît que les dimensions.
 */
export type CardMediaOp = {
  readonly kind: 'media';
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly video: boolean;
};

/**
 * L'ONDE D'UN AUDIO — des barres régulières, `peaks` entre 0 et 1. `mirror`
 * les dresse de part et d'autre de l'axe (le style « spectre »). Pendant un
 * export animé, les barres déjà JOUÉES prennent `color`, les autres `dim`.
 */
export type CardWaveOp = {
  readonly kind: 'wave';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly peaks: readonly number[];
  readonly mirror: boolean;
  readonly color: string;
  readonly dim: string;
};

export type CardOp = CardTextOp | CardBarOp | CardSeparatorOp | CardPanelOp | CardDotOp | CardPlayOp | CardMediaOp | CardWaveOp;
