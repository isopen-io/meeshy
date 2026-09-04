import { NotificationTypeEnum, type Notification } from '../types/notification.js';

/**
 * **LA LOI DE LA BANNIÈRE — une seule, trois clients** (#4454, dimension 11).
 *
 * Une bannière doit dire CE QUI vient d'arriver. Le toast web n'affichait que
 * l'auteur et le contenu : un commentaire sur un réel, une réaction à une story
 * et la publication d'une humeur donnaient toutes trois « elvira ndjiki » /
 * « super ! » (signalé par le porteur produit, 2026-08-30).
 *
 * ELLE VIT ICI, ET PAS DANS UN CLIENT, parce qu'elle en a désormais TROIS :
 * iOS (`NotificationBannerPresentation`), le web legacy
 * (`apps/web/utils/notification-banner.ts`, qui l'a portée le premier) et la v3
 * (`apps/web-v3`). Elle était écrite deux fois quand le troisième est arrivé —
 * l'écrire une troisième aurait garanti la divergence, et l'issue le dit en
 * toutes lettres : « le lot commence par remonter la loi web, pas par la
 * recopier ».
 *
 * LES SEPT CADRAGES :
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
 * **LA PHRASE D'ACTION VIENT DU SERVEUR** (`buildNotificationDisplay`, i18n
 * serveur à la langue résolue du destinataire) et n'est JAMAIS réécrite ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST LA LOI, ET CE QUI RESTE AU CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La loi est le CADRAGE et la COMPOSITION : quel type relève de quelle famille,
 * où va la phrase d'action, quand un corps ferait doublon, quand une pastille
 * de réaction dirait deux fois la même chose, d'où vient la vignette.
 *
 * Ce qui reste au client est la FORMULATION dans sa propre langue de rendu —
 * comment on nomme un acteur inconnu, comment on résume une pièce jointe, quoi
 * dire quand le serveur n'a servi aucune phrase. Ces trois conventions sont
 * INJECTÉES (`ConventionsDuClient`) plutôt que remontées : elles portent des
 * littéraux de langue et des types de pièces jointes propres à chaque client,
 * et les remonter aurait fait de cette loi un module d'interface déguisé.
 *
 * C'est la frontière qui permet aux trois clients de partager une règle sans
 * partager leur vocabulaire.
 */

/** Ce qu'une bannière REND — la même forme pour les trois clients. */
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

export type TranslateFunction = (key: string, params?: Record<string, string>) => string;

/**
 * LES TROIS CONVENTIONS QUE CHAQUE CLIENT APPORTE.
 *
 * `titreDeRepli` n'existe que pour les lignes ANCIENNES et les types que le
 * builder serveur ne couvre pas — un client neuf a le droit d'y rendre le seul
 * nom de l'acteur, et c'est honnête : il ne fabrique alors aucune phrase que le
 * serveur n'a pas dite.
 */
export type ConventionsDuClient = {
  readonly nomDeLActeur: (acteur: Notification['actor']) => string;
  readonly apercuDeMessage: (contenu: string, piecesJointes?: readonly unknown[]) => string;
  readonly titreDeRepli: (notification: Notification, t: TranslateFunction) => string;
};

/**
 * Les trois familles de cadrage. Le TYPE décide, jamais la forme des champs :
 * sur le fil temps réel `subtitle` porte le nom du GROUPE pour un message et la
 * PHRASE D'ACTION pour tout le reste — deux sens pour un champ, et seul le type
 * les sépare.
 */
export type CadrageDeBanniere = 'conversation' | 'relation' | 'action';

const TYPES_DE_CONVERSATION = new Set<string>([
  NotificationTypeEnum.NEW_MESSAGE,
  NotificationTypeEnum.MESSAGE_REPLY,
  NotificationTypeEnum.USER_MENTIONED,
  NotificationTypeEnum.MESSAGE_REACTION,
]);

const TYPES_DE_RELATION = new Set<string>([
  NotificationTypeEnum.CONTACT_REQUEST,
  NotificationTypeEnum.CONTACT_ACCEPTED,
  NotificationTypeEnum.FRIEND_REQUEST,
  NotificationTypeEnum.FRIEND_ACCEPTED,
]);

const TYPES_DE_REACTION = new Set<string>([
  NotificationTypeEnum.MESSAGE_REACTION,
  NotificationTypeEnum.POST_LIKE,
  NotificationTypeEnum.STORY_REACTION,
  NotificationTypeEnum.STATUS_REACTION,
  NotificationTypeEnum.COMMENT_LIKE,
  NotificationTypeEnum.COMMENT_REACTION,
]);

export function notificationBannerFraming(notification: Notification): CadrageDeBanniere {
  const type = typeof notification.type === 'string' ? notification.type : '';
  if (TYPES_DE_CONVERSATION.has(type)) return 'conversation';
  if (TYPES_DE_RELATION.has(type)) return 'relation';
  return 'action';
}

/**
 * `metadata` est une union discriminée dont aucun membre ne porte toutes les
 * clés lues ici. On la relit comme un enregistrement de valeurs INCONNUES puis
 * on valide chaque champ — jamais `as any`, qui rendrait `string` une valeur
 * dont on ne sait rien.
 */
