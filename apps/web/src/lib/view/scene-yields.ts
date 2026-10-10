/**
 * PENDANT UNE OPÉRATION, LA SCÈNE CÈDE CE QUI NE SERT PAS ET GARDE CE QUI SERT
 * (#8643, jumelle web de #8642 ; prolonge `chrome-yields.ts`, #8601).
 *
 * `chrome-yields` retire le CHROME (en-tête, rail, légende) quand une feuille
 * s'ouvre ; cette loi dit ce que devient la SCÈNE elle-même :
 *
 *  - **LIRE** les commentaires (ou les vues) : la scène se floute un peu —
 *    le fil se lit sans que l'image se batte avec lui.
 *  - **ÉCRIRE** : la scène revient NETTE et se RÉDUIT, ancrée en haut, pour
 *    tenir ENTIÈRE au-dessus de la barre de composition et du clavier — on
 *    voit ce qu'on commente pendant qu'on l'écrit.
 *  - Replier (⌄) ou envoyer rend la lecture ; fermer la feuille rend la scène.
 *
 * Tout est pur : l'hôte mesure (cadre, haut de la barre, encoche, clavier) et
 * pose le résultat ; aucun nombre de géométrie ne vit dans un composant.
 */
export type SceneYield = 'full' | 'reading' | 'writing';

export function sceneYieldOf({ sheetOpen, writing }: { readonly sheetOpen: boolean; readonly writing: boolean }): SceneYield {
  if (!sheetOpen) return 'full';
  return writing ? 'writing' : 'reading';
}

/** L'air laissé entre le bas de la scène réduite et le haut de la barre. */
export const WRITING_SCENE_GAP_PX = 8;

/**
 * L'échelle qui fait tenir le cadre `[anchorTop, frameHeight]` dans
 * `[anchorTop, barTop - gap]`. L'ancre est l'encoche : la carte de la scène
 * commence déjà sous elle, et y reste une fois réduite.
 */
export function writingSceneScale({
  frameHeight,
  barTop,
  anchorTop,
}: {
  readonly frameHeight: number;
  readonly barTop: number;
  readonly anchorTop: number;
}): number {
  const span = frameHeight - anchorTop;
  if (frameHeight <= 0 || span <= 0) return 1;
  const room = barTop - WRITING_SCENE_GAP_PX - anchorTop;
  return Math.min(1, Math.max(0, room / span));
}

/**
 * La hauteur du clavier virtuel qui RECOUVRE la fenêtre. Safari iOS garde
 * `innerHeight` et rétrécit la vue visible ; la coque Android redimensionne
 * la WebView — là, rien ne recouvre, et le retrait est nul.
 */
export function keyboardInsetOf({
  innerHeight,
  viewportHeight,
  viewportOffsetTop,
}: {
  readonly innerHeight: number;
  readonly viewportHeight: number;
  readonly viewportOffsetTop: number;
}): number {
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
}

/** « Un peu » : le fil se lit, la scène se devine encore. */
export const SCENE_READING_BLUR_PX = 6;

export const SCENE_YIELD_TRANSITION = 'filter 220ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)';

export type YieldingSceneProps = {
  readonly 'data-scene-yields': SceneYield;
  readonly style: {
    readonly filter: string;
    readonly transform: string;
    readonly transformOrigin: string;
    readonly transition: string;
  };
};

export function yieldingScene({
  yieldTo,
  scale,
  anchorTop,
  reducedMotion,
}: {
  readonly yieldTo: SceneYield;
  readonly scale: number;
  readonly anchorTop: number;
  readonly reducedMotion: boolean;
}): YieldingSceneProps {
  return {
    'data-scene-yields': yieldTo,
    style: {
      filter: yieldTo === 'reading' ? `blur(${SCENE_READING_BLUR_PX}px)` : 'none',
      transform: yieldTo === 'writing' ? `scale(${scale})` : 'none',
      transformOrigin: `50% ${anchorTop}px`,
      transition: reducedMotion ? 'none' : SCENE_YIELD_TRANSITION,
    },
  };
}
