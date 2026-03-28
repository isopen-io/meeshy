import type { User } from '@meeshy/shared/types';

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export type ContactTab = 'all' | 'connected' | 'pending' | 'refused' | 'blocked' | 'affiliates';

export type ContactSortOption = 'name' | 'lastSeen' | 'recentlyAdded';

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  message?: string;
  status: FriendRequestStatus;
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

export interface BlockedUser {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
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
