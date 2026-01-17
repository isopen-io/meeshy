import { useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { usersService, type ParticipantsFilters } from '@/services';
import { toast } from 'sonner';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';

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

export function useContactsData(t: (key: string) => string) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [affiliateRelations, setAffiliateRelations] = useState<AffiliateRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ParticipantsFilters>({});

  const loadContacts = useCallback(async (appliedFilters?: ParticipantsFilters) => {
    try {
      const currentFilters = appliedFilters || filters;
      const response = await usersService.getAllUsers();
      let contactsData = response.data || [];

      // Apply client-side filters
      if (currentFilters?.search) {
        const searchTerm = currentFilters.search.toLowerCase();
        contactsData = contactsData.filter(user =>
          user.username?.toLowerCase().includes(searchTerm) ||
          user.firstName?.toLowerCase().includes(searchTerm) ||
          user.lastName?.toLowerCase().includes(searchTerm) ||
          user.displayName?.toLowerCase().includes(searchTerm)
        );
      }

      if (currentFilters?.role) {
        contactsData = contactsData.filter(user => user.role === currentFilters.role);
      }

      if (currentFilters?.onlineOnly) {
        contactsData = contactsData.filter(user => user.isOnline);
      }

      if (currentFilters?.limit) {
        contactsData = contactsData.slice(0, currentFilters.limit);
      }

      setContacts(contactsData);
    } catch (error) {
      console.error('Erreur lors du chargement des contacts:', error);
      toast.error(t('errors.loadContactsError'));
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  const loadFriendRequests = useCallback(async () => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl('/users/friend-requests'), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setFriendRequests(data.data || []);
      }
    } catch (error) {
      console.error('Erreur chargement friend requests:', error);
    }
  }, []);

  const loadAffiliateRelations = useCallback(async () => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl('/affiliate/stats'), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAffiliateRelations(data.data?.referrals || []);
      }
    } catch (error) {
      console.error('Erreur chargement relations affiliation:', error);
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    await Promise.all([
      loadContacts(),
      loadFriendRequests(),
      loadAffiliateRelations()
    ]);
  }, [loadContacts, loadFriendRequests, loadAffiliateRelations]);

  return {
    contacts,
    friendRequests,
    affiliateRelations,
    loading,
    filters,
    setFilters,
    loadContacts,
    loadFriendRequests,
    loadAffiliateRelations,
    refreshAllData
  };
}
