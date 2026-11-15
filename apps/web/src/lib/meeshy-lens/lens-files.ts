import type { Lens } from '@meeshy/shared/types/lens-format';

import { lutCubeOf, type LutCube, type LutImage } from './lens-lut';

/**
 * **LES FICHIERS D'UNE LENS, REMIS PAR L'HÔTE** (#11994) — le contrat v1
 * interdit tout réseau à une lens : ce n'est pas l'étage qui va chercher ses
 * fichiers. L'hôte lit ceux que la lens DÉCLARE dans son pack (`read`, la
 * bande de sa LUT et les images de ses stickers), les décode, et les remet
 * au worker dans ses réglages (`LensSettings.files`) : un cube prêt pour la
 * texture 3D, des images prêtes à peindre.
 *
 * Un fichier absent, illisible, ou une bande qui n'a pas la forme N² × N
 * manque SEUL : la lens se joue sans lui (`lens-stage.ts`).
 */
export type LensFiles = {
  readonly cubes: Readonly<Record<string, LutCube>>;
  readonly images: Readonly<Record<string, ImageBitmap>>;
};

export const NO_LENS_FILES: LensFiles = { cubes: {}, images: {} };

export function lensAssetsOf(lens: Lens): { readonly luts: readonly string[]; readonly images: readonly string[] } {
  const of = (kind: 'lut' | 'sticker'): readonly string[] => [
    ...new Set(lens.layers.flatMap((layer) => (layer.kind === kind ? [layer.asset] : []))),
  ];
  return { luts: of('lut'), images: of('sticker') };
}

export type LensFileDeps<B> = {
  /** Le fichier du pack, par son nom adressé par contenu — `null` s'il manque. */
  readonly read: (asset: string) => Promise<Blob | null>;
  /** `lut` : décodée sans conversion de couleur ni prémultiplication — ses pixels SONT la table. */
  readonly decode: (blob: Blob, kind: 'lut' | 'image') => Promise<B>;
  /** Les pixels RGBA d'une image décodée — la bande d'une LUT. */
  readonly stripOf: (image: B) => LutImage;
};

const settled = async <T>(work: () => Promise<T | null>): Promise<T | null> => work().catch(() => null);

export async function loadLensFiles<B>(lens: Lens, deps: LensFileDeps<B>): Promise<{ readonly cubes: Readonly<Record<string, LutCube>>; readonly images: Readonly<Record<string, B>> }> {
  const { luts, images } = lensAssetsOf(lens);
  const decoded = (asset: string, kind: 'lut' | 'image'): Promise<B | null> =>
    settled(async () => {
      const blob = await deps.read(asset);
      return blob === null ? null : deps.decode(blob, kind);
    });
  const cubes = await Promise.all(luts.map(async (asset) => [asset, await settled(async () => {
    const image = await decoded(asset, 'lut');
    return image === null ? null : lutCubeOf(deps.stripOf(image));
  })] as const));
  const bitmaps = await Promise.all(images.map(async (asset) => [asset, await decoded(asset, 'image')] as const));
  const present = <T>(entries: readonly (readonly [string, T | null])[]): Readonly<Record<string, T>> =>
    Object.fromEntries(entries.filter((entry): entry is readonly [string, T] => entry[1] !== null));
  return { cubes: present(cubes), images: present(bitmaps) };
}
