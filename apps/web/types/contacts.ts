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
  referredUser: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
    isOnline: boolean;
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
