import type { ContentTrackingLink } from '@meeshy/shared/types/post';
import { contentLinkTarget, type ContentKind, type ContentLinkTarget, type ContentPathTarget } from '@meeshy/shared/utils/content-link';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';

import { conversationLinksIn, type ConversationLinkContext, type ConversationLinkTarget } from './conversation-link';
import type { TrackingResolution } from './tracking-redirect';
import { writtenHrefsOf } from './written-hrefs';

/**
 * **LE LIEN D'UN CONTENU DEVIENT SA CARTE** (#19334, parapluie #19331) — un
 * lien Meeshy vers une publication, un réel, une story ou une humeur, reçu dans
 * une conversation ou écrit dans une publication, se déplie en carte VIVANTE.
 *
 * La reconnaissance n'est pas écrite ici : `contentLinkTarget`
 * (`@meeshy/shared/utils/content-link`) est la loi unique, partagée avec la
 * passerelle, et ses miroirs Swift et Kotlin portent les mêmes vecteurs. Ce
 * module dit seulement ce que le web en fait :
 *
 * - le texte lu est l'ORIGINAL (une URL ne se traduit pas), et une URL que la
 *   passerelle a rendue traçable s'y lit sous son adresse écrite
 *   (`writtenHrefsOf`) — le jeton frappé depuis un message ne dit pas sa cible ;
 * - un lien suivi `/l/<jeton>` (celui des feuilles de partage) n'est un contenu
 *   qu'une fois RÉSOLU (`contentOfTrackingResolution`) : jusque-là c'est un
 *   candidat, et le suivant prend sa place s'il ne désigne pas un contenu ;
 * - UNE carte par message : la carte de conversation passe avant (#8099), puis
 *   le premier lien de contenu (`linkEmbedOf`).
 */

/** Au-delà, un texte qui aligne des liens suivis paierait une résolution par lien pour une seule carte. */
export const CONTENT_CARD_CANDIDATES = 3;

export type ContentLinkCandidates = readonly ContentLinkTarget[];

const candidateKey = (target: ContentLinkTarget): string => (target.kind === 'content' ? `content:${target.postId}` : `tracked:${target.token}`);

/**
 * Les liens de contenu d'un texte, dans l'ordre du texte, chacun une fois, au
 * plus {@link CONTENT_CARD_CANDIDATES}. `excludePostId` : la publication qui
 * porte le texte ne se cite pas elle-même.
 */
export function contentLinksIn(
  text: string,
  options: { readonly trackingLinks?: readonly ContentTrackingLink[] | undefined; readonly excludePostId?: string },
): ContentLinkCandidates {
  if (!text.includes('/')) return [];
  const targets = writtenHrefsOf(text, options.trackingLinks).flatMap((href): readonly ContentLinkTarget[] => {
    const target = contentLinkTarget(href);
    if (target === null || (target.kind === 'content' && target.postId === options.excludePostId)) return [];
    return [target];
  });
  const unique = targets.filter((target, index) => targets.findIndex((other) => candidateKey(other) === candidateKey(target)) === index);
  return unique.slice(0, CONTENT_CARD_CANDIDATES);
}

/**
 * CE QUE DÉSIGNE UN LIEN SUIVI, UNE FOIS RÉSOLU (`GET tracking-links/:token/resolve`) :
 * un contenu si la passerelle nomme une cible typée dont l'identifiant est un
 * ObjectId ; à défaut (un jeton frappé depuis le texte d'un message porte la
 * cible `EXTERNAL`), si son adresse d'origine est elle-même l'adresse DIRECTE
 * d'un contenu, par la même loi. Une invitation, un site ou un autre lien
 * suivi ne le sont pas : la carte n'existe pas, le comportement existant reste.
 */
export function contentOfTrackingResolution(resolution: TrackingResolution): ContentPathTarget | null {
  if (resolution.kind !== 'tracking') return null;
  const typed = resolution.content;
  if (typed != null && isValidObjectId(typed.id)) return { postId: typed.id, type: typed.type };
  const written = resolution.originalUrl === null ? null : contentLinkTarget(resolution.originalUrl);
  return written?.kind === 'content' ? { postId: written.postId, type: written.type } : null;
}

export type LinkEmbed =
  | { readonly kind: 'conversation'; readonly targets: readonly ConversationLinkTarget[] }
  | { readonly kind: 'content'; readonly candidates: ContentLinkCandidates };

/**
 * LA CARTE QU'UN MESSAGE MONTE SOUS SON TEXTE — une seule, par préséance : la
 * carte de conversation (#8099), puis celle du premier lien de contenu. Le web
 * n'a ni façade vidéo ni aperçu générique de lien : sans l'une ni l'autre, le
 * lien reste dans le texte, tel quel.
 */
export function linkEmbedOf(text: string, context: ConversationLinkContext): LinkEmbed | null {
  const targets = conversationLinksIn(text, context);
  if (targets.length > 0) return { kind: 'conversation', targets };
  const candidates = contentLinksIn(text, { trackingLinks: context.trackingLinks });
  return candidates.length > 0 ? { kind: 'content', candidates } : null;
}

const CONTENT_ROUTE = { POST: 'post', REEL: 'reel', STORY: 'story', STATUS: 'mood' } as const satisfies Record<ContentKind, string>;

export type ContentRouteKey = (typeof CONTENT_ROUTE)[ContentKind] | 'postDeepLink';

/**
 * LA PORTE DU CONTENU, celle de la table des routes : le détail d'une
 * publication, le lecteur de réels, la visionneuse de story, la page de
 * l'humeur — et, d'un type inconnu (`/feeds/post/<id>`, `/p/<id>`), le détail.
 */
export function contentRouteOf(type: ContentKind | null): ContentRouteKey {
  return type === null ? 'postDeepLink' : CONTENT_ROUTE[type];
}
