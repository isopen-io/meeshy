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

export interface ShareLinkArrivalEventData {
  /** L'identifiant PUBLIC du lien (`ConversationShareLink.linkId`). */
  readonly linkId: string;
  readonly currentUses: number;
  readonly maxUses: number | null;
  readonly arrival: {
    readonly participantId: string;
    readonly isAnonymous: boolean;
    readonly country: string | null;
    /** ISO 8601. */
    readonly joinedAt: string;
  };
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
