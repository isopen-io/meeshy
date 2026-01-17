import { useState, useMemo, useCallback } from 'react';
import { User } from '@/types';
import { usersService } from '@/services';
import { toast } from 'sonner';

interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  createdAt: string;
  updatedAt: string;
  sender?: User;
  receiver?: User;
}

interface AffiliateRelation {
  id: string;
  referredUser: User & { createdAt: string };
  status: string;
  createdAt: string;
  completedAt?: string;
  affiliateToken: {
    name: string;
    token: string;
    createdAt?: string;
  };
}

export function useContactsFiltering(
  contacts: User[],
  friendRequests: FriendRequest[],
  affiliateRelations: AffiliateRelation[],
  t: (key: string) => string
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);

  const getUserDisplayName = useCallback((user: User | { firstName: string; lastName: string; username: string; displayName?: string }): string => {
    if ('displayName' in user && user.displayName) return user.displayName;
    return `${user.firstName} ${user.lastName}`.trim() || user.username;
  }, []);

  const filteredContacts = useMemo(() => {
    return Array.isArray(contacts) ? contacts.filter(contact =>
      getUserDisplayName(contact).toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.username.toLowerCase().includes(searchQuery.toLowerCase())
    ) : [];
  }, [contacts, searchQuery, getUserDisplayName]);

  const displayedUsers = searchQuery ? searchResults : filteredContacts;

  const stats = useMemo(() => {
    const contactsArray = Array.isArray(contacts) ? contacts : [];
    const requestsArray = Array.isArray(friendRequests) ? friendRequests : [];
    const affiliatesArray = Array.isArray(affiliateRelations) ? affiliateRelations : [];

    const connectedRequests = requestsArray.filter(req => req.status === 'accepted');
    const pendingRequests = requestsArray.filter(req => req.status === 'pending');
    const refusedRequests = requestsArray.filter(req => req.status === 'rejected');

    return {
      total: contactsArray.length,
      connected: connectedRequests.length,
      pending: pendingRequests.length,
      refused: refusedRequests.length,
      affiliates: affiliatesArray.length
    };
  }, [contacts, friendRequests, affiliateRelations]);

  const filteredRequests = useMemo(() => {
    const requestsArray = Array.isArray(friendRequests) ? friendRequests : [];
    return {
      connected: requestsArray.filter(req => req.status === 'accepted'),
      pending: requestsArray.filter(req => req.status === 'pending'),
      refused: requestsArray.filter(req => req.status === 'rejected')
    };
  }, [friendRequests]);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await usersService.searchUsers(query);
      let searchData: User[] = [];

      if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
        searchData = Array.isArray(response.data.data) ? response.data.data : [];
      } else if (Array.isArray(response.data)) {
        searchData = response.data;
      }

      setSearchResults(searchData);
    } catch (error) {
      console.error('[CONTACTS] Erreur lors de la recherche:', error);
      toast.error(t('errors.searchError'));
      setSearchResults([]);
    }
  }, [t]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    searchUsers(query);
  }, [searchUsers]);

  return {
    searchQuery,
    setSearchQuery: handleSearchChange,
    displayedUsers,
    stats,
    filteredRequests,
    getUserDisplayName
  };
}
