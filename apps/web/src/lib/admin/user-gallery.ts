import type { AdminMedia } from '@/lib/api/admin-user-media';

/**
 * **LES IMAGES D'UN MEMBRE** (#7845) — ce que le carrousel de la fiche
 * montre, dans cet ordre : sa photo, sa bannière, puis les images qu'il a
 * publiées ou envoyées, les plus récentes d'abord (l'ordre servi par
 * `GET /admin/users/:userId/media`).
 *
 * Un média PROTÉGÉ (vue unique, flouté, éphémère) reste une DIAPOSITIVE : la
 * passerelle a retiré ses URL, et le carrousel doit pouvoir dire « cette
 * image existe et ne se montre pas » plutôt que la faire disparaître.
 */
export type GallerySlide =
  | { readonly kind: 'avatar' | 'banner'; readonly id: string; readonly url: string }
  | { readonly kind: 'media'; readonly id: string; readonly url: string | null; readonly media: AdminMedia };

const estImage = (media: AdminMedia) => media.mimeType.startsWith('image/');

export function gallerySlidesOf(params: {
  readonly avatar: string;
  readonly banner: string;
  readonly medias: readonly AdminMedia[];
}): readonly GallerySlide[] {
  const profil: readonly GallerySlide[] = [
    ...(params.avatar.trim() === '' ? [] : [{ kind: 'avatar' as const, id: 'avatar', url: params.avatar }]),
    ...(params.banner.trim() === '' ? [] : [{ kind: 'banner' as const, id: 'banner', url: params.banner }]),
  ];
  const images = params.medias
    .filter(estImage)
    .map((media): GallerySlide => ({ kind: 'media', id: media.id, url: media.isProtected ? null : (media.fileUrl ?? media.thumbnailUrl), media }));
  return [...profil, ...images];
}

/** L'index suivant, en boucle — un carrousel qui bute sur ses bords oblige à revenir en arrière. */
export const stepSlide = (index: number, pas: number, taille: number): number =>
  taille === 0 ? 0 : (((index + pas) % taille) + taille) % taille;
