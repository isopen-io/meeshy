import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { buildLastMessagePreviewTranslations } from '../../routes/conversations/utils/last-message-preview';

/**
 * Le fragment `select` Prisma que TOUT émetteur d'aperçu de ligne de liste doit
 * charger sur ses participants.
 *
 * `user` n'est pas décoratif : sans lui il n'y a aucun prisme à résoudre et la
 * carte de traductions sort systématiquement `null` — c'est-à-dire le défaut
 * d'avant, avec un champ de plus sur le fil. Le laisser ici plutôt qu'inline
 * dans chaque appelant est ce qui empêche les deux émetteurs jumeaux
 * (`emitConversationPreviewUpdate` pour l'édition/suppression,
 * `MeeshySocketIOManager._broadcastNewMessage` pour l'envoi) de diverger — et
 * l'aperçu de redevenir dépendant du transport.
 */
export const PREVIEW_PRISM_PARTICIPANT_SELECT = {
  id: true,
  userId: true,
  user: {
    select: {
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true,
      deviceLocale: true,
    },
  },
} as const;

export interface PreviewPrismParticipant {
  readonly id: string;
  readonly userId: string | null;
  /**
   * `null` pour un invité de lien partagé — il n'a pas de ligne `User`, donc
   * aucune préférence de langue. Son prisme est vide et il reçoit la carte
   * `null` : l'original, ce qui est exactement la règle #1 du Prisme.
   */
  readonly user?: {
    readonly systemLanguage?: string | null;
    readonly regionalLanguage?: string | null;
    readonly customDestinationLanguage?: string | null;
    readonly deviceLocale?: string | null;
  } | null;
}

export interface PreviewPrismMessage {
  readonly translations?: unknown;
  readonly originalLanguage?: string | null;
}

export interface LastMessagePreviewPrism {
  readonly lastMessageTranslations: Record<string, string> | null;
  readonly lastMessageOriginalLanguage: string | null;
}

/**
 * Les deux champs de Prisme que `conversation:updated` doit porter, résolus
 * POUR UN destinataire.
 *
 * Pourquoi par destinataire et non une fois par conversation : la carte servie
 * est déjà filtrée aux langues du lecteur par
 * `buildLastMessagePreviewTranslations` (exclusion #1 de son doc-comment).
 * Deux participants de prismes différents n'ont donc pas la même carte, et un
 * payload unique partagé par la room en servirait un des deux à contre-emploi.
 * La boucle par participant existait déjà dans les deux émetteurs — elle
 * envoyait simplement le même objet à tout le monde.
 *
 * Rend délibérément `{ lastMessageTranslations: null }` plutôt que d'omettre la
 * clé : c'est ce `null` REÇU (et non déduit) qui permet au client de périmer
 * une carte devenue fausse. Une édition remet `Message.translations` à null dans
 * la même écriture que le nouveau contenu (`routes/messages.ts`), tout en
 * gardant le MÊME `lastMessageId` — aucune heuristique client ne peut trancher
 * ce cas, et un vidage inconditionnel casserait le chemin d'envoi (cycle 65).
 */
export function resolveLastMessagePreviewPrism(
  participant: PreviewPrismParticipant,
  message: PreviewPrismMessage | null | undefined,
): LastMessagePreviewPrism {
  const prefs = participant.user;
  const viewerLanguages = prefs
    ? resolveUserLanguagesOrdered(prefs, { deviceLocale: prefs.deviceLocale ?? undefined })
    : [];

  return {
    lastMessageOriginalLanguage: message?.originalLanguage ?? null,
    lastMessageTranslations: buildLastMessagePreviewTranslations({
      translations: message?.translations,
      originalLanguage: message?.originalLanguage,
      viewerLanguages,
    }),
  };
}
