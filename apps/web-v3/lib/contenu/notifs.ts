/**
 * LA COPIE DE LA BOÎTE — ce que l'écran DIT, hors de ce qu'il compose.
 *
 * Elle est COURTE, et c'est le fond : le TEXTE d'une notification ne vient pas
 * d'ici. `title`, `subtitle` et `content` sont « localisés & persistés côté
 * serveur (source unique) » (`NotificationFormatter.formatNotification:70-73`),
 * et le corps servi est celui que `NotificationService.prismTranslation` a élu
 * pour CE lecteur. Composer ici une phrase à partir du genre serait une seconde
 * source, qui divergerait de la bannière poussée sur le téléphone du même
 * lecteur — deux textes pour un même événement, la forme exacte du cycle 122.
 *
 * Ce qui vit ici est donc ce que le SERVEUR ne dit pas : le titre de la page,
 * ses états, ses actions, et le GLYPHE de chaque genre — une décision
 * d'iconographie, pas de langue.
 */

export const NOTIFS = {
  titre: 'Notifications',
  retour: 'Retour à l’accueil',
  /** L'en-tête de la liste, lu par les lecteurs d'écran avant les lignes. */
  liste: 'Vos notifications, de la plus récente à la plus ancienne',
  toutLire: 'Tout marquer comme lu',
  /** Dit APRÈS coup ce que « Tout lire » a fait — un contrôle sans retour ne rassure personne. */
  toutLuFait: 'Tout est marqué comme lu',
  nonLue: 'Non lue',
  /** Le compteur de l'en-tête. Une seule forme, au singulier comme au pluriel : « 1 non lue », « 7 non lues ». */
  nonLues: (n: number): string => (n <= 1 ? `${n} non lue` : `${n} non lues`),
  vide: 'Aucune notification',
  videPrecision: 'Ce qui vous concerne apparaîtra ici — réponses, mentions, demandes de contact.',
  /** L'écran de panne partage la phrase des autres surfaces connectées : une seule voix pour un même incident. */
  panne: 'Vos notifications n’ont pas pu être chargées',
  panneePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
} as const;

/**
 * LE GLYPHE D'UN GENRE — une table FERMÉE, et un défaut qui existe.
 *
 * La passerelle émet vingt-quatre genres (relevés dans
 * `services/gateway/src/services/notifications/`), et elle en émettra d'autres :
 * un genre neuf arrivera ici avant que ce fichier ne le connaisse. Sans défaut,
 * il rendrait une référence de sprite vide — une icône cassée sur une ligne
 * parfaitement valide, et le lecteur croirait la notification abîmée plutôt que
 * le client en retard.
 *
 * Les genres sont regroupés par ce que le lecteur RECONNAÎT, pas par ce que le
 * producteur nomme : `message_reply`, `reply` et `story_thread_reply` sont trois
 * noms d'une même chose vue du lecteur — quelqu'un lui a répondu.
 */
const GLYPHE_PAR_GENRE: Readonly<Record<string, string>> = {
  message: 'ph-chat-circle',
  new_message: 'ph-chat-circle',
  message_edited: 'ph-note-pencil',

  message_reply: 'ph-arrow-bend-up-right',
  reply: 'ph-arrow-bend-up-right',
  story_thread_reply: 'ph-arrow-bend-up-right',

  mention: 'ph-at',
  user_mentioned: 'ph-at',

  message_reaction: 'ph-heart',
  comment_reaction: 'ph-heart',

  contact_request: 'ph-user-plus',
  friend_request: 'ph-user-plus',
  contact_accepted: 'ph-check-circle',

  friend_new_post: 'ph-article',
  friend_new_story: 'ph-film-strip',
  friend_new_mood: 'ph-smiley',
  friend_story_comment: 'ph-chat-teardrop-text',
  story_new_comment: 'ph-chat-teardrop-text',

  new_conversation: 'ph-users',
  new_conversation_direct: 'ph-users',
  new_conversation_group: 'ph-users-three',
  member_joined: 'ph-user-circle',

  missed_call: 'ph-phone-incoming',

  system: 'ph-bell',
};

/** Le glyphe d'un genre inconnu : la cloche, qui dit « une notification » sans mentir sur laquelle. */
export const GLYPHE_PAR_DEFAUT = 'ph-bell';

export const glypheDuGenre = (genre: string): string => GLYPHE_PAR_GENRE[genre] ?? GLYPHE_PAR_DEFAUT;
