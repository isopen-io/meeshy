import type { ContentTrackingLink } from '@meeshy/shared/types/post';
import { segmentText, type TextSegment } from '@meeshy/shared/utils/text-segments';

import { internalPathOf, type InternalLinkContext } from './internal-link';

/**
 * **LES ADRESSES D'UNE CONVERSATION DANS UN MESSAGE** (#8099) — ce qui fait
 * d'un lien écrit une CARTE de conversation.
 *
 * Deux familles, les formes que les clients émettent et qu'iOS reconnaît
 * (`ShareLinkModels.swift`, `DeepLinkRouter`) :
 * - le lien de PARTAGE, `/chat/<lien>` (et `/join/<lien>`, accepté par iOS) —
 *   sa carte dit ce que le lien autorise déjà, à tout lecteur ;
 * - le lien DIRECT, `/c/<conversation>` — sa carte n'est servie qu'à un
 *   MEMBRE ; à tout autre, la passerelle répond comme pour un id inexistant.
 *
 * `/l/<jeton>` est un lien de SUIVI, jamais une conversation. Un hôte étranger
 * n'est jamais lu, même au même chemin : c'est `internalPathOf` qui décide
 * qu'une adresse est Meeshy, la même loi que le rendu des liens.
 */

export type ConversationLinkTarget = {
  readonly kind: 'share-link' | 'direct';
  readonly identifier: string;
};

/** UNE carte par message, comme iOS (`BubbleLinkEmbed.swift` : la première
 * URL seulement) — au-delà, un message qui aligne des liens deviendrait un mur
 * de cartes. */
export const CONVERSATION_CARDS_PER_MESSAGE = 1;

const SHARE_PATH = /^\/(?:chat|join)\/([^/?#]+)\/?$/u;
const DIRECT_PATH = /^\/c\/([^/?#]+)\/?$/u;

const decoded = (segment: string): string | null => {
  try {
    const value = decodeURIComponent(segment).trim();
    return value === '' ? null : value;
  } catch {
    return null;
  }
};

/** La conversation qu'un chemin in-app désigne, ou `null`. */
export function conversationLinkOfPath(pathWithQuery: string): ConversationLinkTarget | null {
  const path = pathWithQuery.split(/[?#]/u)[0] ?? '';
  const share = SHARE_PATH.exec(path)?.[1];
  if (share !== undefined) {
    const identifier = decoded(share);
    return identifier === null ? null : { kind: 'share-link', identifier };
  }
  const direct = DIRECT_PATH.exec(path)?.[1];
  if (direct !== undefined) {
    const identifier = decoded(direct);
    return identifier === null ? null : { kind: 'direct', identifier };
  }
  return null;
}

export type ConversationLinkContext = InternalLinkContext & {
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
};

const hrefsOf = (segments: readonly TextSegment[]): readonly string[] =>
  segments.flatMap((segment): readonly string[] => {
    if (segment.kind === 'emphasis') return hrefsOf(segment.children);
    if (segment.kind === 'url') return [segment.href];
    if (segment.kind === 'tracked-link' && segment.url !== null) return [segment.url];
    return [];
  });

/**
 * Les conversations qu'un texte désigne, dans l'ordre du texte, chacune une
 * fois, au plus {@link CONVERSATION_CARDS_PER_MESSAGE}.
 */
export function conversationLinksIn(text: string, context: ConversationLinkContext): readonly ConversationLinkTarget[] {
  if (!text.includes('/')) return [];
  const appPathOrJoin = (path: string): boolean => context.isAppPath(path) || SHARE_PATH.test(path);
  const segments = segmentText(text, {
    hashtags: false,
    mentions: [],
    ...(context.trackingLinks === undefined ? {} : { trackingLinks: context.trackingLinks }),
  });
  const targets = hrefsOf(segments).flatMap((href) => {
    const path = internalPathOf(href, { origins: context.origins, isAppPath: appPathOrJoin });
    const target = path === null ? null : conversationLinkOfPath(path);
    return target === null ? [] : [target];
  });
  const unique = targets.filter(
    (target, index) => targets.findIndex((other) => other.kind === target.kind && other.identifier === target.identifier) === index,
  );
  return unique.slice(0, CONVERSATION_CARDS_PER_MESSAGE);
}
