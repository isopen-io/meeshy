/**
 * LA MISE EN PAGE DU CADRE (#9382) — conception, partie VI : emblème en haut,
 * titre et date, Mee et Meo en bas. Une DONNÉE, en pixels de l'image finale :
 * l'aperçu en direct (`GamePhotoFrame`, à l'échelle) et la composition sur
 * `canvas` (`compose.ts`) lisent la MÊME table, donc le cadre qu'on voit au
 * moment de déclencher est celui qu'on obtient.
 *
 * Deux formats : 9:16 pour la story, 1:1 pour le profil. Rien n'est écrit en
 * dur par format hors de cette table : une troisième forme s'ajoute ici.
 */

export type PhotoFormat = 'story' | 'square';

export const PHOTO_FORMATS: Readonly<Record<PhotoFormat, { readonly width: number; readonly height: number }>> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
export type TextLine = { readonly x: number; readonly y: number; readonly size: number };

export type PhotoLayout = {
  readonly width: number;
  readonly height: number;
  readonly emblem: Rect;
  readonly kicker: TextLine;
  readonly title: TextLine;
  readonly date: TextLine;
  readonly mee: Rect;
  readonly meo: Rect;
  readonly signature: Rect;
};

type Proportions = {
  readonly emblemSize: number;
  readonly emblemTop: number;
  readonly kickerY: number;
  readonly titleY: number;
  readonly dateY: number;
  readonly birdSize: number;
  readonly signatureSize: number;
};

/** En fraction de la largeur (tailles) ou de la hauteur (positions verticales). */
const PROPORTIONS: Readonly<Record<PhotoFormat, Proportions>> = {
  story: { emblemSize: 0.36, emblemTop: 0.07, kickerY: 0.4, titleY: 0.45, dateY: 0.5, birdSize: 0.26, signatureSize: 0.1 },
  square: { emblemSize: 0.3, emblemTop: 0.06, kickerY: 0.49, titleY: 0.58, dateY: 0.65, birdSize: 0.22, signatureSize: 0.07 },
};

const MARGIN = 0.05;

export function photoLayout(format: PhotoFormat): PhotoLayout {
  const { width, height } = PHOTO_FORMATS[format];
  const p = PROPORTIONS[format];
  const emblem = width * p.emblemSize;
  const bird = width * p.birdSize;
  const signature = width * p.signatureSize;
  const margin = width * MARGIN;
  const birdTop = height - margin - bird;
  return {
    width,
    height,
    emblem: { x: (width - emblem) / 2, y: height * p.emblemTop, w: emblem, h: emblem },
    kicker: { x: width / 2, y: height * p.kickerY, size: width * 0.04 },
    title: { x: width / 2, y: height * p.titleY, size: width * 0.075 },
    date: { x: width / 2, y: height * p.dateY, size: width * 0.035 },
    mee: { x: margin, y: birdTop, w: bird, h: bird },
    meo: { x: width - margin - bird, y: birdTop, w: bird, h: bird },
    signature: { x: (width - signature) / 2, y: height - margin - signature, w: signature, h: signature },
  };
}

export type SourceRect = { readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number };

/** Le rectangle de la source qui remplit le cadre, centré, sans déformation (« cover »). */
export function coverFit(source: { readonly width: number; readonly height: number }, frame: { readonly width: number; readonly height: number }): SourceRect {
  if (source.width <= 0 || source.height <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const sourceRatio = source.width / source.height;
  const frameRatio = frame.width / frame.height;
  if (sourceRatio > frameRatio) {
    const sw = source.height * frameRatio;
    return { sx: (source.width - sw) / 2, sy: 0, sw, sh: source.height };
  }
  const sh = source.width / frameRatio;
  return { sx: 0, sy: (source.height - sh) / 2, sw: source.width, sh };
}

/** Le plus grand rectangle de la proportion de `source` qui tient dans `frame`, centré. */
export function containFit(source: { readonly width: number; readonly height: number }, frame: Rect): Rect {
  if (source.width <= 0 || source.height <= 0) return frame;
  const scale = Math.min(frame.w / source.width, frame.h / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
}
