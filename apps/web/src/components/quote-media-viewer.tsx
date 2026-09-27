import { lazy, useContext } from 'react';

import type { Attachment, Message } from '@/lib/api/types';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';

import { carrierOfMessage } from './media-hub-viewer-host';
import MediaViewer from './media-viewer';

/* À LA DEMANDE, jamais statique (`budgets.json` › `thread_media_viewer.dynamic_only`) :
   hors du fil, ce chunk-ci n'a pas à le tirer. La `Suspense` de l'hôte le couvre. */
const ThreadMediaViewer = lazy(() => import('./thread-media-viewer'));

/**
 * LE PLEIN ÉCRAN D'UNE PIÈCE CITÉE (#8233) — chunk À LA DEMANDE, chargé au
 * toucher de l'aperçu d'une citation, comme la visionneuse l'est au toucher
 * d'une tuile.
 *
 * Dans le fil (`ThreadMediaContext` prêté), c'est la visionneuse de TOUTE la
 * conversation, ouverte sur la pièce citée, avec ses actions — le même
 * plateau qu'au toucher de la tuile elle-même (iOS : `onMediaTap`). Hors du
 * fil, la visionneuse seule sur cette pièce. Dans les deux cas, la pièce vient
 * de la citation, jamais d'une recherche dans les messages chargés : elle
 * s'ouvre même quand le message cité est hors de la fenêtre.
 */
export default function QuoteMediaViewer({
  quote,
  attachment,
  languages,
  onClose,
}: {
  readonly quote: Message;
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly onClose: () => void;
}) {
  const thread = useContext(ThreadMediaContext);
  if (thread !== null && typeof quote.conversationId === 'string' && quote.conversationId !== '') {
    return (
      <ThreadMediaViewer
        opened={quote}
        openedVisual={[attachment]}
        startIndex={0}
        viewerId={thread.viewerId}
        onReplyToMedia={thread.onReplyToMedia}
        onClose={onClose}
        languages={languages}
        fallbackLanguage={quote.originalLanguage}
      />
    );
  }
  return (
    <MediaViewer
      items={[attachment]}
      startIndex={0}
      onClose={onClose}
      languages={languages}
      fallbackLanguage={quote.originalLanguage}
      carrier={carrierOfMessage(quote)}
    />
  );
}
