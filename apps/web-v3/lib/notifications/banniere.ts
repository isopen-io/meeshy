/**
 * **La bannière de la v3 dit CE QUI vient d'arriver, jamais seulement QUI.**
 *
 * Le toast du web existant n'affichait que l'auteur et le contenu : un
 * commentaire sur un réel, une réaction à une story et la publication d'une
 * humeur donnaient toutes trois « elvira ndjiki » / « super ! » (porteur
 * produit, 2026-08-30). La v3 naît avec les sept cadrages plutôt que de
 * repasser par cette phase — c'est l'objet de #4454, miroir de #4452 (iOS) et
 * #4453 (web existant), tous deux livrés.
 *
 * | cas | titre | corps |
 * |---|---|---|
 * | commentaire de contenu | X a commenté une story / un réel / un post | vignette + commentaire |
 * | nouvelle publication | X a publié un réel / une humeur / un post / une story | vignette + contenu |
 * | message privé | X | message |
 * | message de groupe | X dans « nom local du groupe » | message / vignette / indicateur |
 * | relation acceptée | X a accepté votre demande | — |
 * | demande de relation | X veut se connecter | — |
 * | réaction à un contenu | X a réagi à votre story / … / commentaire | vignette + réaction |
 *
 * **LA PHRASE D'ACTION VIENT DU SERVEUR, ET N'EST JAMAIS RÉÉCRITE ICI.**
 * `buildNotificationDisplay` la compose côté passerelle, dans la langue
 * RÉSOLUE du destinataire (#4451), et la pose en `subtitle` — un cadrage
 * imposé par iOS, qui réécrit le TITRE d'une Communication Notification avec
 * le nom de l'expéditeur. Ce module ne porte donc aucune phrase française :
 * il ASSEMBLE ce que le serveur a déjà dit. Le web existant garde, lui, un
 * repli client (`buildNotificationTitle`) pour ses lignes ANCIENNES ; la v3
 * n'en a pas, et ne doit pas s'en fabriquer un — sans phrase d'action, elle
 * sert le nom de l'acteur et rien d'autre.
 *
 * **La seule part CLIENT est « X dans {groupe} »**, et pour une raison qui
 * n'est pas un oubli du serveur : le nom d'une conversation de groupe peut
 * être RENOMMÉ localement par chaque membre — il n'existe que sur l'appareil.
 * C'est la seule chaîne que ce module demande à son appelant de traduire.
 *
 * Aucune dépendance, par construction (§ 8.3 — le socle de `(connected)` est
 * plafonné). Les types du fil sont PROJETÉS ici, comme `LienServi` dans
 * `lib/api/guest-session.ts` : ce que la passerelle sert est lu en `unknown`
 * puis validé champ par champ, jamais casté.
 */

/**
 * Ce que ce module lit d'une notification servie. Tout est `unknown` : la
 * charge vient du réseau, et un `as` ici transformerait une valeur dont on ne
 * sait rien en `string` que le rendu croirait.
 */
export type NotificationServie = {
  readonly type?: unknown;
  readonly title?: unknown;
  readonly subtitle?: unknown;
  readonly content?: unknown;
  readonly actor?: unknown;
  readonly context?: unknown;
  readonly metadata?: unknown;
};

/** La seule chaîne que l'appelant traduit — voir le doc-comment ci-dessus. */
export type TraduireDansLaConversation = (parts: {
  readonly acteur: string;
  readonly groupe: string;
}) => string;

export type BanniereDeNotification = {
  /** Ligne 1 : QUI, et QUOI. Jamais vide. */
  readonly titre: string;
  /** Ligne 2 : la charge. `null` quand la ligne 1 se suffit. */
  readonly corps: string | null;
  /** La réaction, rendue COMME une réaction — `null` si la phrase la porte déjà. */
  readonly reaction: string | null;
  /** Vignette du contenu visé. `null` ⇒ la bannière pose son icône typée. */
  readonly vignette: string | null;
};

/**
 * Les trois familles de cadrage. **Le TYPE décide, jamais la forme des
 * champs** : sur le fil temps réel, `subtitle` porte le nom du GROUPE pour un
 * message et la PHRASE D'ACTION pour tout le reste. Deux sens pour un champ,
 * et seul le type les sépare — un module qui déciderait « si subtitle existe,
 * c'est une phrase d'action » écrirait « Alice Les collègues » sur un message
 * de groupe.
 *
 * Les littéraux transcrivent `NotificationTypeEnum`
 * (`packages/shared/types/notification.ts`) plutôt que d'en importer la
 * valeur : un import de VALEUR tirerait le module entier dans le chunk de
 * `(connected)`, que le § 8.3 plafonne. La garde de
 * `__tests__/banniere-notification.test.ts` § « les littéraux de type
 * transcrivent l'énumération partagée » les confronte à la source.
 */
export type CadrageDeBanniere = 'conversation' | 'relation' | 'action';

const TYPES_DE_CONVERSATION: ReadonlySet<string> = new Set([
  'new_message',
  'message_reply',
  'user_mentioned',
  'message_reaction',
]);

const TYPES_DE_RELATION: ReadonlySet<string> = new Set([
  'contact_request',
  'contact_accepted',
  'friend_request',
  'friend_accepted',
]);

const TYPES_DE_REACTION: ReadonlySet<string> = new Set([
  'message_reaction',
  'post_like',
  'story_reaction',
  'status_reaction',
  'comment_like',
  'comment_reaction',
]);

/** Les trois ensembles, exposés pour la garde de transcription. */
export const TYPES_TRANSCRITS: ReadonlySet<string> = new Set([
  ...TYPES_DE_CONVERSATION,
  ...TYPES_DE_RELATION,
  ...TYPES_DE_REACTION,
]);

