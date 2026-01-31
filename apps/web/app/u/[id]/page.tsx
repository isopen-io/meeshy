'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
  ArrowLeft,
  MessageSquare,
  Users,
  Activity,
  UserPlus,
  X,
} from 'lucide-react';
import { usersService, conversationsService, type UserStats } from '@/services';
import { type User } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { useUser } from '@/stores';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { ConversationDropdown } from '@/components/contacts/ConversationDropdown';

interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  sender: User;
  receiver: User;
}

interface ProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const router = useRouter();
  const { t } = useI18n('profile');
  const { t: tCommon } = useI18n('common');
  
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUser = useUser(); // Use global store instead of separate API call
  const [userId, setUserId] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);

  // Hook pour écouter les changements de statut en temps réel
  const { } = useSocketIOMessaging({
    onUserStatus: (statusUserId: string, username: string, isOnline: boolean) => {
      if (statusUserId === userId) {
        setUser(prevUser => prevUser ? { ...prevUser, isOnline } : null);
      }
    }
  });

  // Résoudre les paramètres asynchrones
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      const id = resolvedParams.id;
      
      if (!id || id === 'me') {
        router.push('/u');
        return;
      }
      
      setUserId(id);
    };
    resolveParams();
  }, [params, router]);

  const loadUserProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await usersService.getUserProfile(userId);
      setUser(response.data);
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error(t('userNotFound'));
    }
  }, [userId, t]);

  const loadUserStats = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await usersService.getUserStats(userId);
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [userId]);

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
      console.error('Error loading friend requests:', error);
    }
  }, []);

  const getPendingRequestWithUser = useCallback((targetUserId: string): FriendRequest | undefined => {
    return friendRequests.find(
      (req) =>
        req.status === 'pending' &&
        ((req.senderId === currentUser?.id && req.receiverId === targetUserId) ||
          (req.senderId === targetUserId && req.receiverId === currentUser?.id))
    );
  }, [friendRequests, currentUser]);

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([
          loadUserProfile(),
          loadUserStats(),
          loadFriendRequests(),
        ]);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      setLoading(true);
      loadData();
    }
  }, [userId, loadUserProfile, loadUserStats, loadFriendRequests]);

  const handleStartConversation = async () => {
    if (!user || !currentUser) {
      console.warn('[ProfilePage] Missing user data:', { user: !!user, currentUser: !!currentUser });
      return;
    }

    // Prevent creating conversation with oneself
    if (user.id === currentUser.id) {
      toast.error(t('errors.cannotMessageYourself'));
      return;
    }

    // Validate that user has a valid ID
    if (!user.id || user.id.trim().length === 0) {
      toast.error(t('errors.invalidUser'));
      return;
    }

    try {
      // Log user data for debugging

      // Créer le nom de la conversation avec les deux usernames
      const conversationName = `${getUserUsername(currentUser)} & ${getUserUsername(user)}`;

      const response = await conversationsService.createConversation({
        type: 'direct',
        title: conversationName,
        participantIds: [user.id], // Don't include currentUser.id - backend adds creator automatically
      });

      router.push(`/conversations/${response.id}`);
      toast.success(t('success.conversationCreated'));
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error(t('errors.conversationCreationFailed'));
    }
  };

  const handleSendFriendRequest = async () => {
    if (!user) return;

    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error(t('errors.sessionExpired'));
        router.push('/login');
        return;
      }

      const response = await fetch(buildApiUrl('/users/friend-requests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiverId: user.id })
      });

      if (response.ok) {
        toast.success(t('success.friendRequestSent'));
        loadFriendRequests(); // Recharger les demandes
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.sendFriendRequestFailed'));
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast.error(t('errors.sendFriendRequestFailed'));
    }
  };

  const handleCancelFriendRequest = async (requestId: string) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error(t('errors.sessionExpired'));
        router.push('/login');
        return;
      }

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
        loadFriendRequests(); // Recharger les demandes
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.cancelFriendRequestFailed'));
      }
    } catch (error) {
      console.error('Error cancelling friend request:', error);
      toast.error(t('errors.cancelFriendRequestFailed'));
    }
  };

  const getUserDisplayName = (userData: User): string => {
    if (userData.displayName) return userData.displayName;
    
    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    
    return fullName || userData.username || 'User';
  };

  const getUserUsername = (userData: User): string => {
    return userData.username || userData.displayName || userData.firstName || 'user';
  };

  const isMyProfile = currentUser?.id === userId;

  if (loading) {
    return (
      <DashboardLayout title={t('title')} hideSearch className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        <div className="w-full px-4 md:px-8">
          <div className="flex items-center space-x-4 mb-8">
            <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <div>
              <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout title={t('title')} hideSearch className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        <div className="w-full px-4 md:px-8">
          <div className="flex items-center space-x-4 mb-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {tCommon('back')}
            </Button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          </div>

          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {t('userNotFound')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-center max-w-sm">
                {t('userNotFoundDescription')}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={getUserDisplayName(user)} hideSearch className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
      <div className="w-full px-4 md:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {tCommon('back')}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Profile */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('userProfile')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start space-x-6">
                  <div className="relative">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                        {getUserDisplayName(user).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {/* Online status indicator with 3 states: green (online), orange (away), grey (offline) */}
                    <OnlineIndicator
                      isOnline={getUserStatus(user) === 'online'}
                      status={getUserStatus(user)}
                      size="lg"
                      className="absolute bottom-1 right-1"
                    />
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {getUserDisplayName(user)}
                      </h2>
                      {user.username && (
                        <p className="text-gray-600 dark:text-gray-400">@{user.username}</p>
                      )}
                    </div>

                    {user.createdAt && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t('memberSince')} {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    )}

                    {!isMyProfile && (
                      <div className="flex flex-col sm:flex-row gap-3">
                        {/* Afficher soit "Ajouter" soit "Annuler" selon l'état de la demande */}
                        {(() => {
                          const pendingRequest = getPendingRequestWithUser(user.id);
                          if (pendingRequest) {
                            return (
                              <Button
                                onClick={() => handleCancelFriendRequest(pendingRequest.id)}
                                variant="outline"
                                className="w-full sm:w-auto border-2 border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30"
                              >
                                <X className="h-4 w-4 mr-2" />
                                {t('cancelFriendRequest')}
                              </Button>
                            );
                          }
                          return (
                            <Button
                              onClick={handleSendFriendRequest}
                              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              {t('addFriend')}
                            </Button>
                          );
                        })()}
                        {/* Dropdown pour gérer les conversations */}
                        <ConversationDropdown
                          userId={user.id}
                          onCreateNew={handleStartConversation}
                          variant="outline"
                          className="w-full sm:w-auto"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* User Stats */}
          {stats && (
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="h-5 w-5" />
                    <span>{t('userStats')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">
                        {stats.messagesSent || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('messagesSent')}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {stats.messagesReceived || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('messagesReceived')}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">
                        {stats.conversationsCount || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('conversations')}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600">
                        {stats.groupsCount || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('groups')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
