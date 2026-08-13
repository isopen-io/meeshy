import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import {
  buildLastMessagePreviewTranslations,
  truncateMessagePreview,
} from '../../routes/conversations/utils/last-message-preview';

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
  /**
   * Le texte du dernier message, c'est-à-dire l'aperçu SERVI au lecteur dont le
   * prisme ne rend aucune traduction — la règle #1. Il appartient donc à cette
   * fonction au même titre que la carte : les deux sont deux issues du MÊME
   * résolveur, et c'est ce qui les oblige au même plafond.
   */
  readonly content?: string | null;
  readonly translations?: unknown;
  readonly originalLanguage?: string | null;
}

export interface LastMessagePreviewPrism {
  readonly lastMessagePreview: string | null;
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
 *
 * Rend AUSSI `lastMessagePreview`, plafonné. Les trois émetteurs temps réel le
 * composaient chacun de leur côté (`message.content`, `latest?.content ?? null`)
 * et aucun ne passait par `truncateMessagePreview` — alors que la carte de
 * traductions du MÊME payload y passe, et que la liste REST y passe aussi. Le
 * plafond dépendait donc de la langue du lecteur : servi par une traduction on
 * recevait 300 points de code, servi par l'original on recevait le message
 * entier. Le rendre ici est ce qui rend la paire indissociable — un appelant ne
 * peut plus émettre la moitié plafonnée sans l'autre.
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
    // `?? null` sur le RÉSULTAT de la troncature, jamais avant : un message
    // position-seule a un `content` VIDE que le client compose depuis
    // `location`, et `'' ?? null` vaut `''` — le forcer à `null` ferait
    // disparaître sa ligne d'aperçu.
    lastMessagePreview: truncateMessagePreview(message?.content) ?? null,
    lastMessageOriginalLanguage: message?.originalLanguage ?? null,
    lastMessageTranslations: buildLastMessagePreviewTranslations({
      translations: message?.translations,
      originalLanguage: message?.originalLanguage,
      viewerLanguages,
    }),
  };
}
