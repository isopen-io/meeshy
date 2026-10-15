import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';
import { designTileSvg, designToSvg, type AppearanceScheme } from '@meeshy/shared/utils/appearance-svg';

/**
 * **CE QUE LE FOND DU FIL PEINT** (#10631, § 8.1) — le modèle de vue PUR : de
 * l'apparence choisie, du schéma et de l'accent EFFECTIF, la couche à poser.
 * Le dessin vient de `designToSvg` / `designTileSvg` (`@meeshy/shared`), jamais
 * d'un second peintre ; ce module n'écrit aucun balisage.
 *
 * - `signature` : le fond d'origine, que le CSS peint — rien à ajouter ;
 * - `solid` / `design` : un `background` posé en ligne sur la couche ;
 * - `photo` : l'image, son flou et son voile, que le composant pose en couches.
 */
export type BackdropStyle = {
  readonly backgroundColor: string;
  readonly backgroundImage?: string;
  readonly backgroundSize?: string;
  readonly backgroundRepeat?: string;
  readonly backgroundPosition?: string;
};

export type BackdropView =
  | { readonly kind: 'signature' }
  | { readonly kind: 'solid'; readonly style: BackdropStyle }
  | { readonly kind: 'design'; readonly style: BackdropStyle; readonly flipInRtl: boolean }
  | { readonly kind: 'photo'; readonly src: string; readonly blur: number; readonly veil: number; readonly veilColor: string };

const SCENE_WIDTH = 360;
const SCENE_HEIGHT = 760;
const ROTATED_SIDE = 1200;
const CACHE_LIMIT = 32;
const REDUCED_TRANSPARENCY_VEIL = 0.6;
/** Le voile est le fond primaire d'iOS (`MeeshyColors.backgroundPrimary(isDark:)` : `#09090B` / `#FFFFFF`), en composantes RVB. */
const VEIL_RGB: Readonly<Record<AppearanceScheme, string>> = { dark: '9, 9, 11', light: '255, 255, 255' };

const cache = new Map<string, BackdropStyle>();

const dataUrl = (svg: string): string => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

function paintDesign(design: AppearanceDesign, scheme: AppearanceScheme, accent: string): BackdropStyle {
  const base = design.palettes[scheme].base;
  const args = { design, scheme, accent };
  if (design.tile !== undefined && design.tile.rotation === 0) {
    const { width, height, scale } = design.tile;
    return {
      backgroundColor: base,
      backgroundImage: dataUrl(designTileSvg(args)),
      backgroundSize: `${width * scale}px ${height * scale}px`,
      backgroundRepeat: 'repeat',
    };
  }
  const rotated = design.tile !== undefined;
  const svg = designToSvg({ ...args, width: rotated ? ROTATED_SIDE : SCENE_WIDTH, height: rotated ? ROTATED_SIDE : SCENE_HEIGHT });
  return {
    backgroundColor: base,
    backgroundImage: dataUrl(svg),
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: design.scene?.anchor === 'bottom-end' ? 'right bottom' : design.scene === undefined ? 'center' : 'center bottom',
  };
}

/** Mémoïsé par `(pack, modèle, schéma, accent)` dans un cache BORNÉ à 32 entrées (§ 8.1). */
export function designStyle(args: { readonly pack: string; readonly design: AppearanceDesign; readonly scheme: AppearanceScheme; readonly accent: string }): BackdropStyle {
  const key = `${args.pack}/${args.design.key}|${args.scheme}|${args.accent.toUpperCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const style = paintDesign(args.design, args.scheme, args.accent);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, style);
  return style;
}

export const designStyleCacheSize = (): number => cache.size;

export function backdropViewOf(args: {
  readonly appearance: ConversationAppearance;
  readonly scheme: AppearanceScheme;
  readonly accent: string;
  /** Le modèle du pack, ou `undefined` s'il n'est pas (encore) connu : Signature, jamais une erreur. */
  readonly design: AppearanceDesign | undefined;
  /** L'image de la pièce jointe, ou `undefined` si elle n'est plus lisible : Signature (§ 11). */
  readonly photoSrc: string | undefined;
  readonly reducedTransparency?: boolean;
}): BackdropView {
  const { appearance, scheme, accent, design, photoSrc } = args;
  const { background } = appearance;
  switch (background.kind) {
    case 'signature':
      return { kind: 'signature' };
    case 'solid':
      return { kind: 'solid', style: { backgroundColor: APPEARANCE_GAMUT[background.color][scheme].surface } };
    case 'design':
      return design === undefined
        ? { kind: 'signature' }
        : { kind: 'design', style: designStyle({ pack: background.pack, design, scheme, accent }), flipInRtl: design.scene?.anchor === 'bottom-end' };
    case 'photo':
      return photoSrc === undefined
        ? { kind: 'signature' }
        : {
            kind: 'photo',
            src: photoSrc,
            blur: background.blur,
            veil: args.reducedTransparency === true ? Math.max(background.veil, REDUCED_TRANSPARENCY_VEIL) : background.veil,
            veilColor: VEIL_RGB[scheme],
          };
  }
}
