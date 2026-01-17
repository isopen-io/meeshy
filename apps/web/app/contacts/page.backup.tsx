'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { toast } from 'sonner';
import { buildApiUrl } from '@/lib/config';
import {
  Search,
  MessageSquare,
  Users,
  Phone,
  Mail,
  MoreVertical,
  UserCheck,
  Share2,
  Zap,
  Clock,
  UserX,
  Check,
  X,
  UserPlus,
  Link
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User } from '@/types';
import { usersService, conversationsService, type ParticipantsFilters } from '@/services';
import { ShareAffiliateModal } from '@/components/affiliate/share-affiliate-modal';
import { useUser } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { authManager } from '@/services/auth-manager.service';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { ConversationDropdown } from '@/components/contacts/ConversationDropdown';

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

export default function ContactsPage() {
  const router = useRouter();
  const user = useUser();
  const { t } = useI18n('contacts');
  const [contacts, setContacts] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [filters, setFilters] = useState<ParticipantsFilters>({});
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [affiliateRelations, setAffiliateRelations] = useState<AffiliateRelation[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'connected' | 'pending' | 'refused' | 'affiliates'>('all');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = authManager.getAuthToken();
        if (!token) {
          router.push('/login');
          return;
        }

        const response = await fetch(buildApiUrl('/auth/me'), {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          authManager.clearAllSessions();
          toast.error(t('errors.sessionExpired'));
          router.push('/login');
          return;
        }

        // Si l'authentification est valide, charger les données en parallèle
        // (async-parallel optimization: ~200-500ms saved)
        await Promise.all([
          loadContacts(),
          loadFriendRequests(),
          loadAffiliateRelations()
        ]);
      } catch (error) {
        console.error('Erreur vérification auth:', error);
        toast.error(t('errors.connectionError'));
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  // Gérer le hash de l'URL pour activer l'onglet correspondant
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Enlever le #
    const validTabs: Array<typeof activeTab> = ['all', 'connected', 'pending', 'refused', 'affiliates'];

    if (hash && validTabs.includes(hash as typeof activeTab)) {
      setActiveTab(hash as typeof activeTab);
    }
  }, []);

  const loadContacts = async (appliedFilters?: ParticipantsFilters) => {
    try {
      // Utiliser les filtres passés en paramètre ou les filtres de l'état
      const currentFilters = appliedFilters || filters;
      
      // Récupérer tous les utilisateurs via le service des utilisateurs
      const response = await usersService.getAllUsers();
      let contactsData = response.data || [];
      
      // Appliquer les filtres côté client si nécessaire
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
      setContacts([]); // Initialiser avec un tableau vide en cas d'erreur
    } finally {
      setLoading(false);
    }
  };

  // Calculer les statistiques et listes filtrées des contacts (memoization optimization)
  const { stats, filteredRequests } = useMemo(() => {
    // S'assurer que contacts est toujours un tableau
    const contactsArray = Array.isArray(contacts) ? contacts : [];
    const requestsArray = Array.isArray(friendRequests) ? friendRequests : [];
    const affiliatesArray = Array.isArray(affiliateRelations) ? affiliateRelations : [];

    const connectedRequests = requestsArray.filter(req => req.status === 'accepted');
    const pendingRequests = requestsArray.filter(req => req.status === 'pending');
    const refusedRequests = requestsArray.filter(req => req.status === 'rejected');

    return {
      stats: {
        total: contactsArray.length,
        connected: connectedRequests.length,
        pending: pendingRequests.length,
        refused: refusedRequests.length,
        affiliates: affiliatesArray.length
      },
      // Expose filtered lists to avoid re-filtering in JSX
      filteredRequests: {
        connected: connectedRequests,
        pending: pendingRequests,
        refused: refusedRequests
      }
    };
  }, [contacts, friendRequests, affiliateRelations]);

  const loadFriendRequests = async () => {
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
  };

  const loadAffiliateRelations = async () => {
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
  };

  const searchUsers = async (query: string) => {
    console.log('[CONTACTS] Recherche utilisateurs avec query:', query);

    if (!query.trim()) {
      console.log('[CONTACTS] Query vide, réinitialisation des résultats');
      setSearchResults([]);
      return;
    }

    try {
      console.log('[CONTACTS] Appel usersService.searchUsers...');
      const response = await usersService.searchUsers(query);
      console.log('[CONTACTS] Réponse reçue:', response);

      // L'API retourne { success: true, data: [...] }
      // apiService enveloppe ça dans { data: { success: true, data: [...] } }
      let searchData: User[] = [];

      if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
        // Nouveau format: { data: { success: true, data: [...] } }
        searchData = Array.isArray(response.data.data) ? response.data.data : [];
        console.log('[CONTACTS] Format avec success:', searchData.length, 'utilisateurs trouvés');
      } else if (Array.isArray(response.data)) {
        // Ancien format: { data: [...] }
        searchData = response.data;
        console.log('[CONTACTS] Format tableau direct:', searchData.length, 'utilisateurs trouvés');
      } else {
        console.warn('[CONTACTS] Format de réponse inattendu:', response.data);
      }

      console.log('[CONTACTS] Résultats de recherche:', searchData.length, 'utilisateurs trouvés');
      setSearchResults(searchData);
    } catch (error) {
      console.error('[CONTACTS] ❌ Erreur lors de la recherche:', error);
      toast.error(t('errors.searchError'));
      setSearchResults([]); // Initialiser avec un tableau vide en cas d'erreur
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchUsers(searchQuery);
  };

  const startConversation = async (userId: string) => {
    try {
      // Validate userId before proceeding
      if (!userId || userId.trim().length === 0) {
        toast.error(t('errors.invalidUser'));
        return;
      }

      const contact = displayedUsers.find(u => u.id === userId);
      if (!contact) return;

      const token = authManager.getAuthToken();
      if (!token) {
        router.push('/login');
        return;
      }

      // Créer le titre automatique "user1 & user2"
      const currentUser = JSON.parse(JSON.stringify(authManager.getCurrentUser() || {}) || '{}');
      const currentUserName = currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.username;
      const contactName = getUserDisplayName(contact);
      const conversationTitle = `${currentUserName} & ${contactName}`;

      // Créer la conversation directe
      const response = await fetch(buildApiUrl('/conversations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: conversationTitle,
          type: 'direct',
          participantIds: [userId] // Don't include currentUser.id - backend adds creator automatically
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          toast.success(t('success.conversationCreated'));
          router.push(`/conversations/${result.data.id}`);
        } else {
          throw new Error(result.error || t('errors.conversationCreationError'));
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || t('errors.conversationCreationError'));
      }
    } catch (error) {
      console.error('Erreur lors de la création de la conversation:', error);
      toast.error(error instanceof Error ? error.message : t('errors.conversationCreationError'));
    }
  };

  const handleFriendRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl(`/users/friend-requests/${requestId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        toast.success(action === 'accept' ? t('success.friendRequestAccepted') : t('success.friendRequestRejected'));
        // Charger en parallèle - async-parallel optimization
        await Promise.all([
          loadFriendRequests(),
          loadContacts() // Recharger les contacts pour voir les nouveaux amis
        ]);
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.updateError'));
      }
    } catch (error) {
      console.error('Erreur friend request:', error);
      toast.error(t('errors.updateError'));
    }
  };

  const sendFriendRequest = async (userId: string) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl('/users/friend-requests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiverId: userId })
      });

      if (response.ok) {
        toast.success(t('success.friendRequestSent'));
        loadFriendRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.sendError'));
      }
    } catch (error) {
      console.error('Erreur envoi friend request:', error);
      toast.error(t('errors.sendError'));
    }
  };

  const cancelFriendRequest = async (requestId: string) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl(`/users/friend-requests/${requestId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'cancel' })
      });

      if (response.ok) {
        toast.success(t('success.friendRequestCancelled'));
        loadFriendRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.updateError'));
      }
    } catch (error) {
      console.error('Erreur annulation friend request:', error);
      toast.error(t('errors.updateError'));
    }
  };

  const getPendingRequestWithUser = (userId: string): FriendRequest | undefined => {
    return friendRequests.find(
      (req) =>
        req.status === 'pending' &&
        ((req.senderId === user?.id && req.receiverId === userId) ||
          (req.senderId === userId && req.receiverId === user?.id))
    );
  };

  const getUserDisplayName = (user: User | { firstName: string; lastName: string; username: string; displayName?: string }): string => {
    if ('displayName' in user && user.displayName) return user.displayName;
    return `${user.firstName} ${user.lastName}`.trim() || user.username;
  };

  const formatLastSeen = (user: User): string => {
    if (user.isOnline) return t('status.online');

    if (!user.lastActiveAt) {
      return t('status.neverSeen');
    }

    const date = new Date(user.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('status.justNow');
    if (diffMins < 60) return t('status.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('status.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('status.daysAgo', { count: diffDays });

    return t('status.lastSeenDate', { date: date.toLocaleDateString() });
  };

  const filteredContacts = Array.isArray(contacts) ? contacts.filter(contact =>
    getUserDisplayName(contact).toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.username.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [];

  const displayedUsers = searchQuery ? searchResults : filteredContacts;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        {/* Contenu principal scrollable pleine largeur */}
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 dark:from-blue-700 dark:via-indigo-700 dark:to-purple-800 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                  <Users className="h-8 w-8" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold">{t('title')}</h1>
              </div>
              <p className="text-lg md:text-xl text-blue-100 max-w-2xl">
                {t('subtitle')}
              </p>
            </div>
            {/* Decorative elements */}
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Main Content Card */}
          <Card className="border-2 shadow-lg bg-white dark:bg-gray-950 dark:border-gray-800">
            <CardContent className="p-6 space-y-6">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={(value) => {
                const newTab = value as typeof activeTab;
                setActiveTab(newTab);
                // Mettre à jour le hash de l'URL
                window.history.replaceState(null, '', `#${newTab}`);
              }}>
                <TabsList className="w-full grid grid-cols-5 h-auto p-1.5 bg-gray-100 dark:bg-gray-800 dark:border-gray-700">
                  <TabsTrigger
                    value="all"
                    className="data-[state=active]:bg-blue-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <Users className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.all')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="connected"
                    className="data-[state=active]:bg-purple-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <UserCheck className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.connected')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="data-[state=active]:bg-orange-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.pending')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="refused"
                    className="data-[state=active]:bg-red-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <UserX className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.refused')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="affiliates"
                    className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.affiliates')}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Stats in 2x2 grid */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.totalContacts')}</p>
                  <p className="text-2xl font-bold text-foreground dark:text-gray-100">{stats.total}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.connected')}</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.connected}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.pending')}</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.pending}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.affiliates')}</p>
                  <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.affiliates}</p>
                </div>
              </div>

              {/* Search and Actions */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                  <Input
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchUsers(e.target.value);
                    }}
                    className="pl-10 h-12 text-base border-2 focus:border-primary dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </div>

                <Button
                  onClick={() => setIsShareModalOpen(true)}
                  variant="default"
                  className="h-12 rounded-xl px-6 font-semibold shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  <Share2 className="h-5 w-5 mr-2" />
                  <span>{t('inviteContact')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Contenu des tabs */}
          <div className="space-y-6">
            {loading ? (
              <Card className="border-2 bg-white dark:bg-gray-950 dark:border-gray-800">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-700 border-t-primary dark:border-t-primary"></div>
                    <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
                  </div>
                  <p className="mt-4 text-muted-foreground dark:text-gray-400 font-medium">{t('loading')}</p>
                </CardContent>
              </Card>
            ) : activeTab === 'all' ? (
              displayedUsers.length === 0 ? (
                <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl rounded-full"></div>
                      <div className="relative p-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl">
                        <Users className="h-16 w-16 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-foreground dark:text-gray-100 mb-3 text-center">
                      {searchQuery ? t('messages.noContactsFound') : t('messages.noContacts')}
                    </h3>
                    <p className="text-muted-foreground dark:text-gray-400 text-base text-center max-w-md">
                      {searchQuery
                        ? t('messages.noContactsFoundDescription')
                        : t('messages.noContactsDescription')
                      }
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {displayedUsers.map((contact) => (
                    <Card key={contact.id} className="relative border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950 dark:border-gray-800">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                      <CardContent className="relative z-10 p-4 sm:p-6">
                        <div className="flex items-start space-x-3 sm:space-x-4">
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white dark:border-gray-700 shadow-lg">
                              <AvatarImage src={contact.avatar} alt={getUserDisplayName(contact)} />
                              <AvatarFallback className="text-sm sm:text-lg font-bold">
                                {getUserDisplayName(contact).slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <OnlineIndicator
                              isOnline={getUserStatus(contact) === 'online'}
                              status={getUserStatus(contact)}
                              size="md"
                              className="absolute -bottom-0.5 -right-0.5"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                                {getUserDisplayName(contact)}
                              </h3>

                              <div className="flex flex-row items-center gap-2 flex-shrink-0">
                                <Badge
                                  variant={contact.isOnline ? 'default' : 'secondary'}
                                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold flex-shrink-0 whitespace-nowrap ${
                                    contact.isOnline
                                      ? 'bg-green-500 hover:bg-green-600'
                                      : 'bg-gray-400 hover:bg-gray-500'
                                  }`}
                                >
                                  {contact.isOnline ? t('status.online') : t('status.offline')}
                                </Badge>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-10 sm:w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                                      <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                                      <span className="sr-only">{t('actions.menu')}</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56 z-[100] dark:bg-gray-900 dark:border-gray-700">
                                    {(() => {
                                      const pendingRequest = getPendingRequestWithUser(contact.id);
                                      if (pendingRequest) {
                                        return (
                                          <DropdownMenuItem
                                            onClick={() => cancelFriendRequest(pendingRequest.id)}
                                            className="py-3 text-orange-600 dark:text-orange-400"
                                          >
                                            <X className="h-4 w-4 mr-3" />
                                            <span className="font-medium">{t('actions.cancel')}</span>
                                          </DropdownMenuItem>
                                        );
                                      }
                                      return (
                                        <DropdownMenuItem
                                          onClick={() => sendFriendRequest(contact.id)}
                                          className="py-3 dark:hover:bg-gray-800"
                                        >
                                          <UserPlus className="h-4 w-4 mr-3" />
                                          <span className="font-medium">{t('actions.add')}</span>
                                        </DropdownMenuItem>
                                      );
                                    })()}
                                    <DropdownMenuItem
                                      onClick={() => router.push(`/u/${contact.id}`)}
                                      className="py-3 dark:hover:bg-gray-800"
                                    >
                                      <UserCheck className="h-4 w-4 mr-3" />
                                      <span className="font-medium">{t('actions.viewProfile')}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => startConversation(contact.id)}
                                      className="py-3 dark:hover:bg-gray-800"
                                    >
                                      <MessageSquare className="h-4 w-4 mr-3" />
                                      <span className="font-medium">{t('actions.message')}</span>
                                    </DropdownMenuItem>
                                    {contact.phoneNumber && (
                                      <DropdownMenuItem className="py-3 dark:hover:bg-gray-800">
                                        <Phone className="h-4 w-4 mr-3" />
                                        <span className="font-medium">{t('actions.call')}</span>
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                            <button
                              onClick={() => router.push(`/u/${contact.id}`)}
                              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                            >
                              @{contact.username}
                            </button>

                            {/* Date de dernière connexion sous le pseudo */}
                            <div className="flex items-center space-x-2 mb-3">
                              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${contact.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                                {formatLastSeen(contact)}
                              </span>
                            </div>

                            {/* Boutons d'action */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Bouton Ajouter ou Annuler */}
                              {(() => {
                                const pendingRequest = getPendingRequestWithUser(contact.id);
                                if (pendingRequest) {
                                  return (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => cancelFriendRequest(pendingRequest.id)}
                                      className="flex items-center gap-2 h-9 px-4 border-2 border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30 shadow-md hover:shadow-lg transition-all"
                                    >
                                      <X className="h-4 w-4" />
                                      <span className="text-sm">{t('actions.cancel')}</span>
                                    </Button>
                                  );
                                }
                                return (
                                  <Button
                                    size="sm"
                                    onClick={() => sendFriendRequest(contact.id)}
                                    className="flex items-center gap-2 h-9 px-4 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 shadow-md hover:shadow-lg transition-all"
                                  >
                                    <UserPlus className="h-4 w-4" />
                                    <span className="text-sm">{t('actions.add')}</span>
                                  </Button>
                                );
                              })()}

                              {/* Dropdown pour gérer les conversations */}
                              <ConversationDropdown
                                userId={contact.id}
                                onCreateNew={() => startConversation(contact.id)}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            ) : activeTab === 'connected' ? (
              friendRequests.filter(r => r.status === 'accepted').length === 0 ? (
                <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl rounded-full"></div>
                      <div className="relative p-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-3xl">
                        <UserCheck className="h-16 w-16 text-purple-600 dark:text-purple-400" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noConnectedContacts')}</h3>
                    <p className="text-muted-foreground text-base text-center max-w-md">
                      {t('messages.noConnectedContactsDescription')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {filteredRequests.connected.map((request) => {
                    const otherUser = request.senderId === user?.id ? request.receiver : request.sender;
                    const otherUserId = request.senderId === user?.id ? request.receiverId : request.senderId;

                    return (
                      <Card key={request.id} className="relative border-2 hover:border-purple-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                        <CardContent className="relative z-10 p-4 sm:p-6">
                          <div className="flex items-start space-x-3 sm:space-x-4">
                            <div className="relative flex-shrink-0">
                              <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white shadow-lg">
                                <AvatarImage src={otherUser?.avatar} alt={getUserDisplayName(otherUser!)} />
                                <AvatarFallback className="text-sm sm:text-lg font-bold">
                                  {getUserDisplayName(otherUser!).slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <OnlineIndicator
                                isOnline={getUserStatus(otherUser!) === 'online'}
                                status={getUserStatus(otherUser!)}
                                size="md"
                                className="absolute -bottom-0.5 -right-0.5"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                                  {getUserDisplayName(otherUser!)}
                                </h3>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-10 sm:w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                                      <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                                      <span className="sr-only">{t('actions.menu')}</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56 z-[100] dark:bg-gray-900 dark:border-gray-700">
                                    <DropdownMenuItem
                                      onClick={() => router.push(`/u/${otherUserId}`)}
                                      className="py-3 dark:hover:bg-gray-800"
                                    >
                                      <UserCheck className="h-4 w-4 mr-3" />
                                      <span className="font-medium">{t('actions.viewProfile')}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => startConversation(otherUserId)}
                                      className="py-3 dark:hover:bg-gray-800"
                                    >
                                      <MessageSquare className="h-4 w-4 mr-3" />
                                      <span className="font-medium">{t('actions.message')}</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <button
                                onClick={() => router.push(`/u/${otherUserId}`)}
                                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                              >
                                @{otherUser?.username}
                              </button>

                              <div className="space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                  <div className="flex items-center space-x-2">
                                    <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${otherUser?.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                                      {otherUser?.isOnline ? t('status.online') : t('status.offline')}
                                    </span>
                                  </div>

                                  {otherUser?.email && (
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                                        {otherUser.email}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Dropdown pour gérer les conversations */}
                                <div className="mt-3">
                                  <ConversationDropdown
                                    userId={otherUserId}
                                    onCreateNew={() => startConversation(otherUserId)}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )
            ) : activeTab === 'pending' ? (
              friendRequests.filter(r => r.status === 'pending').length === 0 ? (
                <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 blur-3xl rounded-full"></div>
                      <div className="relative p-6 bg-gradient-to-br from-orange-100 to-yellow-100 dark:from-orange-900/30 dark:to-yellow-900/30 rounded-3xl">
                        <Clock className="h-16 w-16 text-orange-600 dark:text-orange-400" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noPendingRequests')}</h3>
                    <p className="text-muted-foreground text-base text-center max-w-md">
                      {t('messages.noPendingRequestsDescription')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {filteredRequests.pending.map((request) => {
                    const isCurrentUserSender = request.senderId === user?.id;
                    const otherUser = isCurrentUserSender ? request.receiver : request.sender;

                    return (
                      <Card key={request.id} className="relative border-2 hover:border-orange-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                        <CardContent className="relative z-10 p-4 sm:p-6">
                          <div className="flex items-start space-x-3 sm:space-x-4">
                            <div className="relative flex-shrink-0">
                              <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white shadow-lg">
                                <AvatarImage src={otherUser?.avatar} alt={getUserDisplayName(otherUser!)} />
                                <AvatarFallback className="text-sm sm:text-lg font-bold">
                                  {getUserDisplayName(otherUser!).slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <OnlineIndicator
                                isOnline={getUserStatus(otherUser!) === 'online'}
                                status={getUserStatus(otherUser!)}
                                size="md"
                                className="absolute -bottom-0.5 -right-0.5"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white mb-1 break-words">
                                {getUserDisplayName(otherUser!)}
                              </h3>
                              <button
                                onClick={() => router.push(`/u/${otherUser?.id}`)}
                                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 break-all transition-colors cursor-pointer text-left"
                              >
                                @{otherUser?.username}
                              </button>
                              <p className="text-xs sm:text-sm text-gray-500 font-medium break-words mb-3">
                                {isCurrentUserSender
                                  ? t('messages.requestSent', { date: new Date(request.createdAt).toLocaleDateString() })
                                  : t('messages.requestReceived', { date: new Date(request.createdAt).toLocaleDateString() })
                                }
                              </p>

                              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                {isCurrentUserSender ? (
                                  <Badge variant="outline" className="text-orange-600 border-orange-200 px-3 py-1.5 font-semibold">
                                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
                                    {t('status.pending')}
                                  </Badge>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleFriendRequest(request.id, 'accept')}
                                      className="flex-1 sm:flex-none items-center gap-2 h-9 sm:h-10 px-3 sm:px-4 bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg transition-all"
                                    >
                                      <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      <span className="text-xs sm:text-sm">{t('actions.accept')}</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleFriendRequest(request.id, 'reject')}
                                      className="flex-1 sm:flex-none items-center gap-2 h-9 sm:h-10 px-3 sm:px-4 border-2 shadow-md hover:shadow-lg transition-all"
                                    >
                                      <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      <span className="text-xs sm:text-sm">{t('actions.reject')}</span>
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )
            ) : activeTab === 'refused' ? (
              friendRequests.filter(r => r.status === 'rejected').length === 0 ? (
                <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-orange-500/20 blur-3xl rounded-full"></div>
                      <div className="relative p-6 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-3xl">
                        <UserX className="h-16 w-16 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noRefusedRequests')}</h3>
                    <p className="text-muted-foreground text-base text-center max-w-md">
                      {t('messages.noRefusedRequestsDescription')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {filteredRequests.refused.map((request) => {
                    const isCurrentUserSender = request.senderId === user?.id;
                    const otherUser = isCurrentUserSender ? request.receiver : request.sender;
                    const otherUserId = isCurrentUserSender ? request.receiverId : request.senderId;

                    return (
                      <Card key={request.id} className="relative border-2 hover:border-red-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                        <CardContent className="relative z-10 p-4 sm:p-6">
                          <div className="flex items-start space-x-3 sm:space-x-4">
                            <div className="relative flex-shrink-0">
                              <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white shadow-lg">
                                <AvatarImage src={otherUser?.avatar} alt={getUserDisplayName(otherUser!)} />
                                <AvatarFallback className="text-sm sm:text-lg font-bold">
                                  {getUserDisplayName(otherUser!).slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <OnlineIndicator
                                isOnline={getUserStatus(otherUser!) === 'online'}
                                status={getUserStatus(otherUser!)}
                                size="md"
                                className="absolute -bottom-0.5 -right-0.5"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white mb-1 break-words">
                                {getUserDisplayName(otherUser!)}
                              </h3>
                              <button
                                onClick={() => router.push(`/u/${otherUserId}`)}
                                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 break-all transition-colors cursor-pointer text-left"
                              >
                                @{otherUser?.username}
                              </button>
                              <p className="text-xs sm:text-sm text-gray-500 font-medium mb-3">
                                {t('messages.requestRejected', { date: new Date(request.updatedAt).toLocaleDateString() })}
                              </p>

                              <div className="flex items-center gap-2">
                                {isCurrentUserSender ? (
                                  <Badge variant="outline" className="text-red-600 border-red-200 px-3 py-1.5 font-semibold">
                                    <UserX className="h-4 w-4 mr-2" />
                                    {t('status.rejected')}
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => sendFriendRequest(otherUserId)}
                                    className="flex items-center space-x-2 h-10 px-4 border-2 shadow-md hover:shadow-lg transition-all"
                                  >
                                    <UserPlus className="h-4 w-4" />
                                    <span>{t('actions.resend')}</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )
            ) : activeTab === 'affiliates' ? (
              affiliateRelations.length === 0 ? (
                <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 blur-3xl rounded-full"></div>
                      <div className="relative p-6 bg-gradient-to-br from-cyan-100 to-teal-100 dark:from-cyan-900/30 dark:to-teal-900/30 rounded-3xl">
                        <Share2 className="h-16 w-16 text-cyan-600 dark:text-cyan-400" />
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noAffiliateContacts')}</h3>
                    <p className="text-muted-foreground text-base mb-8 text-center max-w-md">
                      {t('messages.noAffiliateContactsDescription')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {affiliateRelations.map((relation) => (
                    <Card key={relation.id} className="relative border-2 hover:border-cyan-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                      <CardContent className="relative z-10 p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                            <div className="relative flex-shrink-0">
                              <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white shadow-lg">
                                <AvatarImage src={relation.referredUser.avatar} alt={getUserDisplayName(relation.referredUser)} />
                                <AvatarFallback className="text-sm sm:text-lg font-bold">
                                  {getUserDisplayName(relation.referredUser).slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <OnlineIndicator
                                isOnline={getUserStatus(relation.referredUser) === 'online'}
                                status={getUserStatus(relation.referredUser)}
                                size="md"
                                className="absolute -bottom-0.5 -right-0.5"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white mb-1 break-words">
                                {getUserDisplayName(relation.referredUser)}
                              </h3>
                              <button
                                onClick={() => router.push(`/u/${relation.referredUser.id}`)}
                                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                              >
                                @{relation.referredUser.username}
                              </button>

                              {/* Informations détaillées compactes */}
                              <div className="space-y-2">
                                {/* Status et email */}
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                  <div className="flex items-center space-x-2">
                                    <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${relation.referredUser.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                                      {relation.referredUser.isOnline ? t('status.online') : t('status.offline')}
                                    </span>
                                  </div>

                                  {relation.referredUser.email && (
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                                        {relation.referredUser.email}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Lien d'invitation utilisé */}
                                <div className="flex items-center space-x-2 p-2 sm:p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                                  <Link className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs text-cyan-600 uppercase tracking-wide block font-medium break-words">
                                      {t('messages.linkUsed')}: {relation.affiliateToken.name}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            ) : null}
          </div>

          {/* Modal d'affiliation */}
          <ShareAffiliateModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            userLanguage={user?.systemLanguage || 'fr'}
          />
        </div>
      </DashboardLayout>

      {/* Footer - Prend toute la largeur de la page, après le contenu scrollable */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
