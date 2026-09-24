import type { AdminMedia } from '@/lib/api/admin-user-media';
import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **LES IMAGES D'UN MEMBRE, EN UNE LISTE** (#7845 F) — la source PURE du
 * carrousel de sa fiche d'administration.
 *
 * ## L'ordre dit ce que l'image EST
 *
 * La photo de profil d'abord, la bannière ensuite — les deux images que le
 * membre a choisies pour se PRÉSENTER —, puis celles qu'il a publiées ou
 * envoyées, dans l'ordre de récence servi par `GET …/media`. Aucun historique
 * d'avatar n'existe dans le schéma : le carrousel ne montre que l'état présent.
 *
 * ## Ce qui n'y entre JAMAIS
 *
 * - Un média PROTÉGÉ (`isProtected`) : la passerelle a déjà vidé ses URL. Le
 *   montrer vide dirait « image cassée » là où la vérité est « secret » ; la
 *   liste des médias, elle, sait le dire (`admin.media.protected`).
 * - Ce qui n'est pas une image (`mimeType` hors `image/`) : un carrousel
 *   d'images qui lance une vidéo n'est plus un carrousel.
 * - Un doublon : une photo de profil reprise en bannière, ou republiée, ne
 *   compte qu'une fois — la comparaison se fait sur l'URL RÉSOLUE, la seule qui
 *   dise si deux adresses désignent le même fichier.
 *
 * ## Les URL passent par `attachmentSrc`
 *
 * La passerelle sert des clés nues, des chemins relatifs et des adresses
 * héritées ; `attachmentSrc` (`lib/api/media-url.ts`) est le SITE UNIQUE qui
 * les résout — le même que l'avatar de l'application. Recomposer ici une base
 * ferait charger l'image depuis l'origine du document, où le SPA répond du HTML.
 */
export type AdminUserImageKind = 'avatar' | 'banner' | 'media';

export type AdminUserImage = {
  readonly id: string;
  readonly src: string;
  readonly thumb: string;
  readonly kind: AdminUserImageKind;
  /** Le nom du FICHIER pour un média, le nom du MEMBRE pour ses deux images de
   * présentation — l'écran compose l'annonce avec le libellé traduit de `kind`. */
  readonly label: string;
};

export type AdminUserImageOwner = {
  readonly displayName: string;
  readonly avatar: string;
  readonly banner: string | null;
};

export function userImagesOf(membre: AdminUserImageOwner, medias: readonly AdminMedia[]): readonly AdminUserImage[] {
  const presentation: readonly AdminUserImage[] = [
    { id: 'avatar', url: membre.avatar, kind: 'avatar' as const },
    { id: 'banner', url: membre.banner ?? '', kind: 'banner' as const },
  ]
    .filter((image) => image.url !== '')
    .map((image) => {
      const src = attachmentSrc(image.url);
      return { id: image.id, src, thumb: src, kind: image.kind, label: membre.displayName };
    });

  const publiees: readonly AdminUserImage[] = medias
    .filter((m) => !m.isProtected && m.mimeType.startsWith('image/') && m.fileUrl !== null && m.fileUrl !== '')
    .map((m) => {
      const src = attachmentSrc(m.fileUrl ?? '');
      const thumb = m.thumbnailUrl === null || m.thumbnailUrl === '' ? src : attachmentSrc(m.thumbnailUrl);
      return { id: m.id, src, thumb, kind: 'media' as const, label: m.originalName };
    });

  return [...presentation, ...publiees].filter(
    (image, rang, toutes) => toutes.findIndex((autre) => autre.src === image.src) === rang,
  );
}
