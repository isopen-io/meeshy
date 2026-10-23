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

/** La scène qui ne porte pas le flou n'anime que sa réduction. */
export const SCENE_SCALE_TRANSITION = 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * QUI PORTE LE FLOU DE LECTURE (#11307). `scene` : la scène elle-même — une
 * story, dont le calque ne change pas d'image pendant qu'on lit. `poster` :
 * l'AFFICHE du réel visible, une image fixe. Un `filter` posé sur un pager qui
 * contient une `<video>` en lecture se recalcule à chaque image décodée ; le
 * réel se met donc en pause sous son affiche floutée (parité iOS, défaut
 * retenu de #11253), et la scène ne porte plus que sa réduction.
 */
export type SceneBlurCarrier = 'scene' | 'poster';

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
  blurCarrier = 'scene',
}: {
  readonly yieldTo: SceneYield;
  readonly scale: number;
  readonly anchorTop: number;
  readonly reducedMotion: boolean;
  readonly blurCarrier?: SceneBlurCarrier;
}): YieldingSceneProps {
  const sceneBlurs = blurCarrier === 'scene';
  return {
    'data-scene-yields': yieldTo,
    style: {
      filter: sceneBlurs && yieldTo === 'reading' ? `blur(${SCENE_READING_BLUR_PX}px)` : 'none',
      transform: yieldTo === 'writing' ? `scale(${scale})` : 'none',
      transformOrigin: `50% ${anchorTop}px`,
      transition: reducedMotion ? 'none' : sceneBlurs ? SCENE_YIELD_TRANSITION : SCENE_SCALE_TRANSITION,
    },
  };
}

/**
 * LE RÉEL VISIBLE SOUS LA FEUILLE (#11307) : `held` — sa lecture s'arrête, et
 * reprend à la fermeture ; `veiled` — son affiche floutée le recouvre, le
 * temps qu'on LISE. Écrire le rend net (la scène se réduit au-dessus de la
 * barre), toujours en pause. Un voisin hors champ ne jouait pas et ne se voit
 * pas : rien ne change pour lui, et sa page mémoïsée ne se re-rend pas.
 */
export function reelUnderSheet({ yieldTo, active }: { readonly yieldTo: SceneYield; readonly active: boolean }): {
  readonly held: boolean;
  readonly veiled: boolean;
} {
  if (!active || yieldTo === 'full') return { held: false, veiled: false };
  return { held: true, veiled: yieldTo === 'reading' };
}
