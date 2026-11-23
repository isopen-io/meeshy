/**
 * LE LIEN D'UN CONTENU MEESHY (#19331) — un post, un réel, une story ou une humeur.
 *
 * Une seule table dit quelles adresses désignent un contenu, et un seul parseur les lit :
 * la passerelle pour l'aperçu des robots (#3673), le web pour la carte vivante d'une
 * conversation (#19334). Miroirs, mêmes vecteurs de test : `ContentLinkTarget.swift`
 * (MeeshySDK, #19332) et `ContentLinkTarget.kt` (`:core:model`, #19333).
 *
 * Deux formes :
 * - l'adresse DIRECTE d'un contenu (`/post|reel|story|mood/<id>`, et les anciennes
 *   `/feeds/post/<id>`, `/p/<id>`, `/s/<id>`) : l'identifiant se lit dans l'adresse ;
 * - le lien SUIVI `/l/<jeton>` que frappe la feuille de partage : sa cible se résout
 *   par la passerelle (`GET /tracking-links/:token/resolve`), elle seule sait si c'est
 *   un contenu, une invitation ou un site.
 *
 * Fail-closed : un autre hôte, un autre schéma que `https`, des identifiants ou un port
 * dans l'adresse, un segment de plus, ou un identifiant qui n'est pas un ObjectId ne
 * lisent rien.
 */

import { isValidObjectId } from './object-id.js';

export type ContentKind = 'POST' | 'REEL' | 'STORY' | 'STATUS';

/** Les hôtes de l'application web, en production comme en staging. */
export const MEESHY_WEB_HOSTS: ReadonlySet<string> = new Set(['meeshy.me', 'www.meeshy.me', 'staging.meeshy.me']);

/** Le chemin web de chaque type, celui que frappe le partage suivi (`PostService.shareWithTrackingLink`). */
export const CONTENT_WEB_PATHS: Readonly<Record<ContentKind, string>> = {
  POST: 'post',
  REEL: 'reel',
  STORY: 'story',
  STATUS: 'mood',
};

/** Le type qu'annonce chaque chemin ; `null` : une forme ancienne, dont le type se lit sur le contenu. */
const PATH_KINDS: ReadonlyMap<string, ContentKind | null> = new Map<string, ContentKind | null>([
  ...Object.entries(CONTENT_WEB_PATHS).map(([kind, segment]) => [segment, kind as ContentKind] as const),
  ['feeds/post', null],
  ['p', null],
  ['s', 'STORY'],
]);

const CONTENT_PATH = /^\/((?:feeds\/)?[a-z]+)\/([^/]+)\/?$/;
const TRACKED_PATH = /^\/l\/([A-Za-z0-9_-]{2,50})\/?$/;

export type ContentPathTarget = { readonly postId: string; readonly type: ContentKind | null };

export type ContentLinkTarget =
  | ({ readonly kind: 'content' } & ContentPathTarget)
  | { readonly kind: 'tracked'; readonly token: string };

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONTENT_WEB_PATHS, value);
}

/** Le contenu qu'un CHEMIN désigne, sans hôte : la forme que la passerelle lit sur `originalUrl`. */
export function contentPathTarget(pathname: string): ContentPathTarget | null {
  const match = CONTENT_PATH.exec(pathname);
  if (match === null) return null;
  const [, segment = '', postId = ''] = match;
  if (!PATH_KINDS.has(segment) || !isValidObjectId(postId)) return null;
  return { postId, type: PATH_KINDS.get(segment) ?? null };
}

const parseMeeshyUrl = (link: string): URL | null => {
  try {
    const url = new URL(link.trim());
    const plain = url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === '';
    return plain && MEESHY_WEB_HOSTS.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
};

export function contentLinkTarget(link: string): ContentLinkTarget | null {
  const url = parseMeeshyUrl(link);
  if (url === null) return null;
  const direct = contentPathTarget(url.pathname);
  if (direct !== null) return { kind: 'content', ...direct };
  const token = TRACKED_PATH.exec(url.pathname)?.[1];
  return token === undefined ? null : { kind: 'tracked', token };
}

/** L'adresse canonique d'un contenu sous une origine (`https://meeshy.me`). */
export function contentWebUrl(origin: string, type: ContentKind, postId: string): string {
  return `${origin.replace(/\/+$/, '')}/${CONTENT_WEB_PATHS[type]}/${postId}`;
}
