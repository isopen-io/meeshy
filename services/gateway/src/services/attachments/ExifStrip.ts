/**
 * Retrait d'EXIF/GPS des images uploadées (#3627), SANS perte de génération
 * (#11258).
 *
 * Les métadonnées partent au niveau des OCTETS, par une liste blanche propre à
 * chaque format (`metadata-strip/`) : les pixels ressortent tels qu'ils sont
 * entrés, le profil de couleur ICC reste, un WebP sans perte le reste, un PNG
 * à palette ne gonfle pas, une image animée garde toutes ses images (#10639).
 *
 * `sharp` n'intervient que dans deux cas :
 * - une image FIXE dont l'orientation EXIF vaut autre chose que 1, quand la
 *   rotation SANS PERTE est impossible : un JPEG pivote d'abord par ses
 *   coefficients DCT (`metadata-strip/jpeg-orientation.ts`, #11841), sans
 *   génération perdue ; ce n'est que si ses dimensions sortent de la grille
 *   des blocs, ou pour un WebP, que la rotation est appliquée aux pixels
 *   (`autoOrient`) avant que l'EXIF ne parte, le profil ICC gardé (`keepIccProfile`), dans un encodage aussi
 *   fidèle que le format le permet (JPEG q95 au sous-échantillonnage de la
 *   source, WebP q97 « sharp YUV », WebP sans perte si la
 *   source l'était, PNG à palette si la source l'était) ; un JPEG HDR y
 *   garde sa carte de gain, pivotée avec lui (`keepGainMap`, que les typages
 *   de sharp 0.35.5 omettent — d'où `GainMapAware`, #11840) ;
 * - une structure illisible (JPEG avant toute donnée d'image, WebP sans image,
 *   PNG sans pixels) : ré-encodage plutôt que de laisser partir l'original.
 * Une rotation qui échoue (pixels tronqués) retombe sur le retrait des octets :
 * la photo garde son orientation d'origine, jamais son GPS. Un PNG que ni la
 * lecture ni sharp ne déchiffrent rend sa liste blanche refermée, même sans
 * pixels (audit #10639) : jamais l'original.
 * Une image ANIMÉE n'est jamais pivotée : sur plusieurs pages, sharp refuse,
 * et l'appelant garderait l'original AVEC son EXIF (audit #10639).
 *
 * GIF et HEIF (HEIC, AVIF) passent aussi (contre-analyse W4) : le client web
 * ne retire l'EXIF que des images qu'il ré-encode, et `sharp` ne décode pas le
 * HEIC. SVG est du XML, sans concept d'EXIF.
 */
import sharp, { type Metadata, type Sharp } from 'sharp';
import { stripGifMetadataBlocks } from './metadata-strip/gif-blocks';
import { blankIsobmffMetadataItems } from './metadata-strip/isobmff-items';
import { stripJpegKeepingGainMap } from './metadata-strip/jpeg-gain-map';
import { losslesslyOrientedJpeg } from './metadata-strip/jpeg-orientation';
import { hasPngPixels, isAnimatedPng, readPngChunks, stripPngMetadataChunks } from './metadata-strip/png-chunks';
import { isLosslessWebp, stripWebpMetadataChunks } from './metadata-strip/webp-chunks';

type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'heif';

const FORMAT_BY_MIME_TYPE: Readonly<Record<string, ImageFormat>> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heif',
  'image/heif': 'heif',
  'image/avif': 'heif',
};

// #12278 — mesuré (PSNR contre l'original redressé, JPEG q80 4:2:0 hors grille) :
// q92 4:4:4 → 43,2 dB ; q95 au sous-échantillonnage de la SOURCE → 45,5 dB, pour
// +5 % de poids (rééchantillonner une chrominance déjà sous-échantillonnée en
// 4:4:4 n'ajoute que du poids). WebP q80 → q90 : 40,8 dB ; q97 avec
// sous-échantillonnage « sharp YUV » : 45,0 à 45,7 dB pour 2,1 à 2,5 fois le poids
// de la source ; le WebP sans perte (exact) pèserait 6,5 fois la source. Le WebP
// avec perte n'a pas de rotation sans perte : cette génération reste inévitable.
const JPEG_REENCODE_QUALITY = 95;
const WEBP_LOSSY_REENCODE = { quality: 97, smartSubsample: true } as const;

