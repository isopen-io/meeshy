import type { ContentTrackingLink } from '@meeshy/shared/types/post';
import { segmentText, type TextSegment } from '@meeshy/shared/utils/text-segments';

/**
 * **LES ADRESSES ÉCRITES DANS UN TEXTE, DANS L'ORDRE DU TEXTE** (#8099, #19334)
 * — la lecture que partagent la carte de conversation (`conversation-link.ts`)
 * et la carte de contenu (`content-link.ts`) : le découpage partagé
 * (`segmentText`), dont on garde chaque lien sous l'adresse que son auteur a
 * ÉCRITE.
 *
 * Une URL brute que la passerelle a rendue traçable reste lue sous son adresse
 * d'ORIGINE (`url`), jamais sous `/l/<jeton>` : le jeton frappé depuis le texte
 * d'un message ne dit pas sa cible, l'adresse écrite la dit. Un `m+<jeton>` n'a
 * plus d'adresse (`url: null`) et ne compte pas. Ni mention ni hashtag ne sont
 * cherchés : seuls les liens intéressent une carte.
 */
const hrefsOf = (segments: readonly TextSegment[]): readonly string[] =>
  segments.flatMap((segment): readonly string[] => {
    if (segment.kind === 'emphasis') return hrefsOf(segment.children);
    if (segment.kind === 'url') return [segment.href];
    if (segment.kind === 'tracked-link' && segment.url !== null) return [segment.url];
    return [];
  });

export function writtenHrefsOf(text: string, trackingLinks: readonly ContentTrackingLink[] | undefined): readonly string[] {
  return hrefsOf(
    segmentText(text, {
      hashtags: false,
      mentions: [],
      ...(trackingLinks === undefined ? {} : { trackingLinks }),
    }),
  );
}
