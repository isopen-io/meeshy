import { useMemo } from 'react';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { CaptureShieldOver } from '@/lib/capture/use-capture-shield';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import type { Attachment, Message } from '@/lib/api/types';
import { browserFileDeliveryHost, hasFileDeliveryDoor } from '@/lib/media/file-delivery-host';
import type { MediaCarrier } from '@/lib/view/media';
import { attachmentSendRequest, mediaPageOffers, type MediaViewerCapabilities } from '@/lib/view/viewer-page-offers';
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
 * Les cinq actions (Enregistrer, Réagir, Répondre, Partager, Créer avec ce média) sont
 * décidées page par page par `mediaPageOffers`, sur la pièce ORIGINALE.
 */
const NO_LIFTED_IDS: ReadonlySet<string> = new Set();

export default function ThreadMediaViewer({
  opened,
  openedVisual,
  liftedIds = NO_LIFTED_IDS,
  startIndex,
  viewerId,
  languages,
  displayLanguage,
  fallbackLanguage,
  carrier,
  deps,
  onClose,
  onReplyToMedia,
  kind = 'visual',
  openedIsQuote = false,
}: {
  /** `opened` est une CITATION, pas un message du fil : sa nature doit être déclarée pour que sa pièce sorte (#9573). */
  readonly openedIsQuote?: boolean;
  /** Les vocaux de la conversation (#8333) plutôt que ses images et vidéos — même plateau, page audio. */
  readonly kind?: 'visual' | 'audio';
  readonly opened: Message;
  readonly openedVisual: readonly Attachment[];
  /**
   * LES PIÈCES DE LA BULLE QU'UNE RÉVÉLATION A LEVÉES (#8389) — un flou révélé
   * sur place montre toutes ses pièces en clair ; la visionneuse les montre
   * de même. Les actions restent décidées sur la pièce ORIGINALE.
   */
  readonly liftedIds?: ReadonlySet<string>;
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
  const index = useMediaHubIndex({ deps: deps ?? apiDeps, conversationId: opened.conversationId, kind, term: null });
  const indexMessages = index.query.data;
  const entries = useMemo(
    () => threadMediaEntriesOf({ opened, openedVisual, indexMessages: indexMessages ?? [], kind }),
    [opened, openedVisual, indexMessages, kind],
  );
  const openedId = openedVisual[startIndex]?.id;
  const start = Math.max(0, entries.findIndex((entry) => entry.attachment.id === openedId));
  const items = useMemo(
    () =>
      entries.map((entry) =>
        (entry.attachment.id === openedId || (entry.message.id === opened.id && liftedIds.has(entry.attachment.id))) &&
        maskedAttachment(entry.attachment)
          ? revealedAttachment(entry.attachment)
          : entry.attachment,
      ),
    [entries, openedId, opened.id, liftedIds],
  );
  const capabilities = useMemo<MediaViewerCapabilities>(
    () => ({ save: hasFileDeliveryDoor(browserFileDeliveryHost()), react: true, reply: true, compose: true, share: true }),
    [],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = index.query;

  /* « Annoncé ou noir » (#9617) : aucune page de la visionneuse n'est déclarée à une capture. */
  const shown = useMemo(() => entries.map((entry) => entry.message), [entries]);
  return (
    <>
      <CaptureShieldOver messages={shown} viewerId={viewerId} />
      {openedIsQuote ? <CaptureShieldOver messages={[opened]} viewerId={viewerId} quoted /> : null}
      <MediaViewer
        items={items}
        startIndex={start}
        onClose={onClose}
        languages={languages}
        fallbackLanguage={fallbackLanguage}
        {...(displayLanguage !== undefined ? { displayLanguage } : {})}
        fallbackLanguageAt={(at) => entries[at]?.message.originalLanguage}
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
          const now = Date.now();
          const quoted = openedIsQuote && entry.message.id === opened.id;
          const offers = mediaPageOffers({ attachment: entry.attachment, message: entry.message, capabilities, now, quoted });
          return {
            attachment: entry.attachment,
            messageId: entry.message.id,
            conversationId: entry.message.conversationId,
            offers,
            ...(offers.share
              ? { share: attachmentSendRequest({ attachment: entry.attachment, message: entry.message, mine: isMineOf(entry.message, viewerId), now, quoted }) }
              : {}),
            onReply: () => {
              onClose();
              onReplyToMedia(entry.message.id, entry.attachment.id);
            },
          };
        }}
        {...(deps !== undefined ? { deps } : {})}
      />
    </>
  );
}