const texte = (valeur: unknown): string | null => {
  if (typeof valeur !== 'string') return null;
  const net = valeur.trim();
  return net.length > 0 ? net : null;
};

const champ = (source: unknown, cle: string): unknown => {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  return (source as Record<string, unknown>)[cle];
};

const champTexte = (source: unknown, cle: string): string | null => texte(champ(source, cle));

export function cadrageDeBanniere(notification: NotificationServie): CadrageDeBanniere {
  const type = texte(notification.type) ?? '';
  if (TYPES_DE_CONVERSATION.has(type)) return 'conversation';
  if (TYPES_DE_RELATION.has(type)) return 'relation';
  return 'action';
}

/**
 * Le nom affichable de l'acteur — `displayName` > `prénom nom` > `username`.
 * Rendre `null` plutôt qu'un « Un utilisateur » fabriqué : c'est l'appelant
 * qui décide comment nommer un acteur absent, dans SA langue.
 */
export function nomDeLActeur(notification: NotificationServie): string | null {
  const acteur = notification.actor;
  const affiche = champTexte(acteur, 'displayName');
  if (affiche) return affiche;
  const prenom = champTexte(acteur, 'firstName');
  const nom = champTexte(acteur, 'lastName');
  const complet = [prenom, nom].filter((part): part is string => part !== null).join(' ');
  if (complet.length > 0) return complet;
  return champTexte(acteur, 'username');
}

/**
 * Le titre de la bannière.
 *
 * Deux cadrages coexistent sur le champ `title`, et le discriminant est
 * l'égalité avec le nom de l'acteur :
 *
 *  - fil TEMPS RÉEL — `title` est l'acteur (cadrage `buildPushHeader`) et
 *    `subtitle` porte la phrase d'action : le titre est leur SOMME ;
 *  - liste REST — `title` est déjà la phrase entière persistée : y ajouter le
 *    sous-titre écrirait « Alice a commenté votre réel Votre réel ».
 */
export function titreDeBanniere(
  notification: NotificationServie,
  traduire: TraduireDansLaConversation,
  nomLocalDuGroupe?: string | null,
): string {
  const acteur = nomDeLActeur(notification) ?? '';

  if (cadrageDeBanniere(notification) === 'conversation') {
    const direct = champTexte(notification.context, 'conversationType') === 'direct';
    const groupe = texte(nomLocalDuGroupe) ?? champTexte(notification.context, 'conversationTitle');
    if (direct || groupe === null) return acteur;
    return traduire({ acteur, groupe });
  }

  const titre = texte(notification.title);
  const action = texte(notification.subtitle);

  if (titre !== null && titre !== acteur) return titre;
  if (action !== null) return `${titre ?? acteur} ${action}`;

  // Ni titre riche ni phrase d'action. La v3 ne fabrique AUCUNE phrase : elle
  // sert l'acteur. Un repli qui écrirait « Nouvelle notification » serait la
  // phrase française que le critère 1 de #4454 interdit.
  return acteur;
}

export function corpsDeBanniere(notification: NotificationServie): string | null {
  const cadrage = cadrageDeBanniere(notification);

  // « Nouvelle demande de contact » sous « Alice veut se connecter » dit deux
  // fois la même chose, la seconde moins bien.
  if (cadrage === 'relation') return null;

  const contenu = texte(notification.content);
  if (contenu === null) return null;
  if (cadrage === 'conversation') return contenu;

  // Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : à défaut
  // d'extrait, `content` retombe sur la phrase d'action elle-même (« a publié
  // une nouvelle story »). Sur une bannière qui porte déjà cette phrase en
  // titre, la répéter est un doublon.
  return contenu === texte(notification.subtitle) ? null : contenu;
}

/**
 * L'émoji de réaction, sous ses DEUX noms de fil : les éventails sur contenu
 * l'écrivent en `emoji`, ceux sur message en `reactionEmoji`.
 */
export function reactionDeBanniere(
  notification: NotificationServie,
  titre: string,
): string | null {
  const type = texte(notification.type) ?? '';
  if (!TYPES_DE_REACTION.has(type)) return null;

  const emoji = champTexte(notification.metadata, 'emoji')
    ?? champTexte(notification.metadata, 'reactionEmoji');
  if (emoji === null) return null;

  // Le serveur fusionne déjà l'émoji dans la phrase d'action (« a réagi 🔥 à
  // votre story ») : le rendre une seconde fois en pastille ferait dire deux
  // fois la même chose à deux endroits de la même carte.
  return titre.includes(emoji) ? null : emoji;
}

export function vignetteDeBanniere(notification: NotificationServie): string | null {
  const contenu = champTexte(notification.metadata, 'postThumbnailUrl');
  if (contenu !== null) return contenu;

  // Message : la photo de la 1re pièce jointe. Elle est ABSENTE du fil quand
  // le message est protégé (éphémère / vue unique / flouté / chiffré) — la
  // passerelle la retient en bloc. Rien à re-garder ici, rien à fabriquer non
  // plus depuis une autre source.
  const mime = champTexte(notification.context, 'firstAttachmentMimeType');
  if (mime === null || !mime.startsWith('image/')) return null;
  return champTexte(notification.context, 'firstAttachmentUrl');
}

export function banniereDeNotification(
  notification: NotificationServie,
  traduire: TraduireDansLaConversation,
  nomLocalDuGroupe?: string | null,
): BanniereDeNotification {
  const titre = titreDeBanniere(notification, traduire, nomLocalDuGroupe);
  return {
    titre,
    corps: corpsDeBanniere(notification),
    reaction: reactionDeBanniere(notification, titre),
    vignette: vignetteDeBanniere(notification),
  };
}
