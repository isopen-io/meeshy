/**
 * **LE FORMAT D'UNE IMAGE D'IDENTITÉ** (#17256, jumelle de `EntityImageFormat`
 * iOS, #17251) — l'avatar est un rond 1:1, la bannière un bandeau 3:1. La
 * retouche de la capture (le studio en `retouch`) s'ouvre à ce format : la
 * scène en prend les proportions, et l'image rendue les tient exactement.
 *
 * La taille rendue est celle que la recompression garde au plus
 * (`image-recompress.ts` : 1500 px de large pour la bannière) ; l'avatar
 * repart à 1080 px, la recompression le ramène à 512.
 */
export type EntityImageFormat = 'avatar' | 'banner';

const ASPECT: Readonly<Record<EntityImageFormat, number>> = { avatar: 1, banner: 3 };

const RENDER_SIZE: Readonly<Record<EntityImageFormat, { readonly width: number; readonly height: number }>> = {
  avatar: { width: 1080, height: 1080 },
  banner: { width: 1500, height: 500 },
};

export const entityImageAspect = (format: EntityImageFormat): number => ASPECT[format];

export const entityImageRenderSize = (format: EntityImageFormat): { readonly width: number; readonly height: number } => RENDER_SIZE[format];
