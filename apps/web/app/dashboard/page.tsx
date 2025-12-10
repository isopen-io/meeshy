'use client';

import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useI18n } from '@/hooks/useI18n';
import { 
  MessageSquare, 
  Users, 
  Settings, 
  Plus,
  User as UserIcon,
  Activity,
  TrendingUp,
  Globe2,
  Zap,
  Link2,
  RefreshCw,
  Share2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CreateLinkButton } from '@/components/conversations/create-link-button';
import { CreateLinkModalV2 } from '@/components/conversations/create-link-modal';
import { CreateConversationModal } from '@/components/conversations/create-conversation-modal';
// Import supprimé - la modal sera définie dans ce fichier
import { ShareAffiliateButton } from '@/components/affiliate/share-affiliate-button';
import { ShareAffiliateModal } from '@/components/affiliate/share-affiliate-modal';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { User, Conversation } from '@/types';
import { useUser } from '@/stores';
import { dashboardService, type DashboardData } from '@/services/dashboard.service';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
// Avatar déjà importé plus haut
import { Check, X, Shield, Eye, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { buildApiUrl } from '@/lib/config';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { authManager } from '@/services/auth-manager.service';
import { Footer } from '@/components/layout/Footer';

function DashboardPageContent() {
  const router = useRouter();
  const user = useUser();
  const { t, currentLanguage } = useI18n('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isCreateLinkModalOpen, setIsCreateLinkModalOpen] = useState(false);
  const [isCreateConversationModalOpen, setIsCreateConversationModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  
  // États pour la modal de groupe
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isGroupPrivate, setIsGroupPrivate] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const loadDashboardData = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    
    // Avoid too frequent API calls (30 second cache)
    const now = Date.now();
    const CACHE_DURATION = 30000; // 30 seconds
    
    if (!forceRefresh && dashboardData && (now - lastFetchTime) < CACHE_DURATION) {
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await dashboardService.getDashboardData();
      if (response.data) {
        setDashboardData(response.data);
        setLastFetchTime(now);
      } else {
        throw new Error(t('dataLoadingError'));
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError(err instanceof Error ? err : new Error(t('errorUnknown')));
    } finally {
      setIsLoading(false);
    }
  }, [user, t, dashboardData, lastFetchTime]);

  const refresh = useCallback(() => {
    loadDashboardData(true); // Force refresh
  }, [loadDashboardData]);

  // Handlers pour les modales
  const handleConversationCreated = (conversationId: string) => {
    toast.success(t('success.conversationCreated'));
    setIsCreateConversationModalOpen(false);
    router.push(`/conversations/${conversationId}`);
    loadDashboardData(true);
  };

  const handleGroupCreated = (groupId: string) => {
    toast.success(t('success.groupCreated'));
    setIsCreateGroupModalOpen(false);
    router.push(`/groups/${groupId}`);
    loadDashboardData(true);
  };

  const handleLinkCreated = () => {
    toast.success(t('success.linkCreated'));
    setIsCreateLinkModalOpen(false);
    loadDashboardData(true);
  };

  // Fonctions pour la modal de groupe
  const loadUsers = useCallback(async (searchQuery: string = '') => {
    setIsLoadingUsers(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) return;
      
      const url = searchQuery.trim() 
        ? `${buildApiUrl('/users/search')}?q=${encodeURIComponent(searchQuery)}`
        : buildApiUrl('/users');
        
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const users = (data.data || data.users || []).filter((user: User) => 
          user.id !== user?.id && 
          !selectedUsers.some(selected => selected.id === user.id)
        );
        setAvailableUsers(users);
      } else {
        console.error('Erreur API:', response.status, response.statusText);
        toast.error('Erreur lors du chargement des utilisateurs');
      }
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [user?.id, selectedUsers]);

  const toggleUserSelection = (user: User) => {
    setSelectedUsers(prev => {
      const isSelected = prev.some(u => u.id === user.id);
      if (isSelected) {
        return prev.filter(u => u.id !== user.id);
      } else {
        return [...prev, user];
      }
    });
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Veuillez saisir un nom pour le groupe');
      return;
    }

    setIsCreatingGroup(true);
    try {
      const token = authManager.getAuthToken();

      const response = await fetch(buildApiUrl('/groups'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          isPrivate: isGroupPrivate,
          memberIds: selectedUsers.map(u => u.id)
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Groupe créé avec succès');
        handleGroupCreated(data.group.id);
        handleGroupModalClose();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Erreur lors de la création du groupe');
      }
    } catch (error) {
      console.error('Erreur création groupe:', error);
      toast.error('Erreur lors de la création du groupe');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleGroupModalClose = () => {
    setGroupName('');
    setGroupDescription('');
    setIsGroupPrivate(false);
    setSelectedUsers([]);
    setGroupSearchQuery('');
    setAvailableUsers([]);
    setIsCreateGroupModalOpen(false);
  };

  useEffect(() => {
    if (user) {
      loadDashboardData();
    } else {
      setIsLoading(false);
    }
  }, [user, loadDashboardData]);

  // Effet pour charger les utilisateurs quand la modal s'ouvre
  useEffect(() => {
    if (isCreateGroupModalOpen) {
      loadUsers();
    }
  }, [isCreateGroupModalOpen, loadUsers]);

  // Effet pour gérer la recherche en temps réel avec debounce
  useEffect(() => {
    if (isCreateGroupModalOpen && groupSearchQuery.trim()) {
      const timer = setTimeout(() => {
        loadUsers(groupSearchQuery);
      }, 300); // Debounce de 300ms

      return () => clearTimeout(timer);
    } else if (isCreateGroupModalOpen && !groupSearchQuery.trim()) {
      // Si la recherche est vide, charger tous les utilisateurs
      loadUsers();
    }
  }, [groupSearchQuery, isCreateGroupModalOpen, loadUsers]);

  // Extract dashboard data with memoization
  const stats = useMemo(() => dashboardData?.stats || {
    totalConversations: 0,
    totalCommunities: 0,
    totalMessages: 0,
    activeConversations: 0,
    translationsToday: 0,
    totalLinks: 0,
    lastUpdated: new Date(),
  }, [dashboardData?.stats]);
  
  const recentConversations = useMemo(() => dashboardData?.recentConversations || [], [dashboardData?.recentConversations]);
  const recentCommunities = useMemo(() => dashboardData?.recentCommunities || [], [dashboardData?.recentCommunities]);

  // Gestion de l'erreur et du chargement
  if (error) {
    return (
      <DashboardLayout>
                    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
              <div className="text-red-500">
                {t('errorLoading', { message: error.message })}
              </div>
              <Button onClick={refresh} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('retry')}
              </Button>
            </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <DashboardLayout className="!bg-none !bg-transparent !h-auto">
        {/* Greeting and quick actions */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {t('greeting', { name: user?.firstName || user?.username || t('greetingFallback') })}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {t('overview')}
                </p>
              </div>
          
                                <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button 
              className="bg-purple-600 hover:bg-purple-700 flex-1 sm:flex-none" 
              onClick={() => setIsShareModalOpen(true)}
            >
              <Share2 className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('actions.shareApp')}</span>
              <span className="sm:hidden">{t('shareApp')}</span>
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none" 
              onClick={() => router.push('/links')}
            >
              <Link2 className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('actions.createLink')}</span>
              <span className="sm:hidden">{t('createLink')}</span>
            </Button>
            <Button 
              onClick={() => router.push('/conversations?new=true')}
              className="bg-blue-600 hover:bg-blue-700 flex-1 sm:flex-none"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('actions.createConversation')}</span>
              <span className="sm:hidden">{t('createConversation')}</span>
            </Button>
            <Button 
              variant="outline"
              onClick={() => router.push('/groups?new=true')}
              className="flex-1 sm:flex-none"
            >
              <Users className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('actions.createCommunity')}</span>
              <span className="sm:hidden">{t('createCommunity')}</span>
            </Button>
          </div>
        </div>
      </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white dark:from-blue-600 dark:to-blue-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium dark:text-gray-100">{t('stats.conversations')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{stats.totalConversations}</p>
                  <p className="text-blue-100 text-sm">{t('stats.total')}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white dark:from-green-600 dark:to-green-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium dark:text-gray-100">{t('stats.communities')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{stats.totalCommunities}</p>
                  <p className="text-green-100 text-sm">{t('stats.active')}</p>
                </div>
                <Users className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white dark:from-purple-600 dark:to-purple-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium dark:text-gray-100">{t('stats.messages')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{stats.totalMessages}</p>
                  <p className="text-purple-100 text-sm">{t('stats.thisWeek')}</p>
                </div>
                <Activity className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white dark:from-orange-600 dark:to-orange-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium dark:text-gray-100">{t('stats.activeConversationsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{stats.activeConversations}</p>
                  <p className="text-orange-100 text-sm">{t('stats.inProgress')}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white dark:from-indigo-600 dark:to-indigo-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium dark:text-gray-100">{t('stats.translations')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{stats.translationsToday}</p>
                  <p className="text-indigo-100 text-sm">{t('stats.today')}</p>
                </div>
                <Globe2 className="h-8 w-8 text-indigo-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-pink-500 to-pink-600 text-white dark:from-pink-600 dark:to-pink-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium dark:text-gray-100">{t('stats.links')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{stats.totalLinks}</p>
                  <p className="text-pink-100 text-sm">{t('stats.created')}</p>
                </div>
                <Link2 className="h-8 w-8 text-pink-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content in grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent conversations */}
          <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-gray-100">
                  <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span>{t('recentConversations')}</span>
                </CardTitle>
                                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => router.push('/conversations')}
                    className="dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
                  >
                    {t('actions.viewAll')}
                  </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentConversations.map((conversation) => (
                  <div 
                    key={conversation.id}
                    className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/conversations/${conversation.id}`)}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="dark:bg-gray-700 dark:text-gray-300">
                        {conversation.type === 'group' ? 
                          <Users className="h-5 w-5" /> : 
                          <UserIcon className="h-5 w-5" />
                        }
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {conversation.title}
                        </p>
                        <div className="flex items-center space-x-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {conversation.lastMessage && new Date(conversation.lastMessage.createdAt).toLocaleTimeString(currentLanguage, {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      {conversation.lastMessage && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {(() => {
                            // Gérer les utilisateurs anonymes ET membres
                            const sender = conversation.lastMessage.anonymousSender || conversation.lastMessage.sender;
                            const isAnonymous = !!conversation.lastMessage.anonymousSender;

                            const senderPrefix = sender ? (
                              <span className="font-medium">
                                {sender.displayName ||
                                 sender.username ||
                                 (sender.firstName && sender.lastName
                                   ? `${sender.firstName} ${sender.lastName}`.trim()
                                   : isAnonymous ? t('anonymous') || 'Anonyme' : 'Utilisateur')}
                                {isAnonymous && ' (anonyme)'}
                                :{' '}
                              </span>
                            ) : null;

                            // Si le message a un attachement et pas de contenu texte, afficher les détails de l'attachement
                            if (conversation.lastMessage.attachments && conversation.lastMessage.attachments.length > 0 && !conversation.lastMessage.content) {
                              const attachment = conversation.lastMessage.attachments[0];
                              const mimeType = attachment.mimeType || '';

                              return (
                                <>
                                  {senderPrefix}
                                  <span className="inline-flex items-center gap-1.5">
                                    {(() => {
                                      // Déterminer le type et l'icône
                                      if (mimeType.startsWith('image/')) {
                                        return (
                                          <>
                                            <span className="inline-flex text-blue-500">📷</span>
                                            {attachment.width && attachment.height && (
                                              <span className="text-xs">{attachment.width}×{attachment.height}</span>
                                            )}
                                          </>
                                        );
                                      } else if (mimeType.startsWith('video/')) {
                                        // Formater durée vidéo avec millisecondes
                                        const formatVideoDuration = (milliseconds: number): string => {
                                          const totalSeconds = Math.floor(milliseconds / 1000);
                                          const ms = Math.floor((milliseconds % 1000) / 10); // Centièmes
                                          const mins = Math.floor(totalSeconds / 60);
                                          const secs = totalSeconds % 60;
                                          return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
                                        };
                                        return (
                                          <>
                                            <span className="inline-flex text-red-500">🎥</span>
                                            {attachment.duration && (
                                              <span className="text-xs">{formatVideoDuration(attachment.duration)}</span>
                                            )}
                                            {attachment.width && attachment.height && (
                                              <span className="text-xs">• {attachment.width}×{attachment.height}</span>
                                            )}
                                          </>
                                        );
                                      } else if (mimeType.startsWith('audio/')) {
                                        // Extraire les effets appliqués depuis la timeline
                                        const effectIcons: Record<string, string> = {
                                          'voice-coder': '🎤',
                                          'baby-voice': '👶',
                                          'demon-voice': '😈',
                                          'back-sound': '🎶',
                                        };
                                        const appliedEffects: string[] = [];
                                        // audioEffectsTimeline est stocké dans metadata
                                        const audioEffectsTimeline = (attachment as any).metadata?.audioEffectsTimeline;

                                        if (audioEffectsTimeline?.events) {
                                          const effects = new Set<string>();
                                          for (const event of audioEffectsTimeline.events) {
                                            if (event.action === 'activate') {
                                              effects.add(event.effectType);
                                            }
                                          }
                                          appliedEffects.push(...Array.from(effects));
                                        }

                                        // Déterminer l'icône d'effet à afficher
                                        let effectDisplay = '';
                                        if (appliedEffects.length === 1) {
                                          // Un seul effet : afficher son icône
                                          effectDisplay = effectIcons[appliedEffects[0]] || '🎚️';
                                        } else if (appliedEffects.length > 1) {
                                          // Plusieurs effets : afficher l'icône générique
                                          effectDisplay = '🎚️';
                                        }

                                        // Formater la durée audio avec millisecondes
                                        const formatAudioDuration = (milliseconds: number): string => {
                                          const totalSeconds = Math.floor(milliseconds / 1000);
                                          const ms = Math.floor((milliseconds % 1000) / 10); // Centièmes
                                          const hours = Math.floor(totalSeconds / 3600);
                                          const mins = Math.floor((totalSeconds % 3600) / 60);
                                          const secs = Math.floor(totalSeconds % 60);
                                          if (hours > 0) {
                                            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
                                          }
                                          return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
                                        };

                                        return (
                                          <>
                                            <span className="inline-flex text-purple-500">🎵</span>
                                            {attachment.duration && (
                                              <span className="text-xs ml-1">{formatAudioDuration(attachment.duration)}</span>
                                            )}
                                            {effectDisplay && (
                                              <span className="text-xs ml-1">• {effectDisplay}</span>
                                            )}
                                          </>
                                        );
                                      } else if (mimeType === 'application/pdf') {
                                        return (
                                          <>
                                            <span className="inline-flex text-orange-500">📄</span>
                                            {attachment.pageCount && (
                                              <span className="text-xs">{attachment.pageCount} page{attachment.pageCount > 1 ? 's' : ''}</span>
                                            )}
                                          </>
                                        );
                                      } else if (mimeType.includes('markdown') || (attachment.originalName && attachment.originalName.endsWith('.md'))) {
                                        return (
                                          <>
                                            <span className="inline-flex text-blue-500">📝</span>
                                            {attachment.lineCount && (
                                              <span className="text-xs">{attachment.lineCount} ligne{attachment.lineCount > 1 ? 's' : ''}</span>
                                            )}
                                          </>
                                        );
                                      } else if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('python')) {
                                        return (
                                          <>
                                            <span className="inline-flex text-green-500">💻</span>
                                            {attachment.lineCount && (
                                              <span className="text-xs">{attachment.lineCount} ligne{attachment.lineCount > 1 ? 's' : ''}</span>
                                            )}
                                          </>
                                        );
                                      } else {
                                        return <span className="inline-flex text-gray-500">📎</span>;
                                      }
                                    })()}
                                    {conversation.lastMessage.attachments.length > 1 && (
                                      <span className="text-xs font-medium">+{conversation.lastMessage.attachments.length - 1}</span>
                                    )}
                                  </span>
                                </>
                              );
                            }

                            // Sinon afficher le contenu texte normal
                            return (
                              <>
                                {senderPrefix}
                                {conversation.lastMessage.content}
                              </>
                            );
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                
                {recentConversations.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="h-12 w-12 text-gray-300 dark:text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{t('emptyStates.noRecentConversations')}</p>
                                          <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        onClick={() => router.push('/conversations?new=true')}
                      >
                        {t('actions.startConversation')}
                      </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent groups */}
          <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                                  <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-gray-100">
                    <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span>{t('recentCommunities')}</span>
                  </CardTitle>
                                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => router.push('/groups')}
                    className="dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
                  >
                    {t('actions.viewAll')}
                  </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCommunities.map((community) => (
                                    <div 
                    key={community.id}
                    className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/groups/${community.id}`)}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="dark:bg-gray-700 dark:text-gray-300">
                        <Users className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {community.name}
                        </p>
                        <div className="flex items-center space-x-1">
                          {community.isPrivate && (
                            <Badge variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">
                              {t('communities.private')}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                            {t('communities.membersCount', { count: community.members.length.toString() })}
                          </Badge>
                        </div>
                      </div>
                      {community.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {community.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                
                {recentCommunities.length === 0 && (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-300 dark:text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{t('emptyStates.noRecentCommunities')}</p>
                                          <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        onClick={() => router.push('/groups?new=true')}
                      >
                        {t('actions.createCommunityButton')}
                      </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions at bottom */}
        <div className="mt-8">
          <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardHeader>
                              <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-gray-100">
                  <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <span>{t('quickActions.title')}</span>
                </CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  {t('quickActions.description')}
                </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                  <Button 
                    variant="outline" 
                    className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    onClick={() => setIsCreateConversationModalOpen(true)}
                  >
                    <MessageSquare className="h-6 w-6" />
                    <span>{t('quickActions.newConversation')}</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    onClick={() => setIsCreateLinkModalOpen(true)}
                  >
                    <Link2 className="h-6 w-6" />
                    <span>{t('quickActions.createLink')}</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    onClick={() => setIsCreateGroupModalOpen(true)}
                  >
                    <Users className="h-6 w-6" />
                    <span>{t('quickActions.createCommunity')}</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    onClick={() => setIsShareModalOpen(true)}
                  >
                    <Share2 className="h-6 w-6" />
                    <span>{t('quickActions.shareApp')}</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    onClick={() => router.push('/settings')}
                  >
                    <Settings className="h-6 w-6" />
                    <span>{t('quickActions.settings')}</span>
                  </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Modales */}
        <CreateConversationModal
          isOpen={isCreateConversationModalOpen}
          onClose={() => setIsCreateConversationModalOpen(false)}
          currentUser={user!}
          onConversationCreated={handleConversationCreated}
        />

        <CreateLinkModalV2
          isOpen={isCreateLinkModalOpen}
          onClose={() => setIsCreateLinkModalOpen(false)}
          onLinkCreated={handleLinkCreated}
        />

        {/* Modal de création de groupe améliorée */}
        <Dialog open={isCreateGroupModalOpen} onOpenChange={handleGroupModalClose}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="dark:text-gray-100">Créer une nouvelle communauté</span>
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                Créez une communauté pour organiser vos conversations avec plusieurs personnes
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Nom du groupe */}
              <div>
                <Label htmlFor="groupName" className="text-sm font-medium dark:text-gray-200">
                  Nom de la communauté *
                </Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGroupName(e.target.value)}
                  placeholder="Ex: Équipe Marketing, Famille, Amis..."
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="groupDescription" className="text-sm font-medium dark:text-gray-200">
                  Description (optionnelle)
                </Label>
                <Textarea
                  id="groupDescription"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Décrivez le but de cette communauté..."
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                  rows={2}
                />
              </div>

              {/* Confidentialité */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium dark:text-gray-200">Communauté privée</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isGroupPrivate ? 'Seuls les membres invités peuvent rejoindre' : 'La communauté peut être découverte et rejointe par d\'autres'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {isGroupPrivate ? <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
                  <Switch
                    checked={isGroupPrivate}
                    onCheckedChange={setIsGroupPrivate}
                  />
                </div>
              </div>
              
              {/* Recherche d'utilisateurs */}
              <div>
                <Label htmlFor="userSearch" className="text-sm font-medium dark:text-gray-200">
                  Rechercher des membres
                </Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    id="userSearch"
                    value={groupSearchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGroupSearchQuery(e.target.value)}
                    placeholder="Rechercher par nom ou username..."
                    className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                  />
                </div>
              </div>

              {/* Membres sélectionnés */}
              {selectedUsers.length > 0 && (
                <div>
                  <Label className="text-sm font-medium dark:text-gray-200">
                    Membres sélectionnés ({selectedUsers.length + 1} au total, vous inclus)
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {/* Utilisateur actuel (admin) */}
                    <Badge variant="default" className="flex items-center gap-1">
                      {user?.displayName || user?.username}
                      <Shield className="h-3 w-3" />
                    </Badge>
                    {/* Membres sélectionnés */}
                    {selectedUsers.map(user => (
                      <Badge
                        key={user.id}
                        variant="secondary"
                        className="flex items-center gap-1 dark:bg-gray-700 dark:text-gray-300"
                      >
                        {user.displayName || user.username}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => toggleUserSelection(user)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Liste des utilisateurs */}
              <div>
                <Label className="text-sm font-medium dark:text-gray-200">
                  Utilisateurs disponibles
                </Label>
                <ScrollArea className="h-48 mt-2 border rounded-lg dark:border-gray-600 dark:bg-gray-700/50">
                  {isLoadingUsers ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
                      Chargement des utilisateurs...
                    </div>
                  ) : availableUsers.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      {groupSearchQuery.trim() ? 'Aucun utilisateur trouvé pour cette recherche' : 'Aucun utilisateur disponible'}
                    </div>
                  ) : (
                    <div className="p-2">
                      {availableUsers.map(user => {
                        const isSelected = selectedUsers.some(u => u.id === user.id);
                        return (
                          <div
                            key={user.id}
                            className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600/50 ${
                              isSelected ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700' : ''
                            }`}
                            onClick={() => toggleUserSelection(user)}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback className="dark:bg-gray-600 dark:text-gray-300">
                                {(user.displayName || user.username).charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-medium text-sm dark:text-gray-100">
                                {user.displayName || user.username}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
                            </div>
                            {isSelected && (
                              <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
              
              {/* Actions */}
              <div className="flex space-x-3 pt-4">
                <Button
                  onClick={createGroup}
                  disabled={!groupName.trim() || isCreatingGroup}
                  className="flex-1"
                >
                  <Users className="mr-2 h-4 w-4" />
                  {isCreatingGroup ? 'Création...' : 'Créer la communauté'}
                </Button>
                <Button
                  onClick={handleGroupModalClose}
                  variant="outline"
                  className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Annuler
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ShareAffiliateModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          userLanguage={user?.systemLanguage || 'fr'}
        />
      </DashboardLayout>

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardPageContent />
    </AuthGuard>
  );
}
