import { lazy, Suspense, useMemo } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Message } from '@/lib/api/types';
import { browserFileDeliveryHost, hasFileDeliveryDoor } from '@/lib/media/file-delivery-host';
import { participantAvatarOf } from '@/lib/view/conversation';
import type { MediaCarrier } from '@/lib/view/media';
import { mediaHubViewerOf, type MediaHubItem } from '@/lib/view/media-hub';
import { attachmentSendRequest, mediaPageOffers, type MediaViewerCapabilities } from '@/lib/view/viewer-page-offers';
import { isMineOf } from '@/lib/view/message';

import { revealedAttachment } from './view-once-opened';

const MediaViewer = lazy(() => import('./media-viewer'));

/**
 * LA VISIONNEUSE CONVERSATION-ENTIÈRE (#6303, #8103) — l'hôte que partagent
 * l'aperçu de la feuille de détails et l'écran « Médias, liens et documents ».
 *
 * La liste est l'index VISUEL chargé (la même requête que la grille), dans
 * l'ordre de la grille ; la page ouverte est la tuile touchée. Quand on
 * approche du bout, l'hôte demande la page suivante de l'index — la liste
 * s'allonge par la FIN, la page courante ne bouge pas. Le porteur (auteur,
 * date) suit chaque page ; la légende n'est pas remise : ce n'est pas une
 * seconde descente du Prisme qu'on ouvrirait ici.
 *
 * La pièce touchée s'ouvre en clair si elle était floutée (#8008) — elle
 * seule : ses voisines gardent leur substitut dans la visionneuse.
 *
 * LES ACTIONS (#8180, #8884) — Enregistrer, Réagir, Partager, Créer avec ce média, décidées
 * page par page par `mediaPageOffers` sur la pièce ORIGINALE (jamais sa copie
 * révélée). Pas « Répondre » : l'écran ne tient pas le composeur du fil
 * (iOS `MediaHubGalleryCover` non plus) — loi 4, un contrôle existe s'il a un
 * effet. Réagir se relit dans l'index (`patchMediaHubMessages`).
 */
export function carrierOfMessage(message: Message): MediaCarrier {
  const displayName = message.sender?.displayName;
  const createdAt = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt as unknown as string);
  return {
    sender:
      displayName !== undefined && displayName !== ''
        ? { displayName, avatarUrl: participantAvatarOf(message.sender) ?? null }
        : null,
    sentAt: createdAt.toISOString(),
    caption: null,
  };
}

export function MediaHubViewerHost({
  items,
  openedKey,
  viewerId,
  languages,
  canExtend,
  onExtend,
  onClose,
  deps,
  container,
}: {
  readonly items: readonly MediaHubItem[];
  readonly openedKey: string;
  readonly viewerId: string;
  readonly languages: readonly string[];
  readonly canExtend: boolean;
  readonly onExtend: () => void;
  readonly onClose: () => void;
  readonly deps?: ConversationsDeps;
  /** Le `<dialog>` de la feuille hôte — la visionneuse doit s'y poser (couche supérieure). */
  readonly container?: Element | null;
}) {
  const viewer = useMemo(() => mediaHubViewerOf(items, openedKey), [items, openedKey]);
  const messages = useMemo(
    () => items.flatMap((item) => (item.kind === 'visual' ? [item.message] : [])),
    [items],
  );
  const capabilities = useMemo<MediaViewerCapabilities>(
    () => ({ save: hasFileDeliveryDoor(browserFileDeliveryHost()), react: true, reply: false, compose: true, share: true }),
    [],
  );
  const shown = viewer.items.map((attachment, index) => (index === viewer.startIndex ? revealedAttachment(attachment) : attachment));

  return (
    <Suspense fallback={null}>
      <MediaViewer
        items={shown}
        startIndex={viewer.startIndex}
        onClose={onClose}
        languages={languages}
        fallbackLanguage={messages[viewer.startIndex]?.originalLanguage ?? languages[0] ?? 'fr'}
        carrierAt={(index) => {
          const message = messages[index];
          return message === undefined ? undefined : carrierOfMessage(message);
        }}
        isMineAt={(index) => {
          const message = messages[index];
          return message !== undefined && isMineOf(message, viewerId);
        }}
        onNearEnd={() => {
          if (canExtend) onExtend();
        }}
        actionsAt={(index) => {
          const attachment = viewer.items[index];
          const message = messages[index];
          if (attachment === undefined || message === undefined) return null;
          const offers = mediaPageOffers({ attachment, message, capabilities });
          return {
            attachment,
            messageId: message.id,
            conversationId: message.conversationId,
            offers,
            ...(offers.share ? { share: attachmentSendRequest({ attachment, message, mine: isMineOf(message, viewerId) }) } : {}),
          };
        }}
        {...(deps === undefined ? {} : { deps })}
        {...(container === undefined ? {} : { container })}
      />
    </Suspense>
  );
}
