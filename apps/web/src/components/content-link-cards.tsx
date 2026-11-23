import { useMemo } from 'react';

import type { ContentTrackingLink } from '@meeshy/shared/types/post';

import { apiDeps } from '@/lib/api/deps';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { contentLinksIn, type ContentLinkCandidates } from '@/lib/links/content-link';
import { useReaderLanguages } from '@/lib/view/use-reader';

import { ContentLinkSlot } from './content-link-card';

/**
 * **LES HÔTES DE LA CARTE D'UN CONTENU** (#19334) — ils donnent à la carte le
 * Prisme du lecteur, la langue d'interface et le port de l'application. Un
 * texte sans lien de contenu ne monte rien et ne s'abonne à rien : le Prisme
 * n'est lu que par l'hôte intérieur, monté seulement quand un candidat existe
 * (motif `ConversationLinkCards`).
 */
export function ContentLinkCards({ candidates, excludePostId }: { readonly candidates: ContentLinkCandidates; readonly excludePostId?: string }) {
  const { languages } = useReaderLanguages();
  return (
    <ContentLinkSlot
      candidates={candidates}
      deps={apiDeps}
      language={currentInterfaceLanguage()}
      readerLanguages={languages}
      {...(excludePostId === undefined ? {} : { excludePostId })}
    />
  );
}

/**
 * LA CARTE SOUS LE TEXTE D'UNE PUBLICATION — à la place qu'iOS donne à la
 * façade vidéo (`FeedPostEmbedRow`), sur la carte du fil comme sur le détail.
 * Le texte lu est l'ORIGINAL (une URL ne se traduit pas). Jamais la carte de la
 * publication elle-même, et la carte n'affiche pas les liens de son propre
 * texte : jamais une carte dans une carte.
 */
export function PostContentLinkCard({
  postId,
  text,
  trackingLinks,
  className,
}: {
  readonly postId: string;
  readonly text: string;
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
  /** Les marges de la carte du fil — posées seulement quand un lien de contenu existe. */
  readonly className?: string;
}) {
  const candidates = useMemo(() => contentLinksIn(text, { trackingLinks, excludePostId: postId }), [text, trackingLinks, postId]);
  if (candidates.length === 0) return null;
  return (
    <div className={className}>
      <ContentLinkCards candidates={candidates} excludePostId={postId} />
    </div>
  );
}