function formatOf(mimeType: string): ImageFormat | undefined {
  return FORMAT_BY_MIME_TYPE[mimeType.toLowerCase()];
}

export function isExifStrippable(mimeType: string): boolean {
  return formatOf(mimeType) !== undefined;
}

type ReencodableFormat = 'jpeg' | 'png' | 'webp';
type ImageFacts = Partial<Pick<Metadata, 'isPalette' | 'pages' | 'orientation' | 'gainMap' | 'chromaSubsampling'>>;

function jpegReencode(metadata: ImageFacts): { quality: number; chromaSubsampling: string } {
  return { quality: JPEG_REENCODE_QUALITY, chromaSubsampling: metadata.chromaSubsampling === '4:2:0' ? '4:2:0' : '4:4:4' };
}
type GainMapAware = Sharp & { readonly keepGainMap: () => Sharp };

function encode(image: Sharp, format: ReencodableFormat, source: Buffer, metadata: ImageFacts): Promise<Buffer> {
  if (format === 'jpeg' && metadata.gainMap) return (image as GainMapAware).keepGainMap().jpeg(jpegReencode(metadata)).toBuffer();
  if (format === 'jpeg') return image.jpeg(jpegReencode(metadata)).toBuffer();
  if (format === 'png') return image.png({ palette: metadata.isPalette === true }).toBuffer();
  return image.webp(isLosslessWebp(source) ? { lossless: true } : WEBP_LOSSY_REENCODE).toBuffer();
}

function stripBytes(format: ReencodableFormat, buffer: Buffer): Buffer | null {
  if (format === 'jpeg') return stripJpegKeepingGainMap(buffer);
  if (format === 'png') {
    const read = readPngChunks(buffer);
    return hasPngPixels(read) ? stripPngMetadataChunks(buffer, read) : null;
  }
  return stripWebpMetadataChunks(buffer);
}

function withoutMetadataOrFail(format: ReencodableFormat, buffer: Buffer, error: unknown): Buffer {
  if (format === 'png') return stripPngMetadataChunks(buffer);
  throw error;
}

async function reencoded(buffer: Buffer, format: ReencodableFormat, metadata: ImageFacts): Promise<Buffer> {
  const pixels = await encode(sharp(buffer).autoOrient().keepIccProfile(), format, buffer, metadata);
  return stripBytes(format, pixels) ?? pixels;
}

async function stripStillOrReencode(buffer: Buffer, format: ReencodableFormat): Promise<Buffer> {
  const metadata: ImageFacts = await sharp(buffer).metadata().catch((): ImageFacts => ({}));
  const still = (metadata.pages ?? 1) <= 1;
  const unreadable = (error: unknown): Buffer => withoutMetadataOrFail(format, buffer, error);
  if (still && (metadata.orientation ?? 1) !== 1) {
    const lossless = format === 'jpeg' ? await losslesslyOrientedJpeg(buffer, metadata.orientation ?? 1).catch(() => null) : null;
    const strippedLossless = lossless === null ? null : stripBytes(format, lossless);
    if (strippedLossless !== null) return strippedLossless;
    return reencoded(buffer, format, metadata).catch((error: unknown) => stripBytes(format, buffer) ?? unreadable(error));
  }
  return stripBytes(format, buffer) ?? reencoded(buffer, format, metadata).catch(unreadable);
}

/**
 * Un JPEG HDR garde sa carte de gain (`metadata-strip/jpeg-gain-map.ts`,
 * #11840).
 *
 * Rend `buffer` sans métadonnées. Rend `buffer` INCHANGÉ si `mimeType` n'est
 * pas couvert — l'appelant décide via `isExifStrippable`, la fonction reste
 * sans risque à appeler sur un type non couvert.
 */
export async function stripExifFromImageBuffer(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const format = formatOf(mimeType);
  if (format === undefined) return buffer;
  if (format === 'gif') return stripGifMetadataBlocks(buffer) ?? buffer;
  if (format === 'heif') return blankIsobmffMetadataItems(buffer);
  if (format === 'png') {
    const read = readPngChunks(buffer);
    if (isAnimatedPng(read.chunks)) {
      return hasPngPixels(read) ? stripPngMetadataChunks(buffer, read) : stripStillOrReencode(buffer, format);
    }
  }
  return stripStillOrReencode(buffer, format);
}
