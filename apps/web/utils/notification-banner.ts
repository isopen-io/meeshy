/**
 * **Une bannière doit dire CE QUI vient d'arriver.**
 *
 * Le toast n'affichait que l'auteur et le contenu : un commentaire sur un réel,
 * une réaction à une story et la publication d'une humeur donnaient toutes
 * trois « elvira ndjiki » / « super ! » (signalé par le porteur produit,
 * 2026-08-30).
 *
 * Miroir web de `NotificationBannerPresentation` (iOS,
 * `packages/MeeshySDK/Sources/MeeshySDK/Notifications/`). Les sept cadrages :
 *
 * | cas | titre | corps |
 * |---|---|---|
 * | commentaire de contenu | X a commenté une story / un réel / un post | vignette + commentaire |
 * | nouvelle publication | X a publié un réel / une humeur / un post / une story | vignette + contenu |
 * | message privé | X | message |
 * | message de groupe | X dans « nom du groupe » | message / média / indicateur |
 * | relation acceptée | X a accepté votre demande | — |
 * | demande de relation | X veut se connecter | — |
 * | réaction à un contenu | X a réagi à votre story / … / commentaire | vignette + réaction |
 *
 * **La phrase d'action vient du SERVEUR** (`buildNotificationDisplay`, i18n
 * serveur à la langue résolue du destinataire) et n'est jamais réécrite ici :
 * le repli client n'existe que pour les lignes anciennes et les types que le
 * builder serveur ne couvre pas.
 */

import {
  NotificationTypeEnum,
  type Notification,
} from '@/types/notification';
import {
  buildNotificationTitle,
  formatMessagePreview,
  getActorDisplayName,
} from './notification-helpers';

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

export type NotificationBanner = {
  /** Ligne 1 : QUI, et QUOI. Jamais vide. */
  readonly headline: string;
  /** Ligne 2 : la charge. `null` quand la ligne 1 se suffit. */
  readonly body: string | null;
  /** La réaction, rendue COMME une réaction — `null` si la phrase la porte déjà. */
  readonly reactionBadge: string | null;
  /** Vignette du contenu visé. `null` ⇒ la bannière pose son icône typée. */
  readonly thumbnailUrl: string | null;
};

/**
 * Les trois familles de cadrage. Le TYPE décide, jamais la forme des champs :
 * sur le fil temps réel `subtitle` porte le nom du GROUPE pour un message et la
 * PHRASE D'ACTION pour tout le reste — deux sens pour un champ, et seul le type
 * les sépare.
 */
type BannerFraming = 'conversation' | 'relation' | 'action';

const CONVERSATION_TYPES = new Set<string>([
  NotificationTypeEnum.NEW_MESSAGE,
  NotificationTypeEnum.MESSAGE_REPLY,
  NotificationTypeEnum.USER_MENTIONED,
  NotificationTypeEnum.MESSAGE_REACTION,
]);

const RELATION_TYPES = new Set<string>([
  NotificationTypeEnum.CONTACT_REQUEST,
  NotificationTypeEnum.CONTACT_ACCEPTED,
  NotificationTypeEnum.FRIEND_REQUEST,
  NotificationTypeEnum.FRIEND_ACCEPTED,
]);

const REACTION_TYPES = new Set<string>([
  NotificationTypeEnum.MESSAGE_REACTION,
  NotificationTypeEnum.POST_LIKE,
  NotificationTypeEnum.STORY_REACTION,
  NotificationTypeEnum.STATUS_REACTION,
  NotificationTypeEnum.COMMENT_LIKE,
  NotificationTypeEnum.COMMENT_REACTION,
]);

export function notificationBannerFraming(notification: Notification): BannerFraming {
  const type = typeof notification.type === 'string' ? notification.type : '';
  if (CONVERSATION_TYPES.has(type)) return 'conversation';
  if (RELATION_TYPES.has(type)) return 'relation';
  return 'action';
}

/**
 * `metadata` est une union discriminée dont aucun membre ne porte toutes les
 * clés lues ici. On la relit comme un enregistrement de valeurs INCONNUES puis
 * on valide chaque champ — jamais `as any`, qui rendrait `string` une valeur
 * dont on ne sait rien.
 */
