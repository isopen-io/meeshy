import type { ContentTrackingLink } from '@meeshy/shared/types/post';
import { isTrackingToken, type EmphasisStyle, type InlineSegment, type TextSegment } from '@meeshy/shared/utils/text-segments';

/**
 * **UN LIEN S'ÉCRIT DE QUATRE FAÇONS, ET UNE SEULE LOI LES REND** (#9093).
 *
 * | écrit                   | affiché        | cible                                         |
 * |-------------------------|----------------|-----------------------------------------------|
 * | `[[https://x]]`         | `https://x`    | `https://x` direct, sans suivi, pour tous     |
 * | `[libellé](https://x)`  | `libellé`      | `/l/<token>` si la carte l'a, sinon direct    |
 * | `https://x` brut        | `m+<token>`    | `/l/<token>` si la carte l'a, sinon direct    |
 * | `m+<token>` historique  | `m+<token>`    | `/l/<token>`                                  |
 *
 * Le contenu n'est JAMAIS réécrit : tout se décide ici, au rendu, depuis la
 * carte `trackingLinks` que la passerelle publie à côté du texte. Jumelle iOS :
 * `LinkDisplayLaw.resolve` (`packages/MeeshySDK/.../Models/LinkDisplayLaw.swift`).
 */
export type WrittenLink =
  | { readonly form: 'verbatim'; readonly url: string }
  | { readonly form: 'labelled'; readonly label: string; readonly url: string }
  | { readonly form: 'bare'; readonly text: string; readonly url: string }
  | { readonly form: 'short'; readonly token: string };

export type LinkDisplay =
  | { readonly text: string; readonly href: string; readonly tracked: true; readonly token: string }
  | { readonly text: string; readonly href: string; readonly tracked: false };

const tracked = (text: string, token: string): LinkDisplay => ({ text, href: `/l/${token}`, tracked: true, token });
const direct = (text: string, href: string): LinkDisplay => ({ text, href, tracked: false });

const tokenFor = (url: string, trackingLinks: readonly ContentTrackingLink[] | undefined): string | undefined =>
  trackingLinks?.find((link) => link.url === url && isTrackingToken(link.token))?.token;

export function resolveLinkDisplay(
  link: WrittenLink,
  trackingLinks: readonly ContentTrackingLink[] | undefined,
): LinkDisplay {
  switch (link.form) {
    case 'verbatim':
      return direct(link.url, link.url);
    case 'short':
      return tracked(`m+${link.token}`, link.token);
    case 'labelled': {
      const token = tokenFor(link.url, trackingLinks);
      return token === undefined ? direct(link.label, link.url) : tracked(link.label, token);
    }
    case 'bare': {
      const token = tokenFor(link.url, trackingLinks) ?? tokenFor(link.text, trackingLinks);
      return token === undefined ? direct(link.text, link.url) : tracked(`m+${token}`, token);
    }
  }
}

/** Ce que le rendu peint : le découpage partagé, dont chaque lien a été lu par la loi. */
export type DisplaySegment =
  | Exclude<InlineSegment, { readonly kind: 'url' } | { readonly kind: 'tracked-link' }>
  | { readonly kind: 'link'; readonly display: LinkDisplay }
  | { readonly kind: 'emphasis'; readonly style: EmphasisStyle; readonly children: readonly DisplaySegment[] };

type LinkSegment = Extract<InlineSegment, { readonly kind: 'url' } | { readonly kind: 'tracked-link' }>;

const isLink = (segment: TextSegment | undefined): segment is LinkSegment =>
  segment?.kind === 'url' || segment?.kind === 'tracked-link';

/** Une adresse écrite telle quelle (pas un libellé) — seule candidate au `[[ ]]`. */
const isBareAddress = (segment: LinkSegment): boolean =>
  segment.kind === 'tracked-link' ? segment.url !== null : segment.text === segment.href || `https://${segment.text}` === segment.href;

const writtenFormOf = (segment: LinkSegment): WrittenLink => {
  if (segment.kind === 'tracked-link') {
    return segment.url === null ? { form: 'short', token: segment.token } : { form: 'bare', text: segment.text, url: segment.url };
  }
  return isBareAddress(segment)
    ? { form: 'bare', text: segment.text, url: segment.href }
    : { form: 'labelled', label: segment.text, url: segment.href };
};

const textOf = (segment: TextSegment | undefined): string | null => (segment?.kind === 'text' ? segment.text : null);

/** `[[` juste avant, `]]` juste après, autour d'une adresse écrite telle quelle. */
const isVerbatimAt = (segments: readonly TextSegment[], index: number): boolean => {
  const segment = segments[index];
  return (
    isLink(segment) &&
    isBareAddress(segment) &&
    (textOf(segments[index - 1])?.endsWith('[[') ?? false) &&
    (textOf(segments[index + 1])?.startsWith(']]') ?? false)
  );
};

export function displaySegments(
  segments: readonly TextSegment[],
  trackingLinks: readonly ContentTrackingLink[] | undefined,
): readonly DisplaySegment[] {
  const verbatim = new Set(segments.flatMap((_, index) => (isVerbatimAt(segments, index) ? [index] : [])));
  return segments.flatMap((segment, index): readonly DisplaySegment[] => {
    if (segment.kind === 'emphasis') {
      return [{ kind: 'emphasis', style: segment.style, children: displaySegments(segment.children, trackingLinks) }];
    }
    if (isLink(segment)) {
      const written: WrittenLink = verbatim.has(index)
        ? { form: 'verbatim', url: segment.kind === 'url' ? segment.href : (segment.url ?? segment.text) }
        : writtenFormOf(segment);
      return [{ kind: 'link', display: resolveLinkDisplay(written, trackingLinks) }];
    }
    if (segment.kind !== 'text') return [segment];
    const head = verbatim.has(index + 1) ? segment.text.slice(0, -2) : segment.text;
    const text = verbatim.has(index - 1) ? head.slice(2) : head;
    return text === '' ? [] : [{ kind: 'text', text }];
  });
}
