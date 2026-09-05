import type { User } from '@meeshy/shared/types';
export type { FriendRequestStatus, BlockedUser } from '@meeshy/shared/types';

export type ContactTab = 'all' | 'connected' | 'pending' | 'refused' | 'blocked' | 'affiliates';

export type ContactSortOption = 'name' | 'lastSeen' | 'recentlyAdded';

/**
 * FriendRequest as returned by the API (dates are ISO strings, not Date objects).
 * Extends the shared FriendRequest shape but with string dates for JSON responses.
 * @see packages/shared/types/affiliate.ts FriendRequest
 */
export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  message?: string;
  status: import('@meeshy/shared/types').FriendRequestStatus;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  receiver?: User;
}

export interface AffiliateRelation {
  id: string;
  /**
   * La charge SERVIE par `AffiliateTrackingService.getUserAffiliateData` — son
   * `select` de `referredUser`, sept colonnes, relevé sur le producteur.
   *
   * `isOnline` est ABSENT, et c'est la règle produit : « affiliation/parrainage
   * jamais comptés » (directive du 2026-08-25). Un parrainage est un lien posé
   * d'un seul côté, pas une amitié — il n'ouvre aucune présence, donc la
   * colonne n'est même pas chargée. Le déclarer `boolean` promettait un champ
   * que la passerelle ne sert jamais, et invitait à lire un `undefined` comme
   * un « hors ligne » mesuré.
   *
   * C'est la TROISIÈME forme du champ, à côté des deux que produisent les
   * applicateurs partagés : `boolean` quand une surface le sert masqué à
   * `false` (`applyPresenceVisibilityAsOffline`), `boolean | null` quand elle le
   * sert masqué à `null` (`applyPresenceVisibility`), et ABSENT quand elle ne
   * le charge pas. Le rétablir exigerait un gate côté serveur, pas une ligne
   * ici.
   */
  referredUser: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string | null;
    isOnline?: boolean;
    createdAt: string;
  };
  status: string;
  createdAt: string;
  completedAt?: string;
  affiliateToken: {
    name: string;
    token: string;
    createdAt?: string;
  };
}

export interface ContactsStats {
  total: number;
  connected: number;
  pending: number;
  refused: number;
  blocked: number;
  affiliates: number;
}

export interface FriendRequestsData {
  received: FriendRequest[];
  sent: FriendRequest[];
  connected: FriendRequest[];
  pending: FriendRequest[];
  refused: FriendRequest[];
}
