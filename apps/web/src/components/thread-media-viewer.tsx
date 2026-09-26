import { useMemo } from 'react';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import type { Attachment, Message } from '@/lib/api/types';
import { browserFileDeliveryHost, hasFileDeliveryDoor } from '@/lib/media/file-delivery-host';
import type { MediaCarrier } from '@/lib/view/media';
import { mediaPageOffers, type MediaViewerCapabilities } from '@/lib/view/media-viewer-actions';
import { isMineOf } from '@/lib/view/message';
import { threadMediaEntriesOf } from '@/lib/view/thread-media-list';
import { useMediaHubIndex } from '@/lib/view/use-media-hub-index';

import { carrierOfMessage } from './media-hub-viewer-host';
import MediaViewer from './media-viewer';
import { revealedAttachment } from './view-once-opened';

/**
 * LA VISIONNEUSE CONVERSATION-ENTIÈRE, OUVERTE DEPUIS LE FIL (#6303) — chunk
 * À LA DEMANDE (chargé au tap sur une tuile, comme la visionneuse elle-même).
 *
 * La liste vient de `threadMediaEntriesOf` : l'index SERVEUR (même requête et
 * même cache que l'écran des médias, D-130), plus les pièces de la bulle
 * touchée, dans l'ordre du fil. Cache froid ⇒ la visionneuse s'ouvre AUSSITÔT
 * sur la pellicule du message, puis grandit autour de la page ouverte ; à
 * l'approche du DÉBUT (les plus anciens), l'hôte demande la page d'index
 * suivante — la visionneuse suit sa page par identité.
 *
 * Les quatre actions (Enregistrer, Réagir, Répondre, Créer avec ce média) sont
 * décidées page par page par `mediaPageOffers`, sur la pièce ORIGINALE.
 */
export default function ThreadMediaViewer({
  opened,
  openedVisual,
  startIndex,
  viewerId,
  languages,
  displayLanguage,
  fallbackLanguage,
  carrier,
  deps,
  onClose,
  onReplyToMedia,
}: {
  readonly opened: Message;
  readonly openedVisual: readonly Attachment[];
  readonly startIndex: number;
  readonly viewerId: string;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly carrier?: MediaCarrier;
  readonly deps?: ConversationsDeps;
  readonly onClose: () => void;
  readonly onReplyToMedia: (messageId: string, attachmentId: string) => void;
}) {
  const index = useMediaHubIndex({ deps: deps ?? apiDeps, conversationId: opened.conversationId, kind: 'visual', term: null });
  const indexMessages = index.query.data;
  const entries = useMemo(
    () => threadMediaEntriesOf({ opened, openedVisual, indexMessages: indexMessages ?? [] }),
    [opened, openedVisual, indexMessages],
  );
  const openedId = openedVisual[startIndex]?.id;
  const start = Math.max(0, entries.findIndex((entry) => entry.attachment.id === openedId));
  const items = useMemo(
    () =>
      entries.map((entry) =>
        entry.attachment.id === openedId && maskedAttachment(entry.attachment) ? revealedAttachment(entry.attachment) : entry.attachment,
      ),
    [entries, openedId],
  );
  const capabilities = useMemo<MediaViewerCapabilities>(
    () => ({ save: hasFileDeliveryDoor(browserFileDeliveryHost()), react: true, reply: true, compose: true }),
    [],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = index.query;

  return (
    <MediaViewer
      items={items}
      startIndex={start}
      onClose={onClose}
      languages={languages}
      fallbackLanguage={fallbackLanguage}
      {...(displayLanguage !== undefined ? { displayLanguage } : {})}
      carrierAt={(at) => {
        const message = entries[at]?.message;
        if (message === undefined) return undefined;
        return message.id === opened.id && carrier !== undefined ? carrier : carrierOfMessage(message);
      }}
      isMineAt={(at) => {
        const message = entries[at]?.message;
        return message !== undefined && isMineOf(message, viewerId);
      }}
      onNearStart={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      actionsAt={(at) => {
        const entry = entries[at];
        if (entry === undefined) return null;
        const offers = mediaPageOffers({ attachment: entry.attachment, message: entry.message, capabilities });
        return {
          attachment: entry.attachment,
          messageId: entry.message.id,
          conversationId: entry.message.conversationId,
          offers,
          onReply: () => {
            onClose();
            onReplyToMedia(entry.message.id, entry.attachment.id);
          },
        };
      }}
      {...(deps !== undefined ? { deps } : {})}
    />
  );
}