const lisUneChaine = (source: unknown, cle: string): string | null => {
  if (typeof source !== 'object' || source === null) return null;
  const valeur = (source as Record<string, unknown>)[cle];
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return propre.length > 0 ? propre : null;
};

const nonVide = (valeur: unknown): string | null => {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return propre.length > 0 ? propre : null;
};

/**
 * Résumé média d'un contenu sans texte — le corps de repli quand l'extrait
 * manque et que la phrase d'action occupe déjà le titre.
 */
function resumeDuMedia(notification: Notification, t: TranslateFunction): string | null {
  switch (lisUneChaine(notification.metadata, 'mediaType')?.toLowerCase()) {
    case 'image':
      return t('attachments.photo');
    case 'video':
      return t('attachments.video');
    case 'audio':
      return t('attachments.audio');
    default:
      return null;
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
 *
 * `nomDuGroupe` est la SEULE composition CLIENT de toute cette loi : le nom
 * local d'un groupe n'existe que sur l'appareil, et le serveur ne peut pas le
 * connaître.
 */
export function buildNotificationHeadline(
  notification: Notification,
  t: TranslateFunction,
  conventions: ConventionsDuClient,
  nomDuGroupe?: string | null,
): string {
  const acteur = conventions.nomDeLActeur(notification.actor);

  if (notificationBannerFraming(notification) === 'conversation') {
    const estDirecte = notification.context?.conversationType === 'direct';
    const groupe = nonVide(nomDuGroupe) ?? nonVide(notification.context?.conversationTitle);
    if (estDirecte || !groupe) return acteur;
    return t('titles.inConversation', { sender: acteur, title: groupe });
  }

  const titre = nonVide(notification.title);
  const action = nonVide(notification.subtitle);

  if (titre && titre !== acteur) return titre;
  if (action) return `${titre ?? acteur} ${action}`;

  // Ni titre riche ni phrase d'action : lignes anciennes, ou type que le
  // builder serveur ne couvre pas. Le repli CLIENT reprend la main.
  return conventions.titreDeRepli(notification, t);
}

export function buildNotificationBannerBody(
  notification: Notification,
  t: TranslateFunction,
  conventions: ConventionsDuClient,
): string | null {
  const cadrage = notificationBannerFraming(notification);

  // « Nouvelle demande de contact » sous « Alice veut se connecter » dit deux
  // fois la même chose, la seconde moins bien.
  if (cadrage === 'relation') return null;

  const contenu = nonVide(notification.content);

  if (cadrage === 'conversation') {
    if (!contenu) return null;
    const piecesJointes = (notification.metadata as { attachments?: unknown })?.attachments;
    return conventions.apercuDeMessage(contenu, Array.isArray(piecesJointes) ? piecesJointes : undefined);
  }

  // Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : à défaut
  // d'extrait, `content` retombe sur la phrase d'action elle-même (« a publié
  // une nouvelle story »). Sur une bannière qui porte déjà cette phrase en
  // titre, la répéter est le doublon que le push dédoublonne de son côté.
  if (!contenu) return resumeDuMedia(notification, t);
  return contenu === nonVide(notification.subtitle) ? resumeDuMedia(notification, t) : contenu;
}

/**
 * L'émoji de réaction, sous ses DEUX noms de fil : les éventails sur contenu
 * l'écrivent en `emoji`, ceux sur message en `reactionEmoji`.
 */
export function buildNotificationReactionBadge(
  notification: Notification,
  headline: string,
): string | null {
  const type = typeof notification.type === 'string' ? notification.type : '';
  if (!TYPES_DE_REACTION.has(type)) return null;

  const emoji =
    lisUneChaine(notification.metadata, 'emoji') ?? lisUneChaine(notification.metadata, 'reactionEmoji');
  if (!emoji) return null;

  // Le serveur fusionne déjà l'émoji dans la phrase d'action (« a réagi 🔥 à
  // votre story ») : le rendre une seconde fois en pastille ferait dire deux
  // fois la même chose à deux endroits de la même carte.
  return headline.includes(emoji) ? null : emoji;
}

export function buildNotificationThumbnail(notification: Notification): string | null {
  const vignetteDuPost = lisUneChaine(notification.metadata, 'postThumbnailUrl');
  if (vignetteDuPost) return vignetteDuPost;

  // Message : la photo de la 1re pièce jointe. Elle est ABSENTE du fil quand le
  // message est protégé (éphémère / vue unique / flouté / chiffré) — la
  // passerelle la retient en bloc. Rien à re-garder ici, rien à fabriquer non
  // plus depuis une autre source.
  const mime = notification.context?.firstAttachmentMimeType;
  if (typeof mime !== 'string' || !mime.startsWith('image/')) return null;
  return nonVide(notification.context?.firstAttachmentUrl);
}

export function buildNotificationBanner(
  notification: Notification,
  t: TranslateFunction,
  conventions: ConventionsDuClient,
  options?: { readonly groupName?: string | null },
): NotificationBanner {
  const headline = buildNotificationHeadline(notification, t, conventions, options?.groupName);
  return {
    headline,
    body: buildNotificationBannerBody(notification, t, conventions),
    reactionBadge: buildNotificationReactionBadge(notification, headline),
    thumbnailUrl: buildNotificationThumbnail(notification),
  };
}
