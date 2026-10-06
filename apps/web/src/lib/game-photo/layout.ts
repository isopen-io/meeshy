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

/**
 * LE BANDEAU DE PARRAINAGE (#7742) — au pied de la carte : la Signature, la
 * phrase d'invitation, la Flamme, et le lien en CARRÉ QR (#9554 — il ne s'écrit
 * plus). La phrase s'ancre sur `x` par son DÉBUT de ligne et ne dépasse pas
 * `maxTextWidth` ; les jours de la Flamme sont centrés sous elle.
 *
 * Le carré est en FIN de ligne : à droite de gauche à droite, à gauche en
 * arabe — le bandeau se retourne en entier (`direction`), le reste de la carte
 * non. Il est posé au pixel entier : ses modules le sont aussi.
 */
export type BannerLayout = {
  readonly direction: 'ltr' | 'rtl';
  readonly frame: Rect;
  readonly signature: Rect;
  readonly headline: TextLine;
  readonly maxTextWidth: number;
  readonly flame: Rect;
  readonly flameDays: TextLine;
  readonly qr: Rect;
};

export type PhotoLayout = {
  readonly width: number;
  readonly height: number;
  /** Présent seulement quand la carte porte le lien de parrainage. */
  readonly banner?: BannerLayout;
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

/** Avec le bandeau, le profil (1:1) n'a plus la place des grands oiseaux : tout se resserre. */
const PROPORTIONS_WITH_BANNER: Readonly<Record<PhotoFormat, Proportions>> = {
  story: PROPORTIONS.story,
  square: { emblemSize: 0.26, emblemTop: 0.05, kickerY: 0.42, titleY: 0.5, dateY: 0.56, birdSize: 0.16, signatureSize: 0.07 },
};

const MARGIN = 0.05;
const BANNER_HEIGHT = 0.2;
const BANNER_GAP = 0.02;
const QR_SIDE = 0.84;

const flipRect = (rect: Rect, width: number): Rect => ({ ...rect, x: width - rect.x - rect.w });
const flipLine = (line: TextLine, width: number): TextLine => ({ ...line, x: width - line.x });

function bannerOf(width: number, height: number): BannerLayout {
  const margin = width * MARGIN;
  const h = width * BANNER_HEIGHT;
  const frame: Rect = { x: margin, y: height - margin - h, w: width - margin * 2, h };
  const pad = h * 0.14;
  const signatureSize = h * 0.4;
  const signature: Rect = { x: frame.x + pad, y: frame.y + (h - signatureSize) / 2, w: signatureSize, h: signatureSize };
  const qrSide = Math.round(h * QR_SIDE);
  const qrInset = Math.round((h - qrSide) / 2);
  const qr: Rect = { x: Math.round(frame.x + frame.w) - qrInset - qrSide, y: Math.round(frame.y) + qrInset, w: qrSide, h: qrSide };
  const flameSize = h * 0.36;
  const flame: Rect = { x: qr.x - pad * 0.7 - flameSize, y: frame.y + h * 0.2, w: flameSize, h: flameSize };
  const textX = signature.x + signature.w + pad * 0.6;
  const headlineSize = width * 0.036;
  return {
    direction: 'ltr',
    frame,
    signature,
    headline: { x: textX, y: frame.y + h / 2 + headlineSize * 0.35, size: headlineSize },
    maxTextWidth: flame.x - width * 0.012 - textX,
    flame,
    flameDays: { x: flame.x + flame.w / 2, y: frame.y + h * 0.8, size: width * 0.026 },
    qr,
  };
}

const mirrored = (banner: BannerLayout, width: number): BannerLayout => ({
  ...banner,
  direction: 'rtl',
  signature: flipRect(banner.signature, width),
  headline: flipLine(banner.headline, width),
  flame: flipRect(banner.flame, width),
  flameDays: flipLine(banner.flameDays, width),
  qr: flipRect(banner.qr, width),
});

export function photoLayout(format: PhotoFormat, options: { readonly banner?: boolean; readonly rtl?: boolean } = {}): PhotoLayout {
  const { width, height } = PHOTO_FORMATS[format];
  const withBanner = options.banner === true;
  const p = (withBanner ? PROPORTIONS_WITH_BANNER : PROPORTIONS)[format];
  const emblem = width * p.emblemSize;
  const bird = width * p.birdSize;
  const signature = width * p.signatureSize;
  const margin = width * MARGIN;
  const ltr = withBanner ? bannerOf(width, height) : undefined;
  const banner = ltr !== undefined && options.rtl === true ? mirrored(ltr, width) : ltr;
  const birdTop = (banner === undefined ? height - margin : banner.frame.y - width * BANNER_GAP) - bird;
  return {
    ...(banner === undefined ? {} : { banner }),
    width,
    height,
    emblem: { x: (width - emblem) / 2, y: height * p.emblemTop, w: emblem, h: emblem },
    kicker: { x: width / 2, y: height * p.kickerY, size: width * 0.04 },
    title: { x: width / 2, y: height * p.titleY, size: width * 0.075 },
    date: { x: width / 2, y: height * p.dateY, size: width * 0.035 },
    mee: { x: margin, y: birdTop, w: bird, h: bird },
    meo: { x: width - margin - bird, y: birdTop, w: bird, h: bird },
    signature: banner === undefined ? { x: (width - signature) / 2, y: height - margin - signature, w: signature, h: signature } : banner.signature,
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
