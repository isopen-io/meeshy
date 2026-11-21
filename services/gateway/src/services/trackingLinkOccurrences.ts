/**
 * Les écritures d'un lien dans un contenu (#9093), extraites de
 * `TrackingLinkService` : la LECTURE du texte, sans base ni état.
 */

const RAW_URL_SOURCE = String.raw`https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)`;

/**
 * Les écritures d'un lien, lues dans l'ordre du texte (#9093). À une même
 * position, la plus longue gagne : `[[url]]` (groupe absent : jamais suivi),
 * `[libellé](url)` (groupe 1 : suivi par la carte, jamais réécrit) puis l'URL
 * brute (groupe 2). Sans cette lecture, la détection brute attrapait l'adresse
 * d'un `[[…]]` et emportait la parenthèse fermante d'un lien markdown.
 */
export const LINK_WRITINGS_SOURCE = String.raw`\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\)|(${RAW_URL_SOURCE})`;

export type LinkOccurrence = { readonly url: string; readonly raw: boolean };

export function linkOccurrences(content: string): LinkOccurrence[] {
  return [...content.matchAll(new RegExp(LINK_WRITINGS_SOURCE, 'gi'))].flatMap((match): LinkOccurrence[] => {
    if (match[1]) return [{ url: match[1], raw: false }];
    if (match[2]) return [{ url: match[2], raw: true }];
    return [];
  });
}
