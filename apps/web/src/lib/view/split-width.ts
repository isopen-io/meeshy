/**
 * LA LARGEUR DE LA LISTE DANS LE CADRE CÔTE À CÔTE (#10101) — la loi, sans
 * DOM ni React : le séparateur (`routes/split-handle.tsx`) la consulte au
 * geste, le cadre (`routes/split-frame.tsx`) en tire ses cotes CSS.
 *
 * La liste va de sa largeur MINIMALE (20rem, celle d'un téléphone étroit pour
 * laquelle chaque rangée est dessinée) jusqu'à ce que le fil n'occupe plus que
 * 60 % du cadre : elle plafonne à 40 %. Sa largeur par défaut reste celle de
 * D-185 (24rem). La préférence se retient PAR APPAREIL, en pixels : c'est la
 * largeur que la main a choisie sur cet écran-là.
 *
 * Ces cotes n'ont qu'UNE source : le cadre les pose en variables CSS
 * (`splitFrameStyleVars`) et `styles/split-frame.css` borne la colonne par
 * `clamp()` sur ces variables — une fenêtre qui rétrécit garde la liste sous
 * 40 % sans qu'aucun script ne tourne.
 *
 * Ce module ne part jamais dans la première peinture : seuls le cadre et son
 * séparateur l'importent, et ils sont chargés à la demande (D-189).
 */
export const SPLIT_LIST_MIN_REM = 20;
export const SPLIT_LIST_DEFAULT_REM = 24;
/** La part du cadre que la liste ne dépasse jamais : le fil en garde 60 %. */
export const SPLIT_LIST_MAX_SHARE = 0.4;
/** Le pas d'une flèche, et celui de Maj + flèche. */
export const SPLIT_STEP_REM = 1;
export const SPLIT_BIG_STEP_REM = 4;

export const SPLIT_WIDTH_STORAGE_KEY = 'meeshy.split.list-width';

export type SplitBounds = { readonly min: number; readonly max: number; readonly fallback: number; readonly frame: number };

/** Les bornes en pixels pour un cadre de `frame` px et une racine de `rem` px. */
export function splitBounds({ frame, rem }: { readonly frame: number; readonly rem: number }): SplitBounds {
  const min = Math.round(SPLIT_LIST_MIN_REM * rem);
  const max = Math.max(min, Math.floor(frame * SPLIT_LIST_MAX_SHARE));
  return { min, max, fallback: clampWidth(Math.round(SPLIT_LIST_DEFAULT_REM * rem), { min, max }), frame };
}

export function clampWidth(width: number, { min, max }: { readonly min: number; readonly max: number }): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** La largeur que la liste OCCUPE : la préférence bornée, ou le défaut. */
export function effectiveWidth(preferred: number | null, bounds: SplitBounds): number {
  return preferred === null ? bounds.fallback : clampWidth(preferred, bounds);
}

/**
 * Une touche → la largeur suivante, ou `null` quand la touche n'a pas d'objet
 * (elle n'est alors pas consommée). La liste est au DÉBUT de la ligne : à
 * gauche en français, à droite en arabe — la flèche qui pointe vers le fil
 * l'élargit.
 */
export function widthAfterKey({
  key,
  shift,
  width,
  bounds,
  rtl,
  rem,
}: {
  readonly key: string;
  readonly shift: boolean;
  readonly width: number;
  readonly bounds: SplitBounds;
  readonly rtl: boolean;
  readonly rem: number;
}): number | null {
  if (key === 'Home') return bounds.min;
  if (key === 'End') return bounds.max;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const step = (shift ? SPLIT_BIG_STEP_REM : SPLIT_STEP_REM) * rem;
  const towardThread = (key === 'ArrowRight') !== rtl;
  return clampWidth(width + (towardThread ? step : -step), bounds);
}

/** Le pointeur a parcouru `dx` px depuis l'appui : en arabe, tirer vers la gauche élargit. */
export function widthAfterDrag({
  startWidth,
  dx,
  bounds,
  rtl,
}: {
  readonly startWidth: number;
  readonly dx: number;
  readonly bounds: SplitBounds;
  readonly rtl: boolean;
}): number {
  return clampWidth(startWidth + (rtl ? -dx : dx), bounds);
}

/** La part du cadre, en pour cent entiers — ce que le séparateur annonce. */
export function shareOf(width: number, frame: number): number {
  return frame > 0 ? Math.round((width / frame) * 100) : 0;
}

/** Les cotes que le cadre pose, et la préférence quand il y en a une. */
export function splitFrameStyleVars(preferred: number | null): Record<string, string> {
  return {
    '--split-list-min': `${SPLIT_LIST_MIN_REM}rem`,
    '--split-list-default': `${SPLIT_LIST_DEFAULT_REM}rem`,
    '--split-list-max': `${SPLIT_LIST_MAX_SHARE * 100}%`,
    ...(preferred === null ? {} : { '--split-list-w': `${preferred}px` }),
  };
}

/**
 * La préférence de l'appareil — une commodité, jamais un état partagé : un
 * stockage refusé (navigation privée, données bloquées) rend `null`, et la
 * liste garde sa largeur par défaut. Une valeur illisible est ignorée.
 */
export function readSplitWidth(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(SPLIT_WIDTH_STORAGE_KEY) ?? null;
    if (raw === null || !/^\d{1,5}$/.test(raw)) return null;
    const width = Number(raw);
    return width > 0 ? width : null;
  } catch {
    return null;
  }
}

/** `null` oublie la préférence : la liste revient à sa largeur par défaut. */
export function writeSplitWidth(width: number | null): void {
  try {
    if (width === null) globalThis.localStorage?.removeItem(SPLIT_WIDTH_STORAGE_KEY);
    else globalThis.localStorage?.setItem(SPLIT_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    return;
  }
}
