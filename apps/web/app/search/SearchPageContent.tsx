'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { toast } from 'sonner';
import {
  Search,
  Users,
  MessageSquare,
  Hash,
  Globe,
  Lock,
  UserPlus,
  X,
  Check,
  Building,
  MoreVertical,
  UserCheck,
  Zap
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildApiUrl } from '@/lib/config';
import { User } from '@/types';
import { authManager } from '@/services/auth-manager.service';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { ConversationDropdown } from '@/components/contacts/ConversationDropdown';
import { useUser } from '@/stores';

interface Community {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  memberCount: number;
  isPrivate: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string | null;
  type: 'direct' | 'group' | 'public' | 'global';
  lastMessageAt: Date | null;
  unreadCount: number;
  members?: Array<{
    user: {
      id: string;
      username: string;
      avatar?: string;
      displayName?: string;
    };
  }>;
}

interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUser = useUser();

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'conversations' | 'communities'>('users');

  // Calculer les statistiques
  const stats = useMemo(() => ({
    users: users.length,
    conversations: conversations.length,
    communities: communities.length,
    total: users.length + conversations.length + communities.length
  }), [users, conversations, communities]);

  // Charger les demandes d'amis
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

  // Effectuer la recherche
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setUsers([]);
      setConversations([]);
      setCommunities([]);
      return;
    }

    setLoading(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error('Vous devez être connecté pour effectuer une recherche');
        router.push('/login');
        return;
      }

      // Rechercher en parallèle
      const [usersResponse, conversationsResponse, communitiesResponse] = await Promise.all([
        fetch(`${buildApiUrl('/users/search')}?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${buildApiUrl('/conversations/search')}?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${buildApiUrl('/communities/search')}?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      let usersData: User[] = [];
      let conversationsData: Conversation[] = [];
      let communitiesData: Community[] = [];

      if (usersResponse.ok) {
        const data = await usersResponse.json();
        usersData = (data.data?.data || data.data || []).filter((user: User) => user.id !== currentUser?.id);
      }

      if (conversationsResponse.ok) {
        const data = await conversationsResponse.json();
        conversationsData = data.data || [];
      }

      if (communitiesResponse.ok) {
        const data = await communitiesResponse.json();
        communitiesData = data.data || [];
      }

      setUsers(usersData);
      setConversations(conversationsData);
      setCommunities(communitiesData);

    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      toast.error('Erreur lors de la recherche');
    } finally {
      setLoading(false);
    }
  }, [currentUser, router]);

  // Initialiser la recherche depuis l'URL
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      handleSearch(urlQuery);
    }
  }, [searchParams, handleSearch]);

  // Gérer les tabs depuis l'URL
  useEffect(() => {
    const tab = searchParams.get('tab') as typeof activeTab || 'users';
    setActiveTab(tab);
  }, [searchParams]);

  // Focus sur l'input au montage
  useEffect(() => {
    inputRef.current?.focus();
    loadFriendRequests();
  }, []);

  // Gérer la soumission du formulaire
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      handleSearch(query);
      const params = new URLSearchParams();
      params.set('q', query);
      if (activeTab !== 'users') params.set('tab', activeTab);
      router.push(`/search?${params.toString()}`);
    }
  };

  // Gérer le changement d'onglet
  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab as typeof activeTab);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (newTab !== 'users') params.set('tab', newTab);
    router.push(`/search?${params.toString()}`);
  };

  const getUserDisplayName = (user: User): string => {
    if (user.displayName) return user.displayName;
    return `${user.firstName} ${user.lastName}`.trim() || user.username;
  };

  const getInitials = (user: User): string => {
    const displayName = getUserDisplayName(user);
    return displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Envoyer une demande d'ami
  const sendFriendRequest = async (userId: string) => {
    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl('/users/friend-requests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiverId: userId })
      });

      if (response.ok) {
        toast.success('Demande d\'ami envoyée');
        loadFriendRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'envoi de la demande');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'envoi de la demande');
    }
  };

  // Annuler une demande d'ami
  const cancelFriendRequest = async (requestId: string) => {
    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl(`/users/friend-requests/${requestId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'cancel' })
      });

      if (response.ok) {
        toast.success('Demande annulée');
        loadFriendRequests();
      } else {
        toast.error('Erreur lors de l\'annulation');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'annulation');
    }
  };

  // Démarrer une conversation
  const startConversation = async (userId: string) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        router.push('/login');
        return;
      }

      const contact = users.find(u => u.id === userId);
      if (!contact) return;

      const currentUserData = authManager.getCurrentUser();
      const currentUserName = currentUserData?.displayName || `${currentUserData?.firstName} ${currentUserData?.lastName}`.trim() || currentUserData?.username;
      const contactName = getUserDisplayName(contact);
      const conversationTitle = `${currentUserName} & ${contactName}`;

      const response = await fetch(buildApiUrl('/conversations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: conversationTitle,
          type: 'direct',
          participantIds: [userId]
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          toast.success('Conversation créée');
          router.push(`/conversations/${result.data.id}`);
        }
      } else {
        toast.error('Erreur lors de la création de la conversation');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la création de la conversation');
    }
  };

  // Rejoindre une communauté
  const joinCommunity = async (communityId: string) => {
    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl(`/communities/${communityId}/join`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast.success('Vous avez rejoint la communauté');
        handleSearch(query);
      } else {
        toast.error('Impossible de rejoindre la communauté');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la tentative de rejoindre la communauté');
    }
  };

  const getPendingRequestWithUser = (userId: string): FriendRequest | undefined => {
    return friendRequests.find(
      (req) =>
        req.status === 'pending' &&
        ((req.senderId === currentUser?.id && req.receiverId === userId) ||
          (req.senderId === userId && req.receiverId === currentUser?.id))
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <DashboardLayout title="Recherche" className="!bg-none !bg-transparent !h-auto">
        <div className="relative z-10 max-w-7xl mx-auto space-y-8 pb-8 w-full py-8">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 dark:from-blue-700 dark:via-indigo-700 dark:to-purple-800 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                  <Search className="h-8 w-8" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold">Recherche</h1>
              </div>
              <p className="text-lg md:text-xl text-blue-100 max-w-2xl">
                Découvrez des utilisateurs, conversations et communautés sur Meeshy
              </p>
            </div>
            {/* Decorative elements */}
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Main Content Card */}
          <Card className="border-2 shadow-lg bg-white dark:bg-gray-950 dark:border-gray-800">
            <CardContent className="p-6 space-y-6">
              {/* Search Form */}
              <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Rechercher des utilisateurs, conversations, communautés..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10 h-12 text-base border-2 focus:border-primary dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 rounded-xl px-6 font-semibold shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                      Recherche...
                    </>
                  ) : (
                    <>
                      <Search className="h-5 w-5 mr-2" />
                      Rechercher
                    </>
                  )}
                </Button>
              </form>

              {/* Tabs */}
              {query && (
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabsList className="w-full grid grid-cols-3 h-auto p-1.5 bg-gray-100 dark:bg-gray-800 dark:border-gray-700">
                    <TabsTrigger
                      value="users"
                      className="data-[state=active]:bg-blue-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                    >
                      <Users className="h-4 w-4" />
                      <span className="text-xs md:text-sm">Utilisateurs ({stats.users})</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="conversations"
                      className="data-[state=active]:bg-purple-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs md:text-sm">Conversations ({stats.conversations})</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="communities"
                      className="data-[state=active]:bg-orange-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                    >
                      <Building className="h-4 w-4" />
                      <span className="text-xs md:text-sm">Communautés ({stats.communities})</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              {/* Stats */}
              {query && stats.total > 0 && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
                  <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                    {stats.total} résultat{stats.total > 1 ? 's' : ''} pour "{query}"
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {query && (
            <div className="space-y-6">
              {loading ? (
                <Card className="border-2 bg-white dark:bg-gray-950 dark:border-gray-800">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-700 border-t-primary dark:border-t-primary"></div>
                      <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
                    </div>
                    <p className="mt-4 text-muted-foreground dark:text-gray-400 font-medium">Recherche en cours...</p>
                  </CardContent>
                </Card>
              ) : activeTab === 'users' ? (
                users.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl rounded-full"></div>
                        <div className="relative p-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl">
                          <Users className="h-16 w-16 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-foreground dark:text-gray-100 mb-3 text-center">
                        Aucun utilisateur trouvé
                      </h3>
                      <p className="text-muted-foreground dark:text-gray-400 text-base text-center max-w-md">
                        Essayez avec un autre terme de recherche
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {users.map((user) => {
                      const pendingRequest = getPendingRequestWithUser(user.id);

                      return (
                        <Card key={user.id} className="relative border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950 dark:border-gray-800">
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                          <CardContent className="relative z-10 p-4 sm:p-6">
                            <div className="flex items-start space-x-3 sm:space-x-4">
                              <div className="relative flex-shrink-0">
                                <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white dark:border-gray-700 shadow-lg">
                                  <AvatarImage src={user.avatar} alt={getUserDisplayName(user)} />
                                  <AvatarFallback className="text-sm sm:text-lg font-bold">
                                    {getInitials(user)}
                                  </AvatarFallback>
                                </Avatar>
                                <OnlineIndicator
                                  isOnline={getUserStatus(user) === 'online'}
                                  status={getUserStatus(user)}
                                  size="md"
                                  className="absolute -bottom-0.5 -right-0.5"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                                    {getUserDisplayName(user)}
                                  </h3>

                                  <div className="flex flex-row items-center gap-2 flex-shrink-0">
                                    <Badge
                                      variant={user.isOnline ? 'default' : 'secondary'}
                                      className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold flex-shrink-0 whitespace-nowrap ${
                                        user.isOnline
                                          ? 'bg-green-500 hover:bg-green-600'
                                          : 'bg-gray-400 hover:bg-gray-500'
                                      }`}
                                    >
                                      {user.isOnline ? 'En ligne' : 'Hors ligne'}
                                    </Badge>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-10 sm:w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                                          <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-56 z-[100] dark:bg-gray-900 dark:border-gray-700">
                                        {pendingRequest ? (
                                          <DropdownMenuItem
                                            onClick={() => cancelFriendRequest(pendingRequest.id)}
                                            className="py-3 text-orange-600 dark:text-orange-400"
                                          >
                                            <X className="h-4 w-4 mr-3" />
                                            <span className="font-medium">Annuler la demande</span>
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            onClick={() => sendFriendRequest(user.id)}
                                            className="py-3 dark:hover:bg-gray-800"
                                          >
                                            <UserPlus className="h-4 w-4 mr-3" />
                                            <span className="font-medium">Ajouter en ami</span>
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem
                                          onClick={() => router.push(`/u/${user.id}`)}
                                          className="py-3 dark:hover:bg-gray-800"
                                        >
                                          <UserCheck className="h-4 w-4 mr-3" />
                                          <span className="font-medium">Voir le profil</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => startConversation(user.id)}
                                          className="py-3 dark:hover:bg-gray-800"
                                        >
                                          <MessageSquare className="h-4 w-4 mr-3" />
                                          <span className="font-medium">Envoyer un message</span>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                                <button
                                  onClick={() => router.push(`/u/${user.id}`)}
                                  className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                                >
                                  @{user.username}
                                </button>

                                {/* Boutons d'action */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {pendingRequest ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => cancelFriendRequest(pendingRequest.id)}
                                      className="flex items-center gap-2 h-9 px-4 border-2 border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30 shadow-md hover:shadow-lg transition-all"
                                    >
                                      <X className="h-4 w-4" />
                                      <span className="text-sm">Annuler</span>
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => sendFriendRequest(user.id)}
                                      className="flex items-center gap-2 h-9 px-4 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 shadow-md hover:shadow-lg transition-all"
                                    >
                                      <UserPlus className="h-4 w-4" />
                                      <span className="text-sm">Ajouter</span>
                                    </Button>
                                  )}

                                  <ConversationDropdown
                                    userId={user.id}
                                    onCreateNew={() => startConversation(user.id)}
                                  />
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )
              ) : activeTab === 'conversations' ? (
                conversations.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl rounded-full"></div>
                        <div className="relative p-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-3xl">
                          <MessageSquare className="h-16 w-16 text-purple-600 dark:text-purple-400" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-foreground dark:text-gray-100 mb-3 text-center">
                        Aucune conversation trouvée
                      </h3>
                      <p className="text-muted-foreground dark:text-gray-400 text-base text-center max-w-md">
                        Essayez avec un autre terme de recherche
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {conversations.map((conversation) => (
                      <Card
                        key={conversation.id}
                        onClick={() => router.push(`/conversations/${conversation.id}`)}
                        className="relative border-2 hover:border-purple-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950 dark:border-gray-800 cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 dark:from-purple-500/10 dark:to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                        <CardContent className="relative z-10 p-4 sm:p-6">
                          <div className="flex items-start space-x-3 sm:space-x-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                                  {conversation.title || 'Conversation sans titre'}
                                </h3>
                                <Badge
                                  variant="secondary"
                                  className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold flex-shrink-0"
                                >
                                  {conversation.type === 'direct' ? (
                                    <>👤 Direct</>
                                  ) : conversation.type === 'group' ? (
                                    <>👥 Groupe</>
                                  ) : conversation.type === 'public' ? (
                                    <><Globe className="h-3 w-3 inline mr-1" />Public</>
                                  ) : (
                                    <>🌍 Global</>
                                  )}
                                </Badge>
                              </div>

                              {conversation.unreadCount > 0 && (
                                <Badge className="bg-red-500 hover:bg-red-600 mb-2">
                                  {conversation.unreadCount} message{conversation.unreadCount > 1 ? 's' : ''} non lu{conversation.unreadCount > 1 ? 's' : ''}
                                </Badge>
                              )}

                              {conversation.lastMessageAt && (
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                  Dernière activité : {new Date(conversation.lastMessageAt).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              ) : activeTab === 'communities' ? (
                communities.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                      <div className="relative mb-6">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 blur-3xl rounded-full"></div>
                        <div className="relative p-6 bg-gradient-to-br from-orange-100 to-yellow-100 dark:from-orange-900/30 dark:to-yellow-900/30 rounded-3xl">
                          <Building className="h-16 w-16 text-orange-600 dark:text-orange-400" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-foreground dark:text-gray-100 mb-3 text-center">
                        Aucune communauté trouvée
                      </h3>
                      <p className="text-muted-foreground dark:text-gray-400 text-base text-center max-w-md">
                        Essayez avec un autre terme de recherche
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {communities.map((community) => (
                      <Card key={community.id} className="relative border-2 hover:border-orange-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950 dark:border-gray-800">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-yellow-500/5 dark:from-orange-500/10 dark:to-yellow-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

                        <CardContent className="relative z-10 p-4 sm:p-6">
                          <div className="flex items-start space-x-3 sm:space-x-4">
                            <div className="relative flex-shrink-0">
                              <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white dark:border-gray-700 shadow-lg">
                                <AvatarImage src={community.avatar} alt={community.name} />
                                <AvatarFallback className="text-sm sm:text-lg font-bold bg-gradient-to-br from-orange-500 to-yellow-500 text-white">
                                  {community.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                                  {community.name}
                                </h3>
                                {community.isPrivate ? (
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <Lock className="h-3 w-3" />
                                    Privé
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <Globe className="h-3 w-3" />
                                    Public
                                  </Badge>
                                )}
                              </div>

                              {community.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                                  {community.description}
                                </p>
                              )}

                              <div className="flex items-center gap-4 mb-3">
                                <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                                  <Users className="h-4 w-4" />
                                  <span>{community.memberCount} membre{community.memberCount > 1 ? 's' : ''}</span>
                                </div>
                              </div>

                              <Button
                                size="sm"
                                onClick={() => joinCommunity(community.id)}
                                className="flex items-center gap-2 h-9 px-4 bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800 shadow-md hover:shadow-lg transition-all"
                              >
                                <UserPlus className="h-4 w-4" />
                                <span className="text-sm">Rejoindre</span>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          )}
        </div>
      </DashboardLayout>

      {/* Footer */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
