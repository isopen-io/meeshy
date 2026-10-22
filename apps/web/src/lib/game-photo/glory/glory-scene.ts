import type { GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import { apiDeps } from '@/lib/api/deps';
import { apiOrigin } from '@/lib/api/api-origin';
import { loadFramePack, loadInstalledFramePacks } from '@/lib/api/packs-glory-frame';
import { findMeeSticker } from '@/lib/mee/catalog';
import { renderMeeSticker } from '@/lib/mee/render';
import type { PackAssetStoreDeps } from '@/lib/packs/pack-asset-store';

import { rasterizeSvg, type PaintContext, type PhotoArt, type PhotoBanner, type PhotoPalette, type PhotoSource } from '../compose';
import { bannerWithin, type BannerLayout, type Rect } from '../layout';
import { loadGloryFrameImages, type ClosableImage, type GloryAssetDeps, type GloryFrameImages } from './frame-assets';
import { loadGloryCatalog, pickGloryFrame, type GloryCatalog, type GloryFramePick } from './frame-catalog';
import { rectOf, type GloryFrame, type GloryRecipe, type GloryTexts } from './frame-spec';
import { paintGloryFrame, type PaintSurface } from './paint-glory-frame';

/**
 * **LA SCÈNE D'UN CADRE DE GLOIRE** (#10159, L7) — l'entrée PARESSEUSE du
 * module : le déroulé l'atteint par `import()` seulement, jamais au premier
 * affichage (budget `glory_painter`, `dynamic_only`). Elle noue le catalogue
 * (quel cadre pour cette étape), les images (sont-elles PRÊTES ?) et le
 * peintre ; le même objet sert l'aperçu (canvas à la taille d'affichage,
 * couches à demi-résolution) et l'image finale (pleine taille).
 *
 * Tout échec rend `null` — carte simple — jamais une erreur dans le déroulé.
 */

export type { GloryFramePick } from './frame-catalog';
export { DEFAULT_RECIPE, type GloryRecipe, type GloryTexts } from './frame-spec';

export type GlorySceneInput = {
  readonly photo: PhotoSource | null;
  readonly art: PhotoArt;
  readonly banner?: PhotoBanner;
  readonly recipe: GloryRecipe;
  readonly palette: PhotoPalette;
  readonly fontFamily: string;
  readonly rtl: boolean;
  readonly language: string;
  readonly scratch: (width: number, height: number) => PaintSurface | null;
};

export type GloryScene = {
  readonly frame: GloryFrame;
  readonly pack: string;
  /** L'ancre du blason, où la frappe se rejoue ; `null` : le cadre n'en déclare pas. */
  readonly crest: Rect | null;
  /** La mise en page du bandeau de parrainage dans la boîte que le cadre déclare ; `null` : ce cadre n'a pas de bandeau. */
  readonly bannerLayout: (rtl: boolean) => BannerLayout | null;
  /** Peint en pixels de l'IMAGE FINALE (`frame.formats.story.size`) : un canvas plus petit applique l'échelle avant d'appeler. */
  readonly paint: (ctx: PaintContext, input: GlorySceneInput) => void;
  /** Rend la mémoire des couches : en quittant le déroulé, en changeant de cadre, après l'image finale. */
  readonly close: () => void;
};

export type GloryStep = {
  readonly stepId: string;
  readonly atmosphere: GloryAtmosphere | null;
  readonly lastChosen: string | null;
};

/** Le catalogue de la session : relu au plus toutes les `CATALOG_TTL_MS`, pour que l'aperçu et l'image finale lisent le même. */
const CATALOG_TTL_MS = 60_000;
let cached: { readonly at: number; readonly catalog: Promise<GloryCatalog> } | null = null;

const storeDeps = (): PackAssetStoreDeps => ({ origin: apiOrigin() });

/** Le magasin des packs reste un chunk à part (`packs_store`, `dynamic_only`) : la scène l'atteint par `import()`, comme la boutique. */
const packStore = () => import('@/lib/packs/pack-asset-store');

function sessionCatalog(now = Date.now()): Promise<GloryCatalog> {
  if (cached !== null && now - cached.at < CATALOG_TTL_MS) return cached.catalog;
  const store = storeDeps();
  const catalog = loadGloryCatalog({
    installed: () => loadInstalledFramePacks(apiDeps),
    detail: (slug) => loadFramePack(apiDeps, slug),
    readJson: async (ref) => (await packStore()).readPackAssetJson(ref, store),
  });
  cached = { at: now, catalog };
  return catalog;
}

/** Oublie le catalogue de la session (après une installation, un changement d'atmosphère). */
export const forgetGloryCatalog = (): void => {
  cached = null;
};

const resized = (box: { readonly width: number; readonly height: number }, scale: number): ImageBitmapOptions =>
  scale >= 1 ? {} : { resizeWidth: Math.max(1, Math.round(box.width * scale)), resizeHeight: Math.max(1, Math.round(box.height * scale)), resizeQuality: 'medium' };

const rasterEnv = { createImage: () => new Image(), createObjectUrl: (blob: Blob) => URL.createObjectURL(blob), revokeObjectUrl: (url: string) => URL.revokeObjectURL(url) };

/** Les dépendances du navigateur : le magasin sans réseau pour lire, le magasin avec réseau pour demander. */
export function browserGloryAssetDeps(): GloryAssetDeps {
  const store = storeDeps();
  return {
    read: async (ref) => {
      const { bucketOnly, readPackAssetBlob } = await packStore();
      return readPackAssetBlob(ref, bucketOnly(store));
    },
    request: (refs) => void packStore().then(({ warmPackAssets }) => warmPackAssets(refs, store)).catch(() => undefined),
    decode: (blob, box, scale) => createImageBitmap(blob, resized(box, scale)),
    rasterSticker: async (markup, size): Promise<ClosableImage | null> => {
      const image = await rasterizeSvg(markup, rasterEnv);
      return image === null ? null : createImageBitmap(image, { resizeWidth: size, resizeHeight: size });
    },
    stickerMarkup: (sticker) => {
      const found = findMeeSticker(sticker);
      return found === undefined ? null : renderMeeSticker(found, { uid: `glory-${sticker}`, animated: false, size: 512 });
    },
    ...(typeof document === 'undefined' ? {} : { fonts: document.fonts }),
  };
}

/** Le cadre que la loi retient pour cette étape, dans le catalogue de la session ; `null` : carte simple. */
export async function gloryFrameFor(step: GloryStep): Promise<GloryFramePick | null> {
  try {
    return pickGloryFrame(await sessionCatalog(), step);
  } catch {
    return null;
  }
}

export type OpenSceneParams = {
  readonly pick: GloryFramePick;
  readonly texts: GloryTexts;
  readonly pose: GloryRecipe['pose'];
  /** 1 pour l'image finale ; 0,5 pour l'aperçu (couches décodées à demi-résolution). */
  readonly scale: number;
  readonly deps?: GloryAssetDeps;
};

const sceneOf = (pick: GloryFramePick, images: GloryFrameImages, texts: GloryTexts): GloryScene => ({
  frame: pick.frame,
  pack: pick.pack.slug,
  crest: pick.frame.formats.story.crest === null ? null : rectOf(pick.frame.formats.story.crest.box),
  bannerLayout: (rtl) => {
    const { banner, size } = pick.frame.formats.story;
    return banner === null ? null : bannerWithin(rectOf(banner.box), size[0], rtl);
  },
  paint: (ctx, input) =>
    paintGloryFrame(ctx, {
      format: pick.frame.formats.story,
      layers: images.layers,
      birds: images.birds,
      texts,
      recipe: input.recipe,
      photo: input.photo,
      art: input.art,
      palette: input.palette,
      fontFamily: input.fontFamily,
      rtl: input.rtl,
      language: input.language,
      scratch: input.scratch,
      ...(input.banner === undefined ? {} : { banner: input.banner }),
    }),
  close: images.close,
});

/** Ouvre la scène d'un cadre PRÊT ; `null` dès qu'une couche manque (demandée au magasin), sans attendre. */
export async function openGloryScene(params: OpenSceneParams): Promise<GloryScene | null> {
  try {
    const images = await loadGloryFrameImages(params.pick.frame.formats.story, params.pose, params.deps ?? browserGloryAssetDeps(), params.scale);
    return images === null ? null : sceneOf(params.pick, images, params.texts);
  } catch {
    return null;
  }
}
