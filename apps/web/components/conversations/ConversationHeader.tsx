'use client';

import { useCallback, useState, useEffect } from 'react';
import { ArrowLeft, UserPlus, Info, MoreVertical, Link2, Video, Ghost, Share2, Image, Pin, Bell, BellOff, Archive, ArchiveRestore, Loader2, Lock, ShieldCheck, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { OngoingCallBanner } from '@/components/video-calls/OngoingCallBanner';
import { useCallStore } from '@/stores/call-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getTagColor } from '@/utils/tag-colors';
import type {
  Conversation,
  SocketIOUser as User,
  ThreadMember
} from '@meeshy/shared/types';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';
import { ConversationParticipants } from './conversation-participants';
import { ConversationParticipantsDrawer } from './conversation-participants-drawer';
import { CreateLinkButton } from './create-link-button';
import { UserRoleEnum } from '@meeshy/shared/types';
import { toast } from 'sonner';
import { ConversationImageUploadDialog } from './conversation-image-upload-dialog';
import { AttachmentService } from '@/services/attachmentService';
import { conversationsService } from '@/services/conversations.service';
import { userPreferencesService } from '@/services/user-preferences.service';
import { getUserStatus, type UserStatus } from '@/lib/user-status';
import { useUserStore } from '@/stores/user-store';

// Helper pour détecter si un utilisateur est anonyme
function isAnonymousUser(user: any): user is AnonymousParticipant {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

interface ConversationHeaderProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: ThreadMember[];
  typingUsers: Array<{ userId: string; username: string; conversationId: string; timestamp: number }>;
  isMobile: boolean;
  onBackToList: () => void;
  onOpenDetails: () => void;
  onParticipantRemoved: (userId: string) => void;
  onParticipantAdded: (userId: string) => void;
  onLinkCreated: (link: any) => void;
  onStartCall?: () => void;
  onOpenGallery?: () => void;
  t: (key: string) => string;
  showBackButton?: boolean;
}

export function ConversationHeader({
  conversation,
  currentUser,
  conversationParticipants,
  typingUsers,
  isMobile,
  onBackToList,
  onOpenDetails,
  onParticipantRemoved,
  onParticipantAdded,
  onLinkCreated,
  onStartCall,
  onOpenGallery,
  t,
  showBackButton = false
}: ConversationHeaderProps) {
  // État pour la gestion de l'upload d'image
  const [isImageUploadDialogOpen, setIsImageUploadDialogOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // État pour les préférences utilisateur
  const [isPinned, setIsPinned] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [customName, setCustomName] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState<string | undefined>(undefined);

  // État pour gérer l'appel en cours
  const { currentCall, isInCall } = useCallStore();
  const [callDuration, setCallDuration] = useState(0);
  const [showCallBanner, setShowCallBanner] = useState(false);

  // Store global des utilisateurs (statuts en temps réel)
  const userStore = useUserStore();
  const _lastStatusUpdate = userStore._lastStatusUpdate; // Force re-render quand un statut change

  // Charger les préférences utilisateur
  useEffect(() => {
    // CORRECTION: Ne pas charger les préférences pour les utilisateurs anonymes
    // Les préférences (pin, mute, archive) sont uniquement pour les utilisateurs authentifiés
    const isUserAnonymous = isAnonymousUser(currentUser);

    if (isUserAnonymous) {
      // Utilisateur anonyme : pas de préférences
      setIsPinned(false);
      setIsMuted(false);
      setIsArchived(false);
      setIsLoadingPreferences(false);
      return;
    }

    const loadPreferences = async () => {
      try {
        setIsLoadingPreferences(true);
        const prefs = await userPreferencesService.getPreferences(conversation.id);
        if (prefs) {
          setIsPinned(prefs.isPinned);
          setIsMuted(prefs.isMuted);
          setIsArchived(prefs.isArchived);
          setCustomName(prefs.customName);
          setTags(prefs.tags || []);

          // Charger le nom de la catégorie si categoryId existe
          if (prefs.categoryId) {
            const category = await userPreferencesService.getCategory(prefs.categoryId);
            setCategoryName(category?.name);
          } else {
            setCategoryName(undefined);
          }
        } else {
          // Réinitialiser si pas de préférences
          setIsPinned(false);
          setIsMuted(false);
          setIsArchived(false);
          setCustomName(undefined);
          setTags([]);
          setCategoryName(undefined);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
        // En cas d'erreur, réinitialiser
        setIsPinned(false);
        setIsMuted(false);
        setIsArchived(false);
        setCustomName(undefined);
        setTags([]);
        setCategoryName(undefined);
      } finally {
        setIsLoadingPreferences(false);
      }
    };
    loadPreferences();

    // CORRECTION: Supprimer le polling agressif de 2 secondes
    // Les préférences changent rarement et seront mises à jour lors des actions utilisateur
    // Si nécessaire, utiliser WebSocket pour les mises à jour en temps réel
  }, [conversation.id, currentUser]);

  // Gérer l'affichage du banner d'appel en cours
  useEffect(() => {
    // Vérifier si un appel est en cours pour cette conversation
    const hasActiveCall =
      currentCall &&
      isInCall &&
      currentCall.conversationId === conversation.id &&
      currentCall.status !== 'ended';

    if (hasActiveCall) {
      setShowCallBanner(true);

      // Calculer et mettre à jour la durée de l'appel
      const updateDuration = () => {
        if (currentCall.startedAt) {
          const now = new Date();
          const start = new Date(currentCall.startedAt);
          const durationInSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
          setCallDuration(durationInSeconds);
        }
      };

      // Mise à jour initiale
      updateDuration();

      // Mise à jour toutes les secondes
      const interval = setInterval(updateDuration, 1000);

      return () => clearInterval(interval);
    } else {
      setShowCallBanner(false);
      setCallDuration(0);
    }
  }, [currentCall, isInCall, conversation.id]);

  // Gérer le join à un appel en cours
  const handleJoinCall = useCallback(() => {
    if (currentCall && onStartCall) {
      onStartCall();
    }
  }, [currentCall, onStartCall]);

  // Gérer le dismiss du banner d'appel
  const handleDismissCallBanner = useCallback(() => {
    setShowCallBanner(false);
  }, []);

  // Helper pour obtenir le rôle de l'utilisateur
  const getCurrentUserRole = useCallback((): UserRoleEnum => {
    if (!conversation || !currentUser?.id || !conversationParticipants.length) {
      return currentUser?.role as UserRoleEnum || UserRoleEnum.USER;
    }

    const currentUserParticipant = conversationParticipants.find(p => p.userId === currentUser.id);
    return currentUserParticipant?.role as UserRoleEnum || currentUser?.role as UserRoleEnum || UserRoleEnum.USER;
  }, [conversation, currentUser?.id, currentUser?.role, conversationParticipants]);

  // Obtenir le nom de la conversation
  const getConversationName = useCallback(() => {
    if (conversation.type !== 'direct') {
      return conversation.title || 'Groupe sans nom';
    }

    // Pour les conversations directes, essayer plusieurs sources de données

    // 1. Utiliser les participants chargés (conversationParticipants prop)
    const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
    if (otherParticipant?.user) {
      const user = otherParticipant.user;
      const name = user.displayName || user.username ||
             (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
      if (name) return name;
    }

    // 2. Fallback: utiliser conversation.participants (données transformées)
    const convParticipants = (conversation as any).participants;
    if (Array.isArray(convParticipants) && convParticipants.length > 0) {
      const otherConvParticipant = convParticipants.find((p: any) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user) {
        const user = otherConvParticipant.user;
        const name = user.displayName || user.username ||
               (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
        if (name) return name;
      }
    }

    // 3. Fallback: utiliser conversation.members si disponible (données brutes API)
    const members = (conversation as any).members;
    if (Array.isArray(members) && members.length > 0) {
      const otherMember = members.find((m: any) => m.userId !== currentUser?.id);
      if (otherMember?.user) {
        const user = otherMember.user;
        const name = user.displayName || user.username ||
               (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
        if (name) return name;
      }
    }

    // 4. Fallback: extraire le nom du titre "Conversation avec X"
    if (conversation.title) {
      const match = conversation.title.match(/^Conversation avec (.+)$/i);
      if (match && match[1]) {
        return match[1];
      }
      // Utiliser le titre tel quel s'il n'est pas le titre par défaut
      if (conversation.title !== 'Conversation privée') {
        return conversation.title;
      }
    }

    // 5. Fallback ultime
    return 'Utilisateur';
  }, [conversation, currentUser, conversationParticipants]);

  // Obtenir l'avatar
  const getConversationAvatar = useCallback(() => {
    const name = getConversationName();
    return name.slice(0, 2).toUpperCase();
  }, [getConversationName]);

  const getConversationAvatarUrl = useCallback(() => {
    if (conversation.type === 'direct') {
      // 1. Essayer avec conversationParticipants
      const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant?.user?.avatar) {
        return otherParticipant.user.avatar;
      }

      // 2. Fallback: utiliser conversation.participants
      const otherConvParticipant = (conversation as any).participants?.find((p: any) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user?.avatar) {
        return otherConvParticipant.user.avatar;
      }

      // 3. Fallback: utiliser conversation.members si disponible
      if ((conversation as any).members) {
        const otherMember = (conversation as any).members.find((m: any) => m.userId !== currentUser?.id);
        return otherMember?.user?.avatar;
      }
    }
    // Pour les conversations de groupe/public/global, retourner l'image de la conversation
    return conversation.image || conversation.avatar;
  }, [conversation, currentUser, conversationParticipants]);

  // Helper pour vérifier si l'utilisateur peut utiliser les appels vidéo
  const canUseVideoCalls = useCallback((): boolean => {
    const role = currentUser?.role as UserRoleEnum;
    // Seuls les utilisateurs de niveau modérateur et plus peuvent utiliser les appels vidéo
    return [
      UserRoleEnum.BIGBOSS,
      UserRoleEnum.ADMIN,
      UserRoleEnum.MODO,
      UserRoleEnum.MODERATOR, // Alias
      UserRoleEnum.AUDIT,
      UserRoleEnum.ANALYST
    ].includes(role);
  }, [currentUser?.role]);

  // Helper pour vérifier si l'utilisateur peut modifier l'image de la conversation
  const canModifyConversationImage = useCallback((): boolean => {
    // Seulement pour les conversations group, public et global (pas direct)
    if (conversation.type === 'direct') return false;

    const role = getCurrentUserRole();
    // Modérateurs et au-dessus peuvent modifier l'image
    return [
      UserRoleEnum.BIGBOSS,
      UserRoleEnum.ADMIN,
      UserRoleEnum.MODO,
      UserRoleEnum.MODERATOR,
      UserRoleEnum.AUDIT,
      UserRoleEnum.ANALYST,
      UserRoleEnum.CREATOR
    ].includes(role);
  }, [conversation.type, getCurrentUserRole]);

  // Fonction pour gérer l'upload de l'image de conversation
  const handleImageUpload = useCallback(async (file: File) => {
    setIsUploadingImage(true);
    try {
      // Upload du fichier via le service d'attachments
      const uploadResult = await AttachmentService.uploadFiles([file]);

      if (uploadResult.success && uploadResult.attachments.length > 0) {
        const imageUrl = uploadResult.attachments[0].url;

        // Mettre à jour la conversation avec la nouvelle image
        await conversationsService.updateConversation(conversation.id, {
          image: imageUrl,
          avatar: imageUrl
        });

        toast.success(t('conversationHeader.imageUpdated') || 'Image de la conversation mise à jour');
        setIsImageUploadDialogOpen(false);

        // Recharger la page pour afficher la nouvelle image
        window.location.reload();
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload de l\'image:', error);
      toast.error(t('conversationHeader.imageUploadError') || 'Erreur lors de l\'upload de l\'image');
    } finally {
      setIsUploadingImage(false);
    }
  }, [conversation.id, t]);

  // Vérifier si l'autre participant est anonyme
  const isOtherParticipantAnonymous = useCallback(() => {
    if (conversation.type === 'direct') {
      // 1. Essayer avec conversationParticipants
      const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant?.user) {
        return isAnonymousUser(otherParticipant.user);
      }

      // 2. Fallback: utiliser conversation.participants
      const otherConvParticipant = (conversation as any).participants?.find((p: any) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user) {
        return isAnonymousUser(otherConvParticipant.user);
      }

      // 3. Fallback: utiliser conversation.members si disponible
      if ((conversation as any).members) {
        const otherMember = (conversation as any).members.find((m: any) => m.userId !== currentUser?.id);
        return otherMember?.user ? isAnonymousUser(otherMember.user) : false;
      }
    }
    return false;
  }, [conversation, currentUser, conversationParticipants]);

  // Obtenir le statut de l'autre participant pour les conversations directes
  const getOtherParticipantStatus = useCallback((): UserStatus => {
    if (conversation.type === 'direct') {
      // 1. Trouver l'ID de l'autre participant
      let otherUserId: string | undefined;
      const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant) {
        otherUserId = otherParticipant.userId;
      } else {
        // Fallback: chercher dans conversation.participants
        const otherConvParticipant = (conversation as any).participants?.find((p: any) => p.userId !== currentUser?.id);
        otherUserId = otherConvParticipant?.userId;
      }

      if (otherUserId) {
        // 2. PRIORITÉ: Utiliser le store global pour les données en temps réel
        const userFromStore = userStore.getUserById(otherUserId);
        if (userFromStore) {
          return getUserStatus(userFromStore);
        }

        // 3. Fallback: utiliser les données des props (peuvent être obsolètes)
        if (otherParticipant?.user) {
          return getUserStatus(otherParticipant.user);
        }
      }

      // Si aucune donnée n'est disponible, retourner offline par défaut
      return 'offline';
    }
    return 'online'; // Pour les conversations de groupe, toujours afficher comme online
  }, [conversation, conversationParticipants, currentUser?.id, userStore, _lastStatusUpdate]);

  // Handlers pour les préférences utilisateur
  const handleTogglePin = useCallback(async () => {
    try {
      const newPinnedState = !isPinned;
      setIsPinned(newPinnedState);
      await userPreferencesService.togglePin(conversation.id, newPinnedState);
      toast.success(t(newPinnedState ? 'conversationHeader.pinned' : 'conversationHeader.unpinned'));
    } catch (error) {
      console.error('Error toggling pin:', error);
      setIsPinned(!isPinned); // Revert on error
      toast.error(t('conversationHeader.pinError'));
    }
  }, [conversation.id, isPinned, t]);

  const handleToggleMute = useCallback(async () => {
    try {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      await userPreferencesService.toggleMute(conversation.id, newMutedState);
      toast.success(t(newMutedState ? 'conversationHeader.muted' : 'conversationHeader.unmuted'));
    } catch (error) {
      console.error('Error toggling mute:', error);
      setIsMuted(!isMuted); // Revert on error
      toast.error(t('conversationHeader.muteError'));
    }
  }, [conversation.id, isMuted, t]);

  const handleToggleArchive = useCallback(async () => {
    try {
      const newArchivedState = !isArchived;
      setIsArchived(newArchivedState);
      await userPreferencesService.toggleArchive(conversation.id, newArchivedState);
      toast.success(t(newArchivedState ? 'conversationHeader.archived' : 'conversationHeader.unarchived'));
    } catch (error) {
      console.error('Error toggling archive:', error);
      setIsArchived(!isArchived); // Revert on error
      toast.error(t('conversationHeader.archiveError'));
    }
  }, [conversation.id, isArchived, t]);

  // Fonction pour partager le lien de la conversation
  const handleShareConversation = useCallback(async () => {
    const url = `${window.location.origin}/conversations/${conversation.id}`;
    const shareText = t('conversationHeader.shareMessage');
    const fullMessage = `${shareText}\n\n${url}`;

    try {
      // Vérifier si l'API Web Share est disponible
      if (navigator.share) {
        await navigator.share({
          text: fullMessage,
        });
      } else {
        // Fallback: copier dans le presse-papiers si Web Share n'est pas disponible
        await navigator.clipboard.writeText(fullMessage);
        toast.success(t('conversationHeader.linkCopied') || 'Lien copié !');
      }
    } catch (error: any) {
      // L'utilisateur a annulé le partage (pas une vraie erreur)
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Erreur lors du partage:', error);
      toast.error(t('conversationHeader.linkCopyError') || 'Erreur lors de la copie du lien');
    }
  }, [conversation.id, conversation.title, t]);

  return (
    <>
      {/* Banner d'appel en cours */}
      {showCallBanner && currentCall && (
        <OngoingCallBanner
          callId={currentCall.id}
          participantCount={currentCall.participants?.length || 0}
          duration={callDuration}
          onJoin={handleJoinCall}
          onDismiss={handleDismissCallBanner}
        />
      )}

      <div className="border-b border-border bg-card">
        {/* Bande horizontale défilable des tags et catégories */}
        {!isLoadingPreferences && (categoryName || tags.length > 0) && (
          <div className="px-4 pt-3 pb-2 border-b border-border/50">
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* Catégorie */}
              {categoryName && (
                <Badge
                  variant="secondary"
                  className="h-6 px-3 text-xs font-medium flex-shrink-0 shadow-sm"
                >
                  {categoryName}
                </Badge>
              )}
              {/* Tags */}
              {tags.map((tag, index) => {
                const colors = getTagColor(tag);
                return (
                  <Badge
                    key={index}
                    variant="outline"
                    className={cn(
                      "h-6 px-3 text-xs font-medium border flex-shrink-0 shadow-sm",
                      colors.bg,
                      colors.text,
                      colors.border
                    )}
                  >
                    {tag}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Section principale du header */}
        <div className="flex items-center justify-between px-4 py-3 min-h-[80px]">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Bouton retour (mobile ou desktop avec showBackButton) */}
        {(isMobile || showBackButton) && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onBackToList}
            className="flex-shrink-0 h-9 w-9 mt-0.5"
            aria-label={t('conversationHeader.backToList') || 'Retour à la liste'}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Avatar - Pour toutes les conversations */}
        <div className="relative flex-shrink-0">
          {conversation.type !== 'direct' ? (
            /* Avatar pour conversations de groupe/public/global */
            canModifyConversationImage() ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="cursor-pointer group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      onClick={() => setIsImageUploadDialogOpen(true)}
                      aria-label={t('conversationHeader.changeImage') || 'Changer l\'image de la conversation'}
                    >
                      <Avatar className="h-9 w-9 sm:h-10 sm:w-10 ring-2 ring-transparent group-hover:ring-primary/50 transition-all">
                        <AvatarImage src={getConversationAvatarUrl()} alt={getConversationName()} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs sm:text-sm">
                          {getConversationAvatar()}
                        </AvatarFallback>
                      </Avatar>
                      {/* Overlay avec icône camera au survol */}
                      <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Image className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" aria-hidden="true" />
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('conversationHeader.changeImage') || 'Changer l\'image'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
                <AvatarImage src={getConversationAvatarUrl()} alt={getConversationName()} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs sm:text-sm">
                  {getConversationAvatar()}
                </AvatarFallback>
              </Avatar>
            )
          ) : (
            /* Avatar pour conversations directes avec indicateur de statut */
            isOtherParticipantAnonymous() ? (
              <div
                className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"
                role="img"
                aria-label={t('conversationHeader.anonymousUser') || 'Utilisateur anonyme'}
              >
                <Ghost className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            ) : (
              <>
                <Avatar className="h-10 w-10" aria-label={`${getConversationName()} avatar`}>
                  <AvatarImage src={getConversationAvatarUrl()} alt={`${getConversationName()} avatar`} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getConversationAvatar()}
                  </AvatarFallback>
                </Avatar>
                {/* Indicateur de statut pour conversations directes */}
                <OnlineIndicator
                  isOnline={getOtherParticipantStatus() === 'online'}
                  status={getOtherParticipantStatus()}
                  size="md"
                  className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card"
                />
              </>
            )
          )}
        </div>

        {/* Infos de la conversation */}
        <div className="flex-1 min-w-0">
          {/* Titre principal avec titre original entre parenthèses si customName existe */}
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="font-semibold text-base truncate" id="conversation-title" aria-label={`Conversation: ${getConversationName()}`}>
              {customName ? (
                <>
                  {customName} <span className="text-muted-foreground font-normal">({getConversationName()})</span>
                </>
              ) : (
                getConversationName()
              )}
            </h2>
            {/* Encryption indicator */}
            {(conversation as any).encryptionMode && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex-shrink-0 p-1 rounded-full",
                        (conversation as any).encryptionMode === 'e2ee'
                          ? "text-green-600 dark:text-green-400"
                          : (conversation as any).encryptionMode === 'hybrid'
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-amber-600 dark:text-amber-400"
                      )}
                      aria-label={`${t('conversationHeader.encrypted') || 'Encrypted'}: ${(conversation as any).encryptionMode?.toUpperCase()}`}
                    >
                      {(conversation as any).encryptionMode === 'e2ee' ? (
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      ) : (conversation as any).encryptionMode === 'hybrid' ? (
                        <Shield className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Lock className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="text-xs">
                      <p className="font-medium">
                        {(conversation as any).encryptionMode === 'e2ee'
                          ? (t('conversationHeader.e2eeEncryption') || 'End-to-End Encrypted')
                          : (conversation as any).encryptionMode === 'hybrid'
                            ? (t('conversationHeader.hybridEncryption') || 'Hybrid Encryption')
                            : (t('conversationHeader.serverEncryption') || 'Server Encrypted')
                        }
                      </p>
                      <p className="text-muted-foreground">
                        {(conversation as any).encryptionMode === 'e2ee'
                          ? (t('conversationHeader.e2eeDescription') || 'Only you and participants can read messages')
                          : (conversation as any).encryptionMode === 'hybrid'
                            ? (t('conversationHeader.hybridDescription') || 'E2EE with server-side translation support')
                            : (t('conversationHeader.serverDescription') || 'Messages encrypted on server')
                        }
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Deuxième ligne : indicateur de frappe ou participants */}
          {conversation.type !== 'direct' ? (
            <div className="text-sm text-muted-foreground">
              <ConversationParticipants
                conversationId={conversation.id}
                participants={conversationParticipants}
                currentUser={currentUser}
                isGroup={conversation.type !== 'direct'}
                conversationType={conversation.type}
                typingUsers={typingUsers.map(u => ({ userId: u.userId, conversationId: u.conversationId }))}
                conversationTitle={customName}
                conversationTags={tags}
                conversationCategory={categoryName}
                className="truncate"
              />
            </div>
          ) : (
            /* For direct conversations, show only typing indicator */
            <div className="text-sm text-muted-foreground">
              {(() => {
                const otherTypingUsers = typingUsers.filter(u => u.userId !== currentUser.id);
                if (otherTypingUsers.length > 0) {
                  const typingUser = otherTypingUsers[0];
                  const typingUserName = typingUser.username || getConversationName();
                  return (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm font-medium">
                        {typingUserName} {t('conversationParticipants.typing') || 'est en train d\'écrire...'}
                      </span>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 self-center">
        {/* Video Call Button - Only for direct conversations and moderator+ users */}
        {conversation.type === 'direct' && onStartCall && canUseVideoCalls() && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onStartCall}
                  className="h-8 w-8 sm:h-9 sm:w-9 hover:bg-blue-500 hover:text-white transition-colors"
                  aria-label={t('conversationHeader.startVideoCall') || 'Démarrer un appel vidéo'}
                >
                  <Video className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('conversationHeader.startVideoCall') || 'Démarrer un appel vidéo'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Participants drawer - Only for group conversations */}
        {conversation.type !== 'direct' && (
          <ConversationParticipantsDrawer
            conversationId={conversation.id}
            participants={conversationParticipants}
            currentUser={currentUser}
            isGroup={conversation.type !== 'direct'}
            conversationType={conversation.type}
            userConversationRole={getCurrentUserRole()}
            onParticipantRemoved={onParticipantRemoved}
            onParticipantAdded={onParticipantAdded}
            onLinkCreated={onLinkCreated}
          />
        )}

        {/* Bouton de création de lien rapide - seulement pour les conversations de groupe et avec les bons rôles */}
        {conversation.type !== 'direct' && 
         !(conversation.type === 'global' && currentUser.role !== 'BIGBOSS' && currentUser.role !== 'ADMIN') && (
          <CreateLinkButton
            conversationId={conversation.id}
            currentUser={currentUser}
            disableSummaryModal={false}
            onLinkCreated={() => {
              onLinkCreated?.('');
            }}
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 rounded-full hover:bg-accent/50"
          >
            <Link2 className="h-5 w-5" />
          </CreateLinkButton>
        )}

        {/* Menu dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 sm:h-9 sm:w-9"
              aria-label={t('conversationHeader.menuActions') || 'Menu des actions'}
            >
              <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              <span className="sr-only">{t('conversationHeader.menuActions') || 'Menu des actions'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onOpenDetails}>
              <Info className="h-4 w-4 mr-2" />
              {t('conversationDetails.title')}
            </DropdownMenuItem>

            {onOpenGallery && (
              <DropdownMenuItem onClick={onOpenGallery}>
                <Image className="h-4 w-4 mr-2" />
                {t('conversationHeader.viewImages') || 'Voir les images'}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* User Preferences */}
            <DropdownMenuItem onClick={handleTogglePin} disabled={isLoadingPreferences}>
              <Pin className={cn("h-4 w-4 mr-2", isPinned && "fill-current")} />
              {t(isPinned ? 'conversationHeader.unpin' : 'conversationHeader.pin')}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleToggleMute} disabled={isLoadingPreferences}>
              {isMuted ? (
                <Bell className="h-4 w-4 mr-2" />
              ) : (
                <BellOff className="h-4 w-4 mr-2" />
              )}
              {t(isMuted ? 'conversationHeader.unmute' : 'conversationHeader.mute')}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleToggleArchive} disabled={isLoadingPreferences}>
              {isArchived ? (
                <ArchiveRestore className="h-4 w-4 mr-2" />
              ) : (
                <Archive className="h-4 w-4 mr-2" />
              )}
              {t(isArchived ? 'conversationHeader.unarchive' : 'conversationHeader.archive')}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleShareConversation}>
              <Share2 className="h-4 w-4 mr-2" />
              {t('conversationHeader.share') || 'Partager'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialog pour l'upload d'image de conversation */}
      <ConversationImageUploadDialog
        open={isImageUploadDialogOpen}
        onClose={() => setIsImageUploadDialogOpen(false)}
        onImageUploaded={handleImageUpload}
        isUploading={isUploadingImage}
        conversationTitle={conversation.title || conversation.id}
      />
        </div>
      </div>
    </>
  );
}
