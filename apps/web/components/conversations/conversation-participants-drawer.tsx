'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Settings,
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
  onOpenSettings?: () => void;
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
  onLinkCreated,
  onOpenSettings
}: ConversationParticipantsDrawerProps) {
  const { t } = useI18n('conversations');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Recherche plateforme (utilisateurs hors conversation)
  const [platformResults, setPlatformResults] = useState<SocketIOUser[]>([]);
  const [isPlatformSearching, setIsPlatformSearching] = useState(false);

  // Recherche backend des participants de la conversation
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

  // Prendre le max : memberCount peut être stale (ex: 5 alors que 200+ chargés)
  const totalMemberCount = Math.max(memberCount ?? 0, activeParticipants.length);

  // Pagination : limiter le nombre de participants affichés
  const [displayLimit, setDisplayLimit] = useState(50);

  // Reset state quand le drawer se ferme
  useEffect(() => {
    if (!isOpen) {
      setDisplayLimit(50);
      setSearchQuery('');
      setPlatformResults([]);
      setBackendSearchResults(null);
    }
  }, [isOpen]);

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

  // Recherche backend des participants quand searchQuery change
  useEffect(() => {
    const searchParticipants = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setBackendSearchResults(null);
        return;
      }

      setIsFilterSearching(true);
      try {
        const results = await participantsService.searchParticipants(conversationId, searchQuery, 50);
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
  }, [searchQuery, conversationId]);

  // Recherche plateforme (utilisateurs hors conversation) quand searchQuery change
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setPlatformResults([]);
        return;
      }

      setIsPlatformSearching(true);
      try {
        const response = await usersService.searchUsers(searchQuery);
        // response = {success, data: {data: [...], pagination}, message}
        const responseData = response?.data;
        let users = Array.isArray(responseData?.data) ? responseData.data : (Array.isArray(responseData) ? responseData : []);
        setPlatformResults(users);
      } catch (error) {
        console.error('Erreur lors de la recherche d\'utilisateurs:', error);
        setPlatformResults([]);
      } finally {
        setIsPlatformSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // Utiliser les résultats backend si disponibles, sinon filtre local
  const filteredParticipants = backendSearchResults !== null
    ? backendSearchResults
    : activeParticipants.filter(participant => {
        if (!searchQuery.trim()) return true;
        const user = participant.user;
        const searchTerm = searchQuery.toLowerCase();
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

  // Pagination : limiter le rendu
  const displayedOnline = onlineParticipants.slice(0, displayLimit);
  const remainingOnline = onlineParticipants.length - displayedOnline.length;
  const displayedOffline = offlineParticipants.slice(0, Math.max(0, displayLimit - onlineParticipants.length));
  const remainingOffline = offlineParticipants.length - displayedOffline.length;
  const totalRemaining = remainingOnline + remainingOffline;

  // Résultats plateforme filtrés (exclure ceux déjà membres)
  const filteredPlatformResults = platformResults.filter(
    user => !activeParticipants.some(p => p.userId === user.id)
  );

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

  // Rôles assignables selon le rôle de l'utilisateur courant
  const getAssignableRoles = (): Array<{ value: 'MEMBER' | 'MODERATOR' | 'ADMIN'; label: string }> => {
    const role = currentUserParticipant?.role;
    if (role === UserRoleEnum.CREATOR || role === UserRoleEnum.ADMIN) {
      return [
        { value: 'MEMBER', label: 'Membre' },
        { value: 'MODERATOR', label: 'Modérateur' },
        { value: 'ADMIN', label: 'Administrateur' },
      ];
    }
    if (role === UserRoleEnum.MODERATOR) {
      return [
        { value: 'MEMBER', label: 'Membre' },
        { value: 'MODERATOR', label: 'Modérateur' },
      ];
    }
    return [{ value: 'MEMBER', label: 'Membre' }];
  };

  const assignableRoles = getAssignableRoles();

  // Ajouter un participant depuis la recherche plateforme (avec rôle optionnel)
  const handleAddParticipant = async (user: SocketIOUser, role: 'MEMBER' | 'MODERATOR' | 'ADMIN' = 'MEMBER') => {
    try {
      setIsLoading(true);
      await conversationsService.addParticipant(conversationId, user.id);
      // Si le rôle demandé n'est pas MEMBER, mettre à jour après l'ajout
      if (role !== 'MEMBER') {
        await conversationsService.updateParticipantRole(conversationId, user.id, role);
      }
      onParticipantAdded?.(user.id);
      const roleLabels: Record<string, string> = { MEMBER: 'membre', MODERATOR: 'modérateur', ADMIN: 'administrateur' };
      toast.success(`${user.displayName || user.username} ajouté comme ${roleLabels[role]}`);
      setSearchQuery('');
      setPlatformResults([]);
    } catch (error: any) {
      console.error('Erreur lors de l\'ajout du participant:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout du participant');
    } finally {
      setIsLoading(false);
    }
  };

  // Rendu d'une carte participant (partagé online/offline)
  const renderParticipantCard = (participant: ThreadMember, index: number, isOnline: boolean) => {
    const user = participant.user;
    const isCurrentUser = user.id === currentUser.id;
    const prefix = isOnline ? 'online' : 'offline';

    return (
      <motion.div
        key={`${prefix}-${participant.id || participant.userId}-${index}`}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ delay: index * 0.03 }}
        layout
        className={`backdrop-blur-xl ${isOnline ? 'bg-white/60 dark:bg-gray-900/60' : 'bg-white/40 dark:bg-gray-900/40 opacity-75 hover:opacity-100'} rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-200 group ${
          participant.role === 'CREATOR'
            ? 'border-2 border-yellow-400/60 dark:border-yellow-500/60 shadow-yellow-500/20 shadow-lg ring-2 ring-yellow-400/30 dark:ring-yellow-500/30'
            : isOnline
              ? 'border border-white/30 dark:border-gray-700/40'
              : 'border border-white/20 dark:border-gray-700/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {isAnonymousUser(user) ? (
              <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${isOnline ? 'from-purple-400 to-violet-500' : 'from-purple-300 to-violet-400 opacity-50'} flex items-center justify-center`}>
                <Ghost className={`h-5 w-5 ${isOnline ? 'text-white' : 'text-purple-600'}`} />
              </div>
            ) : (
              <Avatar className={`h-10 w-10 border-2 border-white dark:border-gray-800 shadow-sm ${!isOnline ? 'opacity-75' : ''}`}>
                <AvatarImage src={user.avatar} />
                <AvatarFallback className={isOnline
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-medium'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium'
                }>
                  {getAvatarFallback(user)}
                </AvatarFallback>
              </Avatar>
            )}
            {isOnline ? (
              <OnlineIndicator
                isOnline={getUserStatus(user) === 'online'}
                status={getUserStatus(user)}
                size="md"
                className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-gray-900"
              />
            ) : (
              <div className="absolute -bottom-0 -right-0 h-3 w-3 bg-gray-400 rounded-full border-2 border-white dark:border-gray-900" />
            )}
          </div>

          {/* Nom + pseudo */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0">
              {isAnonymousUser(user) && (
                <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              )}
              <span className={`text-sm font-medium truncate max-w-[160px] ${!isOnline ? 'text-gray-600 dark:text-gray-400' : ''}`}>
                {getDisplayName(user)}
              </span>
              {isCurrentUser && (
                <Badge variant="outline" className="ml-0.5 text-[10px] px-1.5 py-0 flex-shrink-0">
                  {t('conversationDetails.you')}
                </Badge>
              )}
              {(['ADMIN', 'CREATOR'].includes(participant.role)) && (
                <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <Link
                href={`/u/${user.username}`}
                className="truncate max-w-[130px] text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                @{user.username}
              </Link>
              <span className="text-gray-400 flex-shrink-0">•</span>
              {isOnline ? (
                <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1 flex-shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {t('conversationUI.online')}
                </span>
              ) : (
                <span className="text-gray-400 flex-shrink-0">{t('conversationDetails.offline')}</span>
              )}
            </div>
          </div>

          {/* Actions admin */}
          {isAdmin && !isCurrentUser && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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

      {/* Drawer */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="left"
          className="w-[400px] sm:w-[500px] p-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 border-r border-white/20 dark:border-gray-700/30"
        >
          {/* Header */}
          <SheetHeader className="px-6 py-4 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-b border-white/30 dark:border-gray-700/40">
            <SheetTitle className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t('conversationUI.participants')} ({totalMemberCount})
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 py-4">
            {/* Champ de recherche unifié */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-4"
            >
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  {(isFilterSearching || isPlatformSearching) ? (
                    <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  )}
                  <Input
                    placeholder={isAdmin ? "Rechercher ou ajouter un membre..." : (t('conversationDetails.searchParticipants') || "Rechercher un membre...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 focus-visible:ring-blue-500 focus-visible:border-blue-500"
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

            {/* Résultats plateforme (pour ajouter des membres) */}
            <AnimatePresence>
              {isAdmin && searchQuery.length >= 2 && filteredPlatformResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-3 backdrop-blur-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/30 shadow-sm"
                >
                  <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <UserPlus className="h-3.5 w-3.5" />
                    Ajouter un utilisateur
                  </h3>
                  <ScrollArea className="max-h-[180px]">
                    <div className="space-y-1.5">
                      {filteredPlatformResults.slice(0, 10).map((user, index) => (
                        <motion.div
                          key={`platform-${user.id}-${index}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="flex items-center gap-2.5 p-2 rounded-lg backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                        >
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback className="text-xs">{getUserInitials(user)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-sm font-medium truncate max-w-[140px]">{user.displayName || user.username}</p>
                            <Link
                              href={`/u/${user.username}`}
                              className="text-xs text-gray-500 truncate max-w-[120px] block hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{user.username}
                            </Link>
                          </div>
                          {assignableRoles.length <= 1 ? (
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleAddParticipant(user, 'MEMBER')}
                                disabled={isLoading}
                                className="h-7 px-2.5 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex-shrink-0"
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                Ajouter
                              </Button>
                            </motion.div>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="default"
                                  size="sm"
                                  disabled={isLoading}
                                  className="h-7 px-2.5 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex-shrink-0"
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Ajouter
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[140px]">
                                {assignableRoles.map((r) => (
                                  <DropdownMenuItem
                                    key={r.value}
                                    onClick={() => handleAddParticipant(user, r.value)}
                                  >
                                    {r.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                </motion.div>
              )}

              {isAdmin && searchQuery.length >= 2 && filteredPlatformResults.length === 0 && !isPlatformSearching && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mb-4 p-3 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-900/40 rounded-xl border border-gray-200/50 dark:border-gray-700/30 text-center text-xs text-gray-500"
                >
                  Aucun utilisateur trouvé hors conversation
                </motion.div>
              )}
            </AnimatePresence>

            {/* Liste scrollable des participants */}
            <ScrollArea className="h-[calc(100vh-340px)]">
              <div className="space-y-6">
                {/* Section En ligne */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
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

                  {displayedOnline.length === 0 && onlineParticipants.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4 px-2 text-center">
                      {t('conversationDetails.noOneOnline')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {displayedOnline.map((participant, index) => renderParticipantCard(participant, index, true))}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>

                {/* Section Hors ligne */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
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

                  {displayedOffline.length === 0 && offlineParticipants.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4 px-2 text-center">
                      {t('conversationDetails.noOfflineParticipants')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {displayedOffline.map((participant, index) => renderParticipantCard(participant, index, false))}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>

                {/* Bouton Charger plus */}
                {totalRemaining > 0 && (
                  <div className="flex justify-center pt-2 pb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDisplayLimit(prev => prev + 50)}
                      className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 hover:bg-blue-500/10 text-sm"
                    >
                      Charger plus ({totalRemaining} restants)
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Bouton paramètres - toujours visible en bas */}
            {onOpenSettings && (
              <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/30">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setIsOpen(false); onOpenSettings(); }}
                  className="w-full backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 hover:bg-blue-500/10 text-sm"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t('conversationHeader.settings') || 'Paramètres de la conversation'}
                </Button>
              </div>
            )}
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
