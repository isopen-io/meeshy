/**
 * Les charges de l'ACTIVITÉ D'UN LIEN (#19446). Noms : `./link-activity-event-names.ts`.
 *
 * Des totaux ABSOLUS à poser, jamais des deltas. Aucune adresse IP, aucune
 * empreinte, aucun identifiant de visiteur : le pays seul situe un clic.
 */

export interface TrackingLinkClickedEventData {
  readonly token: string;
  readonly totalClicks: number;
  readonly uniqueClicks: number;
  /** ISO 8601. */
  readonly lastClickedAt: string;
  /** Code ISO 3166-1 alpha-2 du dernier clic, ou `null`. */
  readonly country: string | null;
}

export interface ShareLinkArrivalItem {
  readonly participantId: string;
  readonly isAnonymous: boolean;
  readonly country: string | null;
  /** ISO 8601. */
  readonly joinedAt: string;
}

/**
 * Les émissions d'un lien sont regroupées par fenêtre d'une seconde : une
 * charge porte TOUTES les arrivées nommées depuis la précédente (`arrivals`,
 * chronologique, au plus 20, les plus récentes). Quand une rafale en a compté
 * davantage, `arrivalsTruncated` vaut `true` : le client RELIT la liste des
 * arrivées plutôt que d'ajouter ce qu'il a reçu. `currentUses` reste le total
 * absolu qui fait foi.
 */
export interface ShareLinkArrivalEventData {
  /** L'identifiant PUBLIC du lien (`ConversationShareLink.linkId`). */
  readonly linkId: string;
  readonly currentUses: number;
  readonly maxUses: number | null;
  /** La DERNIÈRE arrivée de la fenêtre (gardée pour les clients qui ne lisent qu'elle). */
  readonly arrival: ShareLinkArrivalItem;
  /** Toutes les arrivées de la fenêtre, dans l'ordre, au plus 20. */
  readonly arrivals: readonly ShareLinkArrivalItem[];
  /** Plus d'arrivées que `arrivals` n'en porte : relire la liste. */
  readonly arrivalsTruncated: boolean;
}

export interface CommunityLinkEntryEventData {
  readonly communityId: string;
  /** Le lien d'une communauté est son identifiant public (`Community.identifier`). */
  readonly linkId: string;
  /** Les membres actifs entrés par ce lien. */
  readonly entries: number;
  /** ISO 8601. */
  readonly at: string;
}

export interface AffiliateReferralJoinedEventData {
  readonly tokenId: string;
  /** Les filleuls de CE jeton (`_count.affiliations`). */
  readonly referralCount: number;
}
