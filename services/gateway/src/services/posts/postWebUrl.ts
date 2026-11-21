/**
 * L'adresse web d'un contenu du fil, par son type (#19418) : `/post`, `/reel`,
 * `/story`, `/mood` — les pages que le web sert et que l'app iOS revendique en
 * Universal Link. Site UNIQUE côté passerelle : le partage suivi
 * (`shareWithTrackingLink`) et la création d'un lien de suivi vers une cible
 * choisie la composent ici ; la table des chemins est la loi partagée
 * `@meeshy/shared/utils/content-link` (#19331), que les trois clients relisent.
 */
import { contentWebUrl, isContentKind, type ContentKind } from '@meeshy/shared/utils/content-link';

export type PostWebType = ContentKind;

export const isPostWebType = (type: string): type is PostWebType => isContentKind(type);

export const postWebUrl = (baseUrl: string, type: string, postId: string): string =>
  isContentKind(type) ? contentWebUrl(baseUrl, type, postId) : `${baseUrl.replace(/\/+$/, '')}/feeds/post/${postId}`;