const readString = (source: unknown, key: string): string | null => {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const nonBlank = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Résumé média d'un contenu sans texte — le corps de repli quand l'extrait
 * manque et que la phrase d'action occupe déjà le titre.
 */
function mediaSummary(notification: Notification, t: TranslateFunction): string | null {
  switch (readString(notification.metadata, 'mediaType')?.toLowerCase()) {
    case 'image': return t('attachments.photo');
    case 'video': return t('attachments.video');
    case 'audio': return t('attachments.audio');
    default: return null;
  }
}

/**
 * Le titre de la bannière.
 *
 * Deux cadrages coexistent sur le champ `title`, et le discriminant est
 * l'égalité avec le nom de l'acteur :
 *  - fil TEMPS RÉEL — `title` est l'acteur (cadrage `buildPushHeader`, imposé
 *    par la réécriture iOS des Communication Notifications) et `subtitle` porte
 *    la phrase d'action : le titre est leur SOMME ;
 *  - liste REST — `title` est déjà la phrase entière persistée, et `subtitle`
 *    nomme l'entité visée (« Votre réel ») : y ajouter le sous-titre écrirait
 *    « Alice a commenté votre réel Votre réel ».
 */
export function buildNotificationHeadline(
  notification: Notification,
  t: TranslateFunction,
  groupName?: string | null
): string {
  const actor = getActorDisplayName(notification.actor);

  if (notificationBannerFraming(notification) === 'conversation') {
    const isDirect = notification.context?.conversationType === 'direct';
    const group = nonBlank(groupName) ?? nonBlank(notification.context?.conversationTitle);
    if (isDirect || !group) return actor;
    return t('titles.inConversation', { sender: actor, title: group });
  }

  const title = nonBlank(notification.title);
  const action = nonBlank(notification.subtitle);

  if (title && title !== actor) return title;
  if (action) return `${title ?? actor} ${action}`;

  // Ni titre riche ni phrase d'action : lignes anciennes, ou type que le
  // builder serveur ne couvre pas. Le repli client reprend la main.
  return buildNotificationTitle(notification, t);
}

export function buildNotificationBannerBody(
  notification: Notification,
  t: TranslateFunction
): string | null {
  const framing = notificationBannerFraming(notification);

  // « Nouvelle demande de contact » sous « Alice veut se connecter » dit deux
  // fois la même chose, la seconde moins bien.
  if (framing === 'relation') return null;

  const content = nonBlank(notification.content);

  if (framing === 'conversation') {
    if (!content) return null;
    const attachments = (notification.metadata as { attachments?: unknown })?.attachments;
    return formatMessagePreview(content, Array.isArray(attachments) ? attachments : undefined);
  }

  // Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : à défaut
  // d'extrait, `content` retombe sur la phrase d'action elle-même (« a publié
  // une nouvelle story »). Sur une bannière qui porte déjà cette phrase en
  // titre, la répéter est le doublon que le push dédoublonne de son côté.
  if (!content) return mediaSummary(notification, t);
  return content === nonBlank(notification.subtitle)
    ? mediaSummary(notification, t)
    : content;
}

/**
 * L'émoji de réaction, sous ses DEUX noms de fil : les éventails sur contenu
 * l'écrivent en `emoji`, ceux sur message en `reactionEmoji`.
 */
export function buildNotificationReactionBadge(
  notification: Notification,
  headline: string
): string | null {
  const type = typeof notification.type === 'string' ? notification.type : '';
  if (!REACTION_TYPES.has(type)) return null;

  const emoji = readString(notification.metadata, 'emoji')
    ?? readString(notification.metadata, 'reactionEmoji');
  if (!emoji) return null;

  // Le serveur fusionne déjà l'émoji dans la phrase d'action (« a réagi 🔥 à
  // votre story ») : le rendre une seconde fois en pastille ferait dire deux
  // fois la même chose à deux endroits de la même carte.
  return headline.includes(emoji) ? null : emoji;
}

export function buildNotificationThumbnail(notification: Notification): string | null {
  const postThumbnail = readString(notification.metadata, 'postThumbnailUrl');
  if (postThumbnail) return postThumbnail;

  // Message : la photo de la 1re pièce jointe. Elle est ABSENTE du fil quand le
  // message est protégé (éphémère / vue unique / flouté / chiffré) — la
  // passerelle la retient en bloc. Rien à re-garder ici, rien à fabriquer non
  // plus depuis une autre source.
  const mime = notification.context?.firstAttachmentMimeType;
  if (typeof mime !== 'string' || !mime.startsWith('image/')) return null;
  return nonBlank(notification.context?.firstAttachmentUrl);
}

export function buildNotificationBanner(
  notification: Notification,
  t: TranslateFunction,
  options?: { readonly groupName?: string | null }
): NotificationBanner {
  const headline = buildNotificationHeadline(notification, t, options?.groupName);
  return {
    headline,
    body: buildNotificationBannerBody(notification, t),
    reactionBadge: buildNotificationReactionBadge(notification, headline),
    thumbnailUrl: buildNotificationThumbnail(notification),
  };
}
