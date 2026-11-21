/**
 * Les noms de l'ACTIVITÉ D'UN LIEN en temps réel (#19446). Charges : `./link-activity.ts`.
 *
 * Audience : la seule room `user:<id>` de qui GÈRE le lien — le créateur d'un lien
 * de suivi, le créateur et les gestionnaires d'un lien de partage, les intendants
 * d'une communauté, le parrain d'un jeton. Jamais une room de conversation.
 *
 * Chaque charge pose des totaux ABSOLUS : un client qui en manque un relit la
 * dernière valeur reçue, jamais une somme de deltas. Aucune ne nomme un visiteur.
 * Émis par `services/gateway/src/socketio/linkActivityEvents.ts`, regroupés à
 * au plus une émission par seconde et par lien.
 */

export const LINK_ACTIVITY_SERVER_EVENTS = {
  /** Au créateur d'un lien de suivi : ses compteurs après un clic. */
  TRACKING_LINK_CLICKED: 'tracking-link:clicked',
  /** Au créateur et aux gestionnaires d'un lien de partage : les arrivées de la fenêtre (`arrivals`, aucune perdue ; `arrivalsTruncated` ⇒ relire). */
  SHARE_LINK_ARRIVAL: 'share-link:arrival',
  /** Aux intendants d'une communauté : une entrée par son lien. */
  COMMUNITY_LINK_ENTRY: 'community-link:entry',
  /** Au parrain : un filleul de plus sur l'un de ses jetons. */
  AFFILIATE_REFERRAL_JOINED: 'affiliate:referral-joined',
} as const;
