'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { ThreadMember } from '@meeshy/shared/types';
import { conversationsService } from '@/services/conversations.service';
import { participantsService } from '@/services/conversations/participants.service';
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
  /** Nombre total de membres (depuis conversation.memberCount) */
  memberCount?: number;
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
  memberCount,
  onParticipantRemoved,
  onParticipantAdded,
  onLinkCreated
}: ConversationParticipantsDrawerProps) {
  // Utiliser memberCount si disponible, sinon fallback sur participants.length
  const totalMemberCount = memberCount ?? participants.length;
  const { t } = useI18n('conversations');
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchResults, setSearchResults] = useState<SocketIOUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Résultats de la recherche backend des participants
  const [backendSearchResults, setBackendSearchResults] = useState<ThreadMember[] | null>(null);
  const [isFilterSearching, setIsFilterSearching] = useState(false);

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
  const rawActiveParticipants = storeParticipants.length > 0
    ? participants.map(p => ({
        ...p,
        user: storeParticipants.find(u => u.id === p.userId) || p.user
      }))
    : participants;

  // Déduplication des participants
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

  // Recherche backend des participants quand filterQuery change
  useEffect(() => {
    const searchParticipants = async () => {
      if (!filterQuery.trim() || filterQuery.length < 2) {
        setBackendSearchResults(null);
        return;
      }

      setIsFilterSearching(true);
      try {
        const results = await participantsService.searchParticipants(conversationId, filterQuery, 50);
        // Mapper les résultats en ThreadMember
        const mappedResults: ThreadMember[] = results.map(user => ({
          id: user.id,
          conversationId,
          userId: user.id,
          user,
          role: (user as any).conversationRole || 'MEMBER',
          joinedAt: new Date(),
          isActive: true,
          isAnonymous: (user as any).isAnonymous || false,
        }));
        setBackendSearchResults(mappedResults);
      } catch (error) {
        console.error('Erreur lors de la recherche des participants:', error);
        setBackendSearchResults(null);
      } finally {
        setIsFilterSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchParticipants, 300);
    return () => clearTimeout(debounceTimer);
  }, [filterQuery, conversationId]);

  // Utiliser les résultats backend si disponibles, sinon filtre local
  const filteredParticipants = backendSearchResults !== null
    ? backendSearchResults
    : activeParticipants.filter(participant => {
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

  // Séparer en ligne / hors ligne
  const onlineParticipants = filteredParticipants.filter(p => p.user.isOnline);
  const offlineParticipants = filteredParticipants.filter(p => !p.user.isOnline);

  const getDisplayName = (user: any): string => {
    const name = user.displayName ||
           `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
           user.username;
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
      window.location.reload();

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

  const getUpgradeRole = (currentRole: string): 'ADMIN' | 'MODERATOR' | 'MEMBER' | null => {
    if (currentRole === 'MEMBER') return 'MODERATOR';
    if (currentRole === 'MODERATOR') return 'ADMIN';
    return null;
  };

  const getDowngradeRole = (currentRole: string): 'ADMIN' | 'MODERATOR' | 'MEMBER' | null => {
    if (currentRole === 'ADMIN') return 'MODERATOR';
    if (currentRole === 'MODERATOR') return 'MEMBER';
    return null;
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
      setSearchQuery('');
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
      {/* Bouton trigger avec effet moderne */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full h-10 w-10 p-0 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-indigo-500/10 relative group transition-all duration-200"
          title={t('conversationUI.participants')}
          onClick={() => setIsOpen(true)}
          aria-label={`${t('conversationUI.participants')} (${totalMemberCount})`}
        >
          <Users className="h-5 w-5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          {totalMemberCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`absolute -top-1 -right-1 h-5 w-5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-full flex items-center justify-center font-medium shadow-lg ${totalMemberCount > 99 ? 'text-[9px]' : 'text-xs'}`}
            >
              {totalMemberCount > 99 ? '99+' : totalMemberCount}
            </motion.div>
          )}
        </Button>
      </motion.div>

      {/* Drawer moderne avec glassmorphism */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="left"
          className="w-[400px] sm:w-[500px] p-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 border-r border-white/20 dark:border-gray-700/30"
        >
          {/* Header avec effet glassmorphism */}
          <SheetHeader className="px-6 py-4 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-b border-white/30 dark:border-gray-700/40">
            <SheetTitle className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t('conversationUI.participants')} ({totalMemberCount})
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 py-4">
            {/* Filtre local avec effet moderne */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-4"
            >
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Filtrer les membres
              </label>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  {isFilterSearching ? (
                    <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  )}
                  <Input
                    placeholder={t('conversationDetails.searchParticipants') || "Rechercher un membre..."}
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="pl-10 pr-10 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 focus-visible:ring-blue-500 focus-visible:border-blue-500"
                  />
                  {filterQuery.length > 0 && (
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      type="button"
                      onClick={() => setFilterQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label="Effacer le filtre"
                    >
                      <X className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="h-10 w-10 p-0 flex-shrink-0 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 hover:bg-blue-500/10"
                    title="Rafraîchir les statuts"
                    aria-label="Rafraîchir les statuts"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                  </Button>
                </motion.div>
              </div>
            </motion.div>

            {/* Section ajouter un membre avec effet moderne */}
            {isAdmin && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-4 p-4 backdrop-blur-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/30 shadow-sm"
              >
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Ajouter un membre
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher un utilisateur à ajouter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 bg-white/80 dark:bg-gray-900/80 border-blue-200/50 dark:border-blue-800/30 focus-visible:ring-blue-500"
                  />
                  {searchQuery.length > 0 && (
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label="Effacer la recherche"
                    >
                      <X className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </div>

                {/* Résultats de la recherche */}
                <AnimatePresence>
                  {isSearching && searchQuery.length >= 2 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 text-center text-sm text-gray-500"
                    >
                      Recherche en cours...
                    </motion.div>
                  )}

                  {searchQuery.length >= 2 && searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <ScrollArea className="mt-3 max-h-[200px]">
                        <div className="space-y-2">
                          {searchResults.map((user, index) => {
                            const isAlreadyMember = activeParticipants.some(p => p.userId === user.id);
                            return (
                              <motion.div
                                key={`search-${user.id}-${index}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="flex items-center gap-3 p-2 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                              >
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={user.avatar} />
                                  <AvatarFallback className="text-xs">{getUserInitials(user)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{user.displayName || user.username}</p>
                                  <p className="text-xs text-gray-500">@{user.username}</p>
                                </div>
                                {isAlreadyMember ? (
                                  <Badge variant="secondary" className="text-xs">
                                    Déjà membre
                                  </Badge>
                                ) : (
                                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handleAddParticipant(user)}
                                      disabled={isLoading}
                                      className="h-8 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                                    >
                                      <UserPlus className="h-3.5 w-3.5 mr-1" />
                                      Ajouter
                                    </Button>
                                  </motion.div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}

                  {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-3 text-center text-sm text-gray-500"
                    >
                      Aucun utilisateur trouvé
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Liste scrollable des participants */}
            <ScrollArea className="h-[calc(100vh-340px)]">
              <div className="space-y-6">
                {/* Section En ligne */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center justify-between mb-3 px-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      {t('conversationUI.online')}
                    </span>
                    <Badge variant="secondary" className="backdrop-blur-sm bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">
                      {onlineParticipants.length}
                    </Badge>
                  </div>

                  {onlineParticipants.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4 px-2 text-center">
                      {t('conversationDetails.noOneOnline')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {onlineParticipants.map((participant, index) => {
                          const user = participant.user;
                          const isCurrentUser = user.id === currentUser.id;
                          return (
                            <motion.div
                              key={`online-${participant.id || participant.userId}-${index}`}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ delay: index * 0.05 }}
                              layout
                              className={`backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-200 group ${
                                participant.role === 'CREATOR'
                                  ? 'border-2 border-yellow-400/60 dark:border-yellow-500/60 shadow-yellow-500/20 shadow-lg ring-2 ring-yellow-400/30 dark:ring-yellow-500/30'
                                  : 'border border-white/30 dark:border-gray-700/40'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  {isAnonymousUser(user) ? (
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center">
                                      <Ghost className="h-5 w-5 text-white" />
                                    </div>
                                  ) : (
                                    <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-800 shadow-sm">
                                      <AvatarImage src={user.avatar} />
                                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-medium">
                                        {getAvatarFallback(user)}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                  <OnlineIndicator
                                    isOnline={getUserStatus(user) === 'online'}
                                    status={getUserStatus(user)}
                                    size="md"
                                    className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-gray-900"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate flex items-center gap-1.5">
                                      {isAnonymousUser(user) && (
                                        <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                      )}
                                      {getDisplayName(user)}
                                      {isCurrentUser && (
                                        <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                                          {t('conversationDetails.you')}
                                        </Badge>
                                      )}
                                    </span>
                                    {(['ADMIN', 'CREATOR'].includes(participant.role)) && (
                                      <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>@{user.username}</span>
                                    <span>•</span>
                                    <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                      {t('conversationUI.online')}
                                    </span>
                                  </div>
                                </div>
                                {isAdmin && !isCurrentUser && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {participant.role !== 'CREATOR' && getUpgradeRole(participant.role) && (
                                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
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
                                          aria-label="Promouvoir"
                                        >
                                          <ChevronUp className="h-4 w-4" />
                                        </Button>
                                      </motion.div>
                                    )}
                                    {participant.role !== 'CREATOR' && getDowngradeRole(participant.role) && (
                                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
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
                                          aria-label="Rétrograder"
                                        >
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                      </motion.div>
                                    )}
                                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveParticipant(user.id)}
                                        disabled={isLoading}
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        title={t('conversationDetails.removeFromGroup')}
                                        aria-label={t('conversationDetails.removeFromGroup')}
                                      >
                                        <UserX className="h-4 w-4" />
                                      </Button>
                                    </motion.div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>

                {/* Section Hors ligne */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex items-center justify-between mb-3 px-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-400" />
                      {t('conversationDetails.offline')}
                    </span>
                    <Badge variant="outline" className="backdrop-blur-sm bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30">
                      {offlineParticipants.length}
                    </Badge>
                  </div>

                  {offlineParticipants.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4 px-2 text-center">
                      {t('conversationDetails.noOfflineParticipants')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {offlineParticipants.map((participant, index) => {
                          const user = participant.user;
                          const isCurrentUser = user.id === currentUser.id;
                          return (
                            <motion.div
                              key={`offline-${participant.id || participant.userId}-${index}`}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ delay: index * 0.05 }}
                              layout
                              className={`backdrop-blur-xl bg-white/40 dark:bg-gray-900/40 rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-200 opacity-75 hover:opacity-100 group ${
                                participant.role === 'CREATOR'
                                  ? 'border-2 border-yellow-400/60 dark:border-yellow-500/60 shadow-yellow-500/20 shadow-lg ring-2 ring-yellow-400/30 dark:ring-yellow-500/30'
                                  : 'border border-white/20 dark:border-gray-700/30'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  {isAnonymousUser(user) ? (
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-300 to-violet-400 opacity-50 flex items-center justify-center">
                                      <Ghost className="h-5 w-5 text-purple-600" />
                                    </div>
                                  ) : (
                                    <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-800 shadow-sm opacity-75">
                                      <AvatarImage src={user.avatar} />
                                      <AvatarFallback className="bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">
                                        {getAvatarFallback(user)}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                  <div className="absolute -bottom-0 -right-0 h-3 w-3 bg-gray-400 rounded-full border-2 border-white dark:border-gray-900" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                      {isAnonymousUser(user) && (
                                        <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                      )}
                                      {getDisplayName(user)}
                                      {isCurrentUser && (
                                        <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                                          {t('conversationDetails.you')}
                                        </Badge>
                                      )}
                                    </span>
                                    {(['ADMIN', 'CREATOR'].includes(participant.role)) && (
                                      <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>@{user.username}</span>
                                    <span>•</span>
                                    <span className="text-gray-400">{t('conversationDetails.offline')}</span>
                                  </div>
                                </div>
                                {isAdmin && !isCurrentUser && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {participant.role !== 'CREATOR' && getUpgradeRole(participant.role) && (
                                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
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
                                          aria-label="Promouvoir"
                                        >
                                          <ChevronUp className="h-4 w-4" />
                                        </Button>
                                      </motion.div>
                                    )}
                                    {participant.role !== 'CREATOR' && getDowngradeRole(participant.role) && (
                                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
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
                                          aria-label="Rétrograder"
                                        >
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                      </motion.div>
                                    )}
                                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveParticipant(user.id)}
                                        disabled={isLoading}
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        title={t('conversationDetails.removeFromGroup')}
                                        aria-label={t('conversationDetails.removeFromGroup')}
                                      >
                                        <UserX className="h-4 w-4" />
                                      </Button>
                                    </motion.div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
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
