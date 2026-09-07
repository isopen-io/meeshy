import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import type { LastMessagePreviewAttachment } from '@meeshy/shared/types/socketio-events/conversation';
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

/**
 * L'horodatage du groupe d'aperçu, sous la forme que le CONTRAT énonce : une
 * chaîne ISO, comme `updatedAt` son jumeau dans le même payload.
 *
 * Les trois émetteurs passaient l'objet `Date` de Prisma. Sur le fil la
 * différence ne se voyait pas — la passerelle n'installe aucun parseur
 * socket.io personnalisé, donc l'encodeur est `JSON.stringify`, qui rend
 * exactement `toISOString()`. Ce que ça coûtait est ailleurs : `lastMessageAt`
 * était le seul horodatage du payload dont le type était décidé par l'encodeur
 * au lieu d'être énoncé, si bien que tout témoin en cours de route attestait
 * une `Date` là où les trois clients reçoivent une chaîne.
 *
 * Ici plutôt que trois fois : c'est le même groupe d'aperçu, et un quatrième
 * émetteur qui l'écrirait à la main rouvrirait l'écart que ce lot ferme.
 *
 * Une chaîne passe telle quelle — ce chemin sert des messages dont le
 * `createdAt` a déjà traversé une frontière JSON (agent, retour du traducteur).
 * La revalider ici la rejetterait sans rien avoir de mieux à mettre à la place.
 *
 * Une `Date` INVALIDE rend `null`, parce que `toISOString()` LÈVE sur elle : un
 * aperçu ne vaut pas de faire tomber une diffusion, et les clients traitent
 * l'horodatage absent comme « je ne compose pas de ligne » — exactement la
 * bonne issue.
 */
export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
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

/**
 * Le `select` Prisma minimal de l'AUTEUR d'un message, pour le sous-groupe
 * MÉDIA de l'aperçu (#3737). Miroir de `PREVIEW_PRISM_PARTICIPANT_SELECT`
 * pour une autre question : celle-ci résout la langue du LECTEUR, celle-ci
 * résout le NOM de l'auteur — même schéma minimal (local → compte lié) que
 * `resolveParticipantDisplayName`.
 */
export const PREVIEW_MEDIA_SENDER_SELECT = {
  displayName: true,
  user: { select: { displayName: true } },
} as const;

/**
 * Le `select` Prisma d'une pièce jointe d'aperçu — identique aux champs de
 * `conversationLastMessagePreviewSelect.attachments.select`
 * (`routes/conversations/core-selects.ts`), délibérément sans `fileUrl` : une
 * ligne de liste ne rend jamais le fichier, seulement sa vignette. Les deux
 * `select` ne peuvent pas s'importer l'un l'autre (l'un vit sous `routes/`,
 * l'autre sous `socketio/`) ; un témoin de parité les confronte champ par
 * champ plutôt que de les fusionner en une dépendance croisée.
 */
export const PREVIEW_MEDIA_ATTACHMENT_SELECT = {
  id: true,
  mimeType: true,
  thumbnailUrl: true,
  originalName: true,
  fileSize: true,
  duration: true,
  width: true,
  height: true,
} as const;

export interface PreviewMediaSender {
  readonly displayName?: string | null;
  readonly user?: { readonly displayName?: string | null } | null;
}

/**
 * Forme d'ENTRÉE d'une pièce jointe — délibérément plus permissive que
 * `LastMessagePreviewAttachment` (le contrat de SORTIE) : le site Prisma
 * capé (`emitConversationPreviewUpdate`, `select: { take: 1, … }`) rend des
 * `string | null` ; le `Message` partagé que portent les deux autres
 * émetteurs (`MessageHandler`, `postMessageSyncFanOut` — chargé par
 * `attachments: true`, NI capé NI `select`-restreint) rend des
 * `string | undefined` sur une liste complète. Une seule fonction accepte
 * les deux plutôt que d'exiger de chaque appelant qu'il normalise avant
 * d'appeler — c'est cette normalisation-là, oubliée à un site, qui a laissé
 * `location` manquer sur un seul émetteur (#3122).
 */
