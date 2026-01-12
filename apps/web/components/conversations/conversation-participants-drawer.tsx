'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Users,
  Search,
  Crown,
  UserX,
  UserPlus,
  X,
  Ghost,
  RefreshCw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { ThreadMember } from '@meeshy/shared/types';
import { conversationsService } from '@/services/conversations.service';
import { usersService } from '@/services/users.service';
import type { User as SocketIOUser } from '@meeshy/shared/types';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { UserRoleEnum } from '@meeshy/shared/types';
import { InviteUserModal } from './invite-user-modal';
import { getUserInitials } from '@/lib/avatar-utils';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useUserStore } from '@/stores/user-store';
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';

// Helper pour détecter si un utilisateur est anonyme
function isAnonymousUser(user: any): user is AnonymousParticipant {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

interface ConversationParticipantsDrawerProps {
  conversationId: string;
  participants: ThreadMember[];
  currentUser: any;
  isGroup: boolean;
  conversationType?: string;
  userConversationRole?: UserRoleEnum;
  onParticipantRemoved?: (userId: string) => void;
  onParticipantAdded?: (userId: string) => void;
  onLinkCreated?: (link: string) => void;
}

export function ConversationParticipantsDrawer({
  conversationId,
  participants,
  currentUser,
  isGroup,
  conversationType,
  userConversationRole,
  onParticipantRemoved,
  onParticipantAdded,
  onLinkCreated
}: ConversationParticipantsDrawerProps) {
  const { t } = useI18n('conversations');
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState(''); // Filtre local des membres existants
  const [searchQuery, setSearchQuery] = useState(''); // Recherche backend de nouveaux membres
  const [isLoading, setIsLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchResults, setSearchResults] = useState<SocketIOUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);


  // TEMPS RÉEL: Activer les listeners Socket.IO pour les statuts utilisateur
  useUserStatusRealtime();

  // FALLBACK: Hook de rafraîchissement manuel si WebSocket down
  const { refresh: manualRefresh, isRefreshing } = useManualStatusRefresh(conversationId);

  // Store global des utilisateurs (mis à jour en temps réel par useUserStatusRealtime)
  const storeParticipants = useUserStore(state => state.participants);
  const setStoreParticipants = useUserStore(state => state.setParticipants);

  // Initialiser le store avec les participants au montage
  useEffect(() => {
    if (participants && participants.length > 0) {
      const users = participants.map(p => p.user);
      setStoreParticipants(users);
    }
  }, [participants, setStoreParticipants]);

  // Utiliser les participants du store (mis à jour en temps réel)
  // Fallback sur les props si le store est vide
  // Dédupliquer par oderId ou oderId pour éviter les erreurs de clés dupliquées
  const rawActiveParticipants = storeParticipants.length > 0
    ? participants.map(p => ({
        ...p,
        user: storeParticipants.find(u => u.id === p.userId) || p.user
      }))
    : participants;

  // Déduplication des participants par oderId
  const seenIds = new Set<string>();
  const activeParticipants = rawActiveParticipants.filter(p => {
    const key = p.id || p.userId;
    if (key && seenIds.has(key)) return false;
    if (key) seenIds.add(key);
    return true;
  });

  const handleManualRefresh = async () => {
    try {
      await manualRefresh();
      toast.success('Statuts rafraîchis');
    } catch (error) {
      toast.error('Erreur lors du rafraîchissement');
    }
  };

  // Vérifier si l'utilisateur actuel est admin/moderator/creator
  const currentUserParticipant = participants.find(p => p.userId === currentUser.id);
  const isAdmin = currentUserParticipant?.role === UserRoleEnum.ADMIN ||
                  currentUserParticipant?.role === UserRoleEnum.CREATOR ||
                  currentUserParticipant?.role === UserRoleEnum.MODERATOR;


  // Filtrer les participants selon le filtre LOCAL (pas d'appel backend)
  const filteredParticipants = activeParticipants.filter(participant => {
    if (!filterQuery.trim()) return true;
    const user = participant.user;
    const searchTerm = filterQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(searchTerm) ||
      user.displayName?.toLowerCase().includes(searchTerm) ||
      user.firstName?.toLowerCase().includes(searchTerm) ||
      user.lastName?.toLowerCase().includes(searchTerm) ||
      user.email?.toLowerCase().includes(searchTerm)
    );
  });

  // Séparer en ligne / hors ligne (les statuts sont maintenant en temps réel)
  const onlineParticipants = filteredParticipants.filter(p => p.user.isOnline);
  const offlineParticipants = filteredParticipants.filter(p => !p.user.isOnline);

  const getDisplayName = (user: any): string => {
    const name = user.displayName ||
           `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
           user.username;

    // Ne pas ajouter d'émoji, l'icône Ghost est affichée séparément
    return name;
  };

  const getAvatarFallback = (user: any): string => {
    return getUserInitials(user);
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!isAdmin) return;

    try {
      setIsLoading(true);
      await conversationsService.removeParticipant(conversationId, userId);
      onParticipantRemoved?.(userId);
      toast.success(t('conversationDetails.participantRemovedSuccess'));
    } catch (error) {
      console.error('Erreur lors de la suppression du participant:', error);
      toast.error(t('conversationDetails.removeParticipantError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateParticipantRole = async (userId: string, currentRole: string, newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER') => {
    if (!isAdmin) return;

    try {
      setIsLoading(true);
      await conversationsService.updateParticipantRole(conversationId, userId, newRole);

      // Rafraîchir la liste des participants
      window.location.reload(); // Simple refresh pour l'instant

      const roleNames = {
        'ADMIN': 'administrateur',
        'MODERATOR': 'modérateur',
        'MEMBER': 'membre'
      };

      toast.success(`Rôle mis à jour avec succès: ${roleNames[newRole]}`);
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du rôle:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du rôle');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour obtenir le prochain rôle (upgrade)
  const getUpgradeRole = (currentRole: string): 'ADMIN' | 'MODERATOR' | 'MEMBER' | null => {
    if (currentRole === 'MEMBER') return 'MODERATOR';
    if (currentRole === 'MODERATOR') return 'ADMIN';
    return null; // ADMIN ne peut pas être upgradé
  };

  // Fonction pour obtenir le rôle précédent (downgrade)
  const getDowngradeRole = (currentRole: string): 'ADMIN' | 'MODERATOR' | 'MEMBER' | null => {
    if (currentRole === 'ADMIN') return 'MODERATOR';
    if (currentRole === 'MODERATOR') return 'MEMBER';
    return null; // MEMBER ne peut pas être downgradé
  };

  const handleUserInvited = (user: any) => {
    onParticipantAdded?.(user);
    toast.success(`${user.displayName || user.username} a été invité à la conversation`);
  };

  // Effectuer la recherche d'utilisateurs
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await usersService.searchUsers(searchQuery);

        // Accepter response.data directement (tableau) OU response si c'est un tableau
        let users = Array.isArray(response.data) ? response.data : (Array.isArray(response) ? response : []);

        setSearchResults(users);
      } catch (error) {
        console.error('Erreur lors de la recherche d\'utilisateurs:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // Ajouter un participant depuis la recherche
  const handleAddParticipant = async (user: SocketIOUser) => {
    if (!isAdmin) return;

    try {
      setIsLoading(true);
      await conversationsService.addParticipant(conversationId, user.id);
      onParticipantAdded?.(user.id);
      toast.success(`${user.displayName || user.username} a été ajouté à la conversation`);
      setSearchQuery(''); // Réinitialiser la recherche
      setSearchResults([]);
    } catch (error: any) {
      console.error('Erreur lors de l\'ajout du participant:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout du participant');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Bouton trigger */}
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full h-10 w-10 p-0 hover:bg-accent/50 relative"
        title={t('conversationUI.participants')}
        onClick={() => setIsOpen(true)}
      >
        <Users className="h-5 w-5" />
        {participants.length > 0 && (
          <div className={`absolute -top-1 -right-1 h-5 w-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-medium ${participants.length > 99 ? 'text-[9px]' : 'text-xs'}`}>
            {participants.length > 99 ? '99+' : participants.length}
          </div>
        )}
      </Button>

      {/* Drawer (Sheet) qui s'ouvre depuis la GAUCHE */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent 
          side="left" 
          className="w-[400px] sm:w-[500px] p-0 bg-card"
        >
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-lg font-semibold">
              {t('conversationUI.participants')} ({participants.length})
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 py-4">
            {/* SECTION 1: Filtre local des membres existants */}
            <div className="mb-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Filtrer les membres
              </label>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('conversationDetails.searchParticipants') || "Filtrer par nom, username..."}
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="pl-10 pr-10 bg-accent/50"
                  />
                  {/* Bouton X pour effacer le filtre */}
                  {filterQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Effacer le filtre"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="h-10 w-10 p-0 flex-shrink-0"
                  title="Rafraîchir les statuts"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* SECTION 2: Ajouter un membre (visible uniquement si admin/moderator/creator) */}
            {isAdmin && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Ajouter un membre
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un utilisateur à ajouter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {/* Bouton X pour effacer la recherche */}
                  {searchQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Effacer la recherche"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Résultats de la recherche */}
                {isSearching && searchQuery.length >= 2 && (
                  <div className="mt-3 text-center text-sm text-muted-foreground">
                    Recherche en cours...
                  </div>
                )}

                {searchQuery.length >= 2 && searchResults.length > 0 && (
                  <ScrollArea className="mt-3 max-h-[200px]">
                    <div className="space-y-2">
                      {searchResults.map((user, index) => {
                        const isAlreadyMember = activeParticipants.some(p => p.userId === user.id);
                        return (
                          <div
                            key={`search-${user.id}-${index}`}
                            className="flex items-center gap-3 p-2 rounded hover:bg-white/50 dark:hover:bg-blue-900/20"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{user.displayName || user.username}</p>
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                            {isAlreadyMember ? (
                              <Badge variant="secondary" className="text-xs">
                                Déjà membre
                              </Badge>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleAddParticipant(user)}
                                disabled={isLoading}
                                className="h-8 px-3"
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                Ajouter
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}

                {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                  <div className="mt-3 text-center text-sm text-muted-foreground">
                    Aucun utilisateur trouvé
                  </div>
                )}
              </div>
            )}

            {/* Liste scrollable */}
            <ScrollArea className="h-[calc(100vh-240px)]">
              <div className="space-y-6">
                {/* Section En ligne */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {t('conversationUI.online')}
                    </span>
                    <Badge variant="secondary">{onlineParticipants.length}</Badge>
                  </div>
                  
                  {onlineParticipants.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      {t('conversationDetails.noOneOnline')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {onlineParticipants.map((participant, index) => {
                        const user = participant.user;
                        const isCurrentUser = user.id === currentUser.id;
                        return (
                          <div
                            key={`online-${participant.id || participant.userId}-${index}`}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                          >
                            <div className="relative">
                              {isAnonymousUser(user) ? (
                                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                  <Ghost className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                </div>
                              ) : (
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={user.avatar} />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {getAvatarFallback(user)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <OnlineIndicator
                                isOnline={getUserStatus(user) === 'online'}
                                status={getUserStatus(user)}
                                size="md"
                                className="absolute -bottom-0.5 -right-0.5"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {isAnonymousUser(user) && (
                                    <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                  )}
                                  {getDisplayName(user)}
                                  {isCurrentUser && ` (${t('conversationDetails.you')})`}
                                </span>
                                {(['ADMIN', 'CREATOR'].includes(participant.role)) &&
                                  <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>@{user.username}</span>
                                <span>•</span>
                                <span className="text-green-600">{t('conversationUI.online')}</span>
                              </div>
                            </div>
                            {isAdmin && !isCurrentUser && (
                              <div className="flex items-center gap-1">
                                {/* Bouton Upgrade (si possible) */}
                                {participant.role !== 'CREATOR' && getUpgradeRole(participant.role) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newRole = getUpgradeRole(participant.role);
                                      if (newRole) {
                                        handleUpdateParticipantRole(user.id, participant.role, newRole);
                                      }
                                    }}
                                    disabled={isLoading}
                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    title="Promouvoir"
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                )}
                                {/* Bouton Downgrade (si possible) */}
                                {participant.role !== 'CREATOR' && getDowngradeRole(participant.role) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newRole = getDowngradeRole(participant.role);
                                      if (newRole) {
                                        handleUpdateParticipantRole(user.id, participant.role, newRole);
                                      }
                                    }}
                                    disabled={isLoading}
                                    className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                    title="Rétrograder"
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                )}
                                {/* Bouton Supprimer */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveParticipant(user.id)}
                                  disabled={isLoading}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title={t('conversationDetails.removeFromGroup')}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section Hors ligne */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {t('conversationDetails.offline')}
                    </span>
                    <Badge variant="outline">{offlineParticipants.length}</Badge>
                  </div>
                  
                  {offlineParticipants.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      {t('conversationDetails.noOfflineParticipants')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {offlineParticipants.map((participant, index) => {
                        const user = participant.user;
                        const isCurrentUser = user.id === currentUser.id;
                        return (
                          <div
                            key={`offline-${participant.id || participant.userId}-${index}`}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                          >
                            <div className="relative">
                              {isAnonymousUser(user) ? (
                                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center opacity-50">
                                  <Ghost className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                </div>
                              ) : (
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={user.avatar} />
                                  <AvatarFallback className="bg-muted text-muted-foreground">
                                    {getAvatarFallback(user)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div className="absolute -bottom-0 -right-0 h-3 w-3 bg-muted-foreground/50 rounded-full border-2 border-card" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {isAnonymousUser(user) && (
                                    <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                  )}
                                  {getDisplayName(user)}
                                  {isCurrentUser && ` (${t('conversationDetails.you')})`}
                                </span>
                                {(['ADMIN', 'CREATOR'].includes(participant.role)) &&
                                  <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>@{user.username}</span>
                                <span>•</span>
                                <span>{t('conversationDetails.offline')}</span>
                              </div>
                            </div>
                            {isAdmin && !isCurrentUser && (
                              <div className="flex items-center gap-1">
                                {/* Bouton Upgrade (si possible) */}
                                {participant.role !== 'CREATOR' && getUpgradeRole(participant.role) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newRole = getUpgradeRole(participant.role);
                                      if (newRole) {
                                        handleUpdateParticipantRole(user.id, participant.role, newRole);
                                      }
                                    }}
                                    disabled={isLoading}
                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    title="Promouvoir"
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                )}
                                {/* Bouton Downgrade (si possible) */}
                                {participant.role !== 'CREATOR' && getDowngradeRole(participant.role) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newRole = getDowngradeRole(participant.role);
                                      if (newRole) {
                                        handleUpdateParticipantRole(user.id, participant.role, newRole);
                                      }
                                    }}
                                    disabled={isLoading}
                                    className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                    title="Rétrograder"
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                )}
                                {/* Bouton Supprimer */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveParticipant(user.id)}
                                  disabled={isLoading}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title={t('conversationDetails.removeFromGroup')}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modale d'invitation d'utilisateurs */}
      <InviteUserModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        conversationId={conversationId}
        currentParticipants={participants.map(p => p.user)}
        onUserInvited={handleUserInvited}
      />
    </>
  );
}

