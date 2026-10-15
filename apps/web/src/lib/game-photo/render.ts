import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { formatCount, gameText } from '@/lib/view/game-copy';

import { paintPhoto, type PaintContext, type PhotoArt, type PhotoBanner, type PhotoPalette, type PhotoSource } from './compose';
import { PHOTO_FORMATS, photoLayout, type BannerLayout, type PhotoFormat } from './layout';
import type { PhotoMoment } from './moments';
import type { PhotoReferral } from './referral';
import { referralQr } from './referral-qr';

/**
 * LES DEUX IMAGES (#9382) — la story en 9:16 et le profil en 1:1, rendues d'un
 * coup à la prise de vue : l'utilisateur choisit ensuite ce qu'il partage, sans
 * rien recalculer. Le `canvas` est INJECTÉ (`createCanvas`) : un faux canvas
 * garde sa taille et ses textes en test, `document.createElement('canvas')` en
 * production.
 *
 * Rien ne part nulle part : le résultat est un couple de `File` en mémoire.
 */

export type PhotoFiles = { readonly story: File; readonly square: File };

/** Le calendrier de la langue de l'interface (chiffres latins en arabe, comme le reste du produit). */
const DATE_LOCALES: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-u-nu-latn',
};

/** La date de la prise, dans le fuseau de l'appareil (`timeZone` ne sert qu'aux témoins). */
export const dateLabelOf = (date: Date, timeZone?: string, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  new Intl.DateTimeFormat(DATE_LOCALES[language], { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone === undefined ? {} : { timeZone }) }).format(date);

const SUFFIX: Readonly<Record<PhotoFormat, string>> = { story: 'story', square: 'profil' };

export const fileNameOf = (momentId: string, format: PhotoFormat, mimeType = 'image/png'): string =>
  `meeshy-${momentId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${SUFFIX[format]}.${mimeType === KEPT_STORY_MIME ? 'jpg' : 'png'}`;

const toBlob = (canvas: HTMLCanvasElement, mimeType = 'image/png', quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));

/**
 * LE 9:16 GARDÉ AU CARNET (#10238) : un JPEG de la qualité d'iOS (q0,9), pas le
 * PNG du partage. Mesuré dans Chromium sur douze cartes composées 1080 × 1920 :
 * le PNG pèse 1,38 à 1,65 Mo, le JPEG q0,9 210 à 274 Ko (q0,85 : 175 à 229 Ko),
 * six à sept fois moins sur le quota du navigateur. Le partage garde le PNG.
 */
export const KEPT_STORY_MIME = 'image/jpeg';
export const KEPT_STORY_QUALITY = 0.9;

export type KeptStoryDeps = {
  readonly createCanvas: (width: number, height: number) => HTMLCanvasElement;
  readonly decode: (blob: Blob) => Promise<ImageBitmap>;
};

/** Le JPEG à garder ; l'image d'entrée telle quelle si elle l'est déjà, ou si le navigateur ne sait pas la ré-encoder. */
export async function keptStoryOf(story: Blob, deps: KeptStoryDeps): Promise<Blob> {
  if (story.type === KEPT_STORY_MIME) return story;
  try {
    const image = await deps.decode(story);
    try {
      const canvas = deps.createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return story;
      ctx.drawImage(image, 0, 0);
      return (await toBlob(canvas, KEPT_STORY_MIME, KEPT_STORY_QUALITY)) ?? story;
    } finally {
      image.close();
    }
  } catch {
    return story;
  }
}

/** Ce que le bandeau porte, dans la langue de l'interface : la phrase, les jours de Flamme, et le lien en carré QR (#9554). */
const bannerOf = (referral: PhotoReferral, layout: BannerLayout | undefined): PhotoBanner => ({
  headline: gameText('game.photo.referral.headline'),
  qr: layout === undefined ? null : referralQr(referral, layout.qr.w),
  flameLabel: referral.flameDays === null ? null : gameText('game.photo.referral.flame_days', { days: formatCount(referral.flameDays) }),
  ...(referral.placeholder === true ? { placeholder: true as const } : {}),
});

async function renderOne(
  params: RenderParams,
  format: PhotoFormat,
): Promise<File | null> {
  const { width, height } = PHOTO_FORMATS[format];
  const canvas = params.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  const referral = params.referral ?? null;
  const layout = photoLayout(format, { banner: referral !== null, rtl: interfaceDirection(currentInterfaceLanguage()) === 'rtl' });
  paintPhoto(ctx as unknown as PaintContext, {
    layout,
    ...(referral === null ? {} : { banner: bannerOf(referral, layout.banner) }),
    moment: params.moment,
    dateLabel: dateLabelOf(params.now, params.timeZone),
    photo: params.photo,
    art: params.art,
    palette: params.palette,
    fontFamily: params.fontFamily,
  });
  const blob = await toBlob(canvas);
  return blob === null ? null : new File([blob], fileNameOf(params.moment.id, format), { type: 'image/png' });
}

type RenderParams = {
  readonly moment: PhotoMoment;
  readonly photo: PhotoSource | null;
  readonly art: PhotoArt;
  readonly palette: PhotoPalette;
  readonly fontFamily: string;
  readonly now: Date;
  readonly timeZone?: string;
  /** Le lien de parrainage de l'utilisateur et sa Flamme (#7742) ; `null` ou absent : la carte part sans bandeau. */
  readonly referral?: PhotoReferral | null;
  readonly createCanvas: (width: number, height: number) => HTMLCanvasElement;
};

/** Les deux fichiers, ou `null` quand le navigateur ne sait pas peindre (pas de contexte 2D, pas de Blob). */
export async function renderPhotoFiles(params: RenderParams): Promise<PhotoFiles | null> {
  try {
    const [story, square] = await Promise.all([renderOne(params, 'story'), renderOne(params, 'square')]);
    return story === null || square === null ? null : { story, square };
  } catch {
    return null;
  }
}