export interface PreviewMediaAttachmentInput {
  readonly id: string;
  readonly mimeType: string;
  readonly thumbnailUrl?: string | null;
  readonly originalName?: string | null;
  readonly fileSize?: number | null;
  readonly duration?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
}

export interface PreviewMediaMessage {
  readonly sender?: PreviewMediaSender | null;
  /**
   * PAS nécessairement plafonnée à l'entrée — `resolvePreviewMediaFields` la
   * plafonne lui-même à la première, pour que le plafond soit un fait de CETTE
   * fonction et non une convention que chaque appelant doit respecter de son
   * côté. `_count`, quand il est fourni, reste la source du COMPTE ; sinon le
   * compte se lit sur cette liste avant plafonnage.
   */
  readonly attachments?: readonly PreviewMediaAttachmentInput[];
  readonly _count?: { readonly attachments?: number } | null;
  readonly isBlurred?: boolean | null;
  readonly isViewOnce?: boolean | null;
  readonly expiresAt?: Date | string | null;
}

export interface PreviewMediaFields {
  readonly lastMessageSenderName: string | null;
  readonly lastMessageAttachments: readonly LastMessagePreviewAttachment[];
  readonly lastMessageAttachmentCount: number;
  readonly lastMessageIsBlurred: boolean;
  readonly lastMessageIsViewOnce: boolean;
  readonly lastMessageExpiresAt: string | null;
}

/**
 * Le sous-groupe MÉDIA du groupe d'aperçu (#3737) : auteur, première pièce
 * jointe + compte total, drapeaux éphémères — voir le doc-comment du champ
 * `lastMessageSenderName` sur `ConversationUpdatedEventData` pour la règle de
 * groupe complète.
 *
 * Séparée de `resolveLastMessagePreviewPrism` plutôt qu'ajoutée dedans : ces
 * six champs décrivent le MESSAGE lui-même, identiques pour toute la room —
 * contrairement à la carte du Prisme, filtrée aux langues de CHAQUE lecteur.
 * Une fonction par-viewer qui rendrait aussi ce sous-groupe le recalculerait
 * une fois par destinataire pour une valeur qui ne change jamais entre eux.
 *
 * `null` / valeurs par défaut plutôt qu'omission de clé : même convention que
 * `location`, posé par le même appelant que `lastMessageId` — l'absence sur
 * ce groupe dit « rien à signaler », jamais « je ne sais pas ».
 */
export function resolvePreviewMediaFields(
  message: PreviewMediaMessage | null | undefined,
): PreviewMediaFields {
  const attachments = message?.attachments ?? [];
  return {
    lastMessageSenderName: resolveParticipantDisplayName(message?.sender ?? null),
    // Plafonnée ICI, à la sortie — pas une convention que chaque appelant
    // doit respecter à l'entrée. `emitConversationPreviewUpdate` capait déjà
    // sa requête Prisma à `take: 1` (optimisation légitime, conservée) ; les
    // deux autres émetteurs chargent le `Message` partagé, dont
    // `attachments` porte la liste COMPLÈTE.
    lastMessageAttachments: attachments.slice(0, 1).map(normalizePreviewAttachment),
    lastMessageAttachmentCount: Math.max(message?._count?.attachments ?? 0, attachments.length),
    lastMessageIsBlurred: message?.isBlurred ?? false,
    lastMessageIsViewOnce: message?.isViewOnce ?? false,
    lastMessageExpiresAt: toIsoOrNull(message?.expiresAt ?? null),
  };
}

function normalizePreviewAttachment(attachment: PreviewMediaAttachmentInput): LastMessagePreviewAttachment {
  return {
    id: attachment.id,
    mimeType: attachment.mimeType,
    thumbnailUrl: attachment.thumbnailUrl ?? null,
    originalName: attachment.originalName ?? null,
    fileSize: attachment.fileSize ?? null,
    duration: attachment.duration ?? null,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
  };
}
