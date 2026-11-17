/**
 * L'adresse web d'un contenu du fil, par son type (#19418) : `/post`, `/reel`,
 * `/story`, `/mood` — les pages que le web sert et que l'app iOS revendique en
 * Universal Link. Site UNIQUE : le partage suivi (`shareWithTrackingLink`) et
 * la création d'un lien de suivi vers une cible choisie la composent ici.
 */
export type PostWebType = 'POST' | 'REEL' | 'STORY' | 'STATUS';

const WEB_PATH: Readonly<Record<PostWebType, string>> = { POST: 'post', REEL: 'reel', STORY: 'story', STATUS: 'mood' };

export const isPostWebType = (type: string): type is PostWebType => Object.hasOwn(WEB_PATH, type);

export const postWebUrl = (baseUrl: string, type: string, postId: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/${isPostWebType(type) ? WEB_PATH[type] : 'feeds/post'}/${postId}`;
