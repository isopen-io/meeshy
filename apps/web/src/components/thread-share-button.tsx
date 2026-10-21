import { lazy, Suspense } from 'react';

import { CHROME_ACTION_HIT_CLASS } from './chrome-action';
import type { PortailPartage } from '@/lib/view/invitation';
import { useConversationShareLink } from '@/lib/view/public-conversation-link';

const ThreadShareControl = lazy(() => import('./thread-share-control').then((m) => ({ default: m.ThreadShareControl })));

/**
 * **PARTAGER LA CONVERSATION, À CÔTÉ DE SON AVATAR** (#10206) — la porte :
 * sans clé de lien connue (`useConversationShareLink`), aucun bouton. Avec
 * une clé, le geste (`ThreadShareControl`) se charge à part, et sa place de
 * 44 px est tenue dès le premier rendu : l'en-tête ne bouge pas quand il
 * arrive.
 */
export function ThreadShareButton({
  conversation,
  title,
  portail,
}: {
  readonly conversation: { readonly id: string; readonly identifier?: string | null | undefined };
  readonly title: string;
  /** Injecté par les témoins ; l'application passe par le navigateur. */
  readonly portail?: PortailPartage;
}) {
  const link = useConversationShareLink(conversation);
  if (link === null) return null;
  return (
    <Suspense fallback={<span className={CHROME_ACTION_HIT_CLASS} aria-hidden="true" />}>
      <ThreadShareControl link={link} title={title} portail={portail} />
    </Suspense>
  );
}
