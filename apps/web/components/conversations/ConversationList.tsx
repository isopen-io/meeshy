'use client';

import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import { MessageSquare, Link2, Users, Globe, Search, Loader2, Pin, ChevronDown, ChevronRight, MoreVertical, Info, Archive, Bell, BellOff, Heart, Smile, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { UserConversationPreferences, UserConversationCategory } from '@/types/user-preferences';
import { CreateLinkButton } from './create-link-button';
import { userPreferencesService } from '@/services/user-preferences.service';
import { CommunityCarousel, type CommunityFilter } from './CommunityCarousel';
import { getTagColor } from '@/utils/tag-colors';
import { Folder } from 'lucide-react';
import { toast } from 'sonner';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { formatConversationDate, formatRelativeDate } from '@/utils/date-format';
import { useUserStore } from '@/stores/user-store';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  currentUser: User;
  isLoading: boolean;
  isMobile: boolean;
  showConversationList: boolean;
  onSelectConversation: (conversation: Conversation) => void;
  onShowDetails?: (conversation: Conversation) => void;
  onCreateConversation: () => void;
  onLinkCreated: () => void;
  t: (key: string) => string;
  tSearch: (key: string) => string;
  // Props pour la pagination
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  currentUser: User;
  onClick: () => void;
  onShowDetails?: (conversation: Conversation) => void;
  t: (key: string) => string;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  reaction?: string;
  tags?: string[];
  isMobile?: boolean;
}

// Composant pour un élément de conversation
const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  currentUser,
  onClick,
  onShowDetails,
  t,
  isPinned = false,
  isMuted = false,
  isArchived = false,
  reaction,
  tags = [],
  isMobile = false
}: ConversationItemProps) {
  // State local pour les préférences (sera mis à jour après les actions)
  const [localIsPinned, setLocalIsPinned] = useState(isPinned);
  const [localIsMuted, setLocalIsMuted] = useState(isMuted);
  const [localIsArchived, setLocalIsArchived] = useState(isArchived);
  const [localReaction, setLocalReaction] = useState(reaction);

  // Store global des utilisateurs (statuts en temps réel)
  const userStore = useUserStore();
  const _lastStatusUpdate = userStore._lastStatusUpdate; // Force re-render quand un statut change

  // Sync with props
  useEffect(() => {
    setLocalIsPinned(isPinned);
  }, [isPinned]);

  useEffect(() => {
    setLocalIsMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    setLocalIsArchived(isArchived);
  }, [isArchived]);

  useEffect(() => {
    setLocalReaction(reaction);
  }, [reaction]);

  // Actions du menu
  const handleTogglePin = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await userPreferencesService.togglePin(conversation.id, !localIsPinned);
      setLocalIsPinned(!localIsPinned);
      toast.success(localIsPinned ? 'Conversation désépinglée' : 'Conversation épinglée');
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error('Erreur lors de l\'épinglage');
    }
  }, [conversation.id, localIsPinned]);

  const handleToggleMute = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await userPreferencesService.toggleMute(conversation.id, !localIsMuted);
      setLocalIsMuted(!localIsMuted);
      toast.success(localIsMuted ? 'Notifications activées' : 'Notifications désactivées');
    } catch (error) {
      console.error('Error toggling mute:', error);
      toast.error('Erreur lors de la modification');
    }
  }, [conversation.id, localIsMuted]);

  const handleToggleArchive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await userPreferencesService.toggleArchive(conversation.id, !localIsArchived);
      setLocalIsArchived(!localIsArchived);
      toast.success(localIsArchived ? 'Conversation désarchivée' : 'Conversation archivée');
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error('Erreur lors de l\'archivage');
    }
  }, [conversation.id, localIsArchived]);

  const handleSetReaction = useCallback(async (e: React.MouseEvent, emoji: string) => {
    e.stopPropagation();
    try {
      const newReaction = localReaction === emoji ? null : emoji;
      await userPreferencesService.updateReaction(conversation.id, newReaction);
      setLocalReaction(newReaction || undefined);
      toast.success(newReaction ? `Réaction ${emoji} ajoutée` : 'Réaction supprimée');
    } catch (error) {
      console.error('Error setting reaction:', error);
      toast.error('Erreur lors de la modification');
    }
  }, [conversation.id, localReaction]);

  const handleShowDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onShowDetails?.(conversation);
  }, [conversation, onShowDetails]);

  const handleShareConversation = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
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
        toast.success(t('conversationHeader.linkCopied'));
      }
    } catch (error: any) {
      // L'utilisateur a annulé le partage (pas une vraie erreur)
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error sharing:', error);
      toast.error(t('conversationHeader.linkCopyError'));
    }
  }, [conversation.id, conversation.title, t]);

  // Helper pour obtenir l'autre participant dans une conversation directe
  const getOtherParticipantUser = useCallback(() => {
    if (conversation.type !== 'direct') return null;
    const otherParticipant = conversation.participants?.find(p => p.userId !== currentUser?.id);
    return otherParticipant ? (otherParticipant as any).user : null;
  }, [conversation, currentUser]);

  // Obtenir seulement le nom de la conversation (sans date)
  const getConversationNameOnly = useCallback(() => {
    if (conversation.type !== 'direct') {
      return conversation.title || 'Groupe sans nom';
    }

    const participantUser = getOtherParticipantUser();
    if (participantUser) {
      // Utiliser displayName, puis username, puis firstName/lastName
      const userName = participantUser.displayName ||
                      participantUser.username ||
                      (participantUser.firstName && participantUser.lastName
                        ? `${participantUser.firstName} ${participantUser.lastName}`.trim()
                        : participantUser.firstName || participantUser.lastName) ||
                      'Utilisateur';
      return userName;
    }

    // Fallback sur le titre de la conversation
    return conversation.title || 'Conversation privée';
  }, [conversation, getOtherParticipantUser]);

  // Obtenir la date de création formatée pour les conversations directes
  const getConversationCreatedDate = useCallback(() => {
    if (conversation.type === 'direct' && conversation.createdAt) {
      return formatRelativeDate(conversation.createdAt, { t });
    }
    return null;
  }, [conversation, t]);

  // Fonction legacy pour compatibilité avec getConversationAvatar
  const getConversationName = useCallback(() => {
    const name = getConversationNameOnly();
    const date = getConversationCreatedDate();
    return date ? `${name} (${date})` : name;
  }, [getConversationNameOnly, getConversationCreatedDate]);

  const getConversationAvatar = useCallback(() => {
    const name = getConversationName();
    return name.slice(0, 2).toUpperCase();
  }, [getConversationName]);

  const getConversationAvatarUrl = useCallback(() => {
    if (conversation.type === 'direct') {
      const participantUser = getOtherParticipantUser();
      return participantUser?.avatar;
    }
    // Pour les conversations de groupe/public/global, retourner l'image de la conversation
    return conversation.image || conversation.avatar;
  }, [conversation, getOtherParticipantUser]);

  const getConversationIcon = useCallback(() => {
    if (conversation.visibility === 'public') return <Globe className="h-4 w-4" />;
    if (conversation.type === 'broadcast') return <Users className="h-4 w-4" />;
    if (conversation.type === 'group') return <Users className="h-4 w-4" />;
    if (conversation.type !== 'direct') return <Users className="h-4 w-4" />;
    return null;
  }, [conversation.type, conversation.visibility]);

  const formatTime = useCallback((date: Date | string) => {
    return formatConversationDate(date, { t });
  }, [t]);

  const getSenderName = useCallback((message: any) => {
    // Gérer les utilisateurs anonymes ET membres
    const sender = message?.anonymousSender || message?.sender;
    const isAnonymous = !!message?.anonymousSender;

    if (!sender) return null;

    // Construire le nom
    let senderName = sender.displayName ||
                     sender.username ||
                     (sender.firstName || sender.lastName
                       ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim()
                       : null);

    if (!senderName) {
      senderName = isAnonymous ? 'Anonyme' : 'Utilisateur';
    }

    // Ajouter le suffixe (anonyme) si c'est un utilisateur anonyme
    return isAnonymous ? `${senderName} (anonyme)` : senderName;
  }, []);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
        "hover:bg-accent/50",
        isSelected && "bg-primary/10 hover:bg-primary/20"
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarImage src={getConversationAvatarUrl()} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {getConversationIcon() || getConversationAvatar()}
          </AvatarFallback>
        </Avatar>
        {/* Indicateur de présence - pour les conversations directes (vert, orange, gris) */}
        {conversation.type === 'direct' && (() => {
          const participantUser = getOtherParticipantUser();
          if (participantUser) {
            // PRIORITÉ: Utiliser le store global pour les données en temps réel
            const userFromStore = userStore.getUserById(participantUser.id);
            const effectiveUser = userFromStore || participantUser;
            const status = getUserStatus(effectiveUser);
            return (
              <OnlineIndicator
                isOnline={status === 'online'}
                status={status}
                size="md"
                className="absolute -bottom-0.5 -right-0.5"
              />
            );
          }
          return null;
        })()}
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        {/* Tags colorés au-dessus du titre */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.slice(0, 3).map((tag) => {
              const colors = getTagColor(tag);
              return (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn(
                    "px-1.5 py-0 h-4 text-[10px] font-medium border",
                    colors.bg,
                    colors.text,
                    colors.border
                  )}
                >
                  {tag}
                </Badge>
              );
            })}
            {tags.length > 3 && (
              <Badge
                variant="outline"
                className="px-1.5 py-0 h-4 text-[10px] font-medium border border-muted-foreground/20 bg-muted/50 text-muted-foreground"
              >
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isPinned && (
              <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0 fill-current" />
            )}
            <h3 className="font-semibold text-sm truncate">
              {getConversationNameOnly()}
            </h3>
          </div>
          {conversation.lastMessage && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTime(conversation.lastMessage.createdAt)}
            </span>
          )}
        </div>
        
        {conversation.lastMessage && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {getSenderName(conversation.lastMessage) && (
              <span className="font-medium">{getSenderName(conversation.lastMessage)}: </span>
            )}
            {/* Si le message a un attachement et pas de contenu texte, afficher les détails de l'attachement */}
            {conversation.lastMessage.attachments && conversation.lastMessage.attachments.length > 0 && !conversation.lastMessage.content ? (
              <span className="flex items-center gap-1.5">
                {(() => {
                  const attachment = conversation.lastMessage.attachments[0];
                  const mimeType = attachment.mimeType || '';

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
                    // Formater durée avec millisecondes
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
                        {attachment.fps && (
                          <span className="text-xs">• {attachment.fps}fps</span>
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

                    // Formater la durée avec millisecondes: MM:SS.ms si < 1h, sinon HH:MM:SS.ms
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
                        {attachment.bitrate && (
                          <span className="text-xs">• {Math.round(attachment.bitrate / 1000)}kbps</span>
                        )}
                        {attachment.sampleRate && (
                          <span className="text-xs">• {(attachment.sampleRate / 1000).toFixed(1)}kHz</span>
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
                    return (
                      <>
                        <span className="inline-flex text-gray-500">📎</span>
                      </>
                    );
                  }
                })()}
                {conversation.lastMessage.attachments.length > 1 && (
                  <span className="text-xs font-medium">+{conversation.lastMessage.attachments.length - 1}</span>
                )}
              </span>
            ) : (
              conversation.lastMessage.content
            )}
          </p>
        )}
      </div>

      {/* Badge de messages non lus */}
      {conversation.unreadCount !== undefined && conversation.unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="ml-2 flex-shrink-0 h-5 min-w-[20px] px-1.5"
        >
          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
        </Badge>
      )}

      {/* Menu Show More */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 flex-shrink-0 transition-opacity",
              // Sur mobile: toujours visible
              // Sur desktop: visible au hover
              isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleShowDetails}>
            <Info className="mr-2 h-4 w-4" />
            <span>Détails</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleTogglePin}>
            <Pin className="mr-2 h-4 w-4" />
            <span>{localIsPinned ? 'Désépingler' : 'Épingler'}</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleToggleMute}>
            {localIsMuted ? (
              <Bell className="mr-2 h-4 w-4" />
            ) : (
              <BellOff className="mr-2 h-4 w-4" />
            )}
            <span>{localIsMuted ? 'Activer notifications' : 'Désactiver notifications'}</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleToggleArchive}>
            <Archive className="mr-2 h-4 w-4" />
            <span>{localIsArchived ? 'Désarchiver' : 'Archiver'}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleShareConversation}>
            <Share2 className="mr-2 h-4 w-4" />
            <span>{t('conversationHeader.share')}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Smile className="mr-2 h-4 w-4" />
              <span>Réactions</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto p-2">
              {/* Grid 3 colonnes x 2 rangées pour les 6 emojis */}
              <div className="grid grid-cols-3 gap-1">
                {['❤️', '👍', '😊', '🎉', '🔥', '⭐'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => handleSetReaction(e, emoji)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-md hover:bg-accent transition-colors relative",
                      localReaction === emoji && "bg-accent ring-2 ring-primary"
                    )}
                  >
                    <span className="text-xl">{emoji}</span>
                    {localReaction === emoji && (
                      <span className="absolute top-0.5 right-0.5 text-[10px] text-primary font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

export function ConversationList({
  conversations,
  selectedConversation,
  currentUser,
  isLoading,
  isMobile,
  showConversationList,
  onSelectConversation,
  onShowDetails,
  onCreateConversation,
  onLinkCreated,
  t,
  tSearch,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [preferencesMap, setPreferencesMap] = useState<Map<string, UserConversationPreferences>>(new Map());
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<CommunityFilter>({ type: 'all' });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [categories, setCategories] = useState<UserConversationCategory[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    // Charger l'état collapsed depuis localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('collapsedConversationSections');
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch (e) {
          return new Set();
        }
      }
    }
    return new Set();
  });

  // Référence pour le scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Charger les préférences utilisateur pour toutes les conversations
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setIsLoadingPreferences(true);
        const allPrefs = await userPreferencesService.getAllPreferences();
        const map = new Map<string, UserConversationPreferences>();
        allPrefs.forEach(pref => {
          map.set(pref.conversationId, pref);
        });
        setPreferencesMap(map);
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsLoadingPreferences(false);
      }
    };
    loadPreferences();

    // Recharger les préférences toutes les 2 secondes pour détecter les changements
    const intervalId = setInterval(loadPreferences, 2000);

    return () => clearInterval(intervalId);
  }, [conversations.length]); // Recharger quand la liste change

  // Charger les catégories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await userPreferencesService.getCategories();
        // Trier par order, puis alphabétiquement
        const sorted = cats.sort((a, b) => {
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          return a.name.localeCompare(b.name);
        });
        setCategories(sorted);
      } catch (error) {
        console.error('[ConversationList] Error loading categories:', error);
      }
    };
    loadCategories();
  }, []);

  // Sauvegarder l'état collapsed dans localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('collapsedConversationSections', JSON.stringify([...collapsedSections]));
    }
  }, [collapsedSections]);

  // Fonction pour toggle une section
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // Filtrage et tri des conversations - épinglées en haut
  const filteredConversations = useMemo(() => {
    // Dédupliquer les conversations par id pour éviter les erreurs de clés dupliquées
    const seenIds = new Set<string>();
    const uniqueConversations = conversations.filter(conv => {
      if (conv.id && seenIds.has(conv.id)) return false;
      if (conv.id) seenIds.add(conv.id);
      return true;
    });

    // Filtrer selon le filtre sélectionné (all/community/reacted/archived/category)
    let filtered = uniqueConversations.filter(conv => {
      const prefs = preferencesMap.get(conv.id);
      const isArchived = prefs?.isArchived || false;

      // Filtrer selon le type de filtre
      if (selectedFilter.type === 'all') {
        // "All" affiche toutes les conversations sauf archivées
        return !isArchived;
      } else if (selectedFilter.type === 'archived') {
        // "Archived" affiche uniquement les archivées
        return isArchived;
      } else if (selectedFilter.type === 'reacted') {
        // "Reacted" affiche uniquement les conversations avec réaction (non archivées)
        return !isArchived && !!prefs?.reaction;
      } else if (selectedFilter.type === 'community') {
        // Filtrer par communauté, exclure les archivées
        return !isArchived && conv.communityId === selectedFilter.communityId;
      } else if (selectedFilter.type === 'category') {
        // Filtrer par catégorie, exclure les archivées
        return !isArchived && prefs?.categoryId === selectedFilter.categoryId;
      }
      return true;
    });

    // Filtrer par recherche
    if (searchQuery) {
      filtered = filtered.filter(conv => {
        const title = conv.title || '';
        const lastMessage = conv.lastMessage?.content || '';
        const query = searchQuery.toLowerCase();

        // Search in title and last message
        // TODO: Add search by user-specific tags from preferences
        return title.toLowerCase().includes(query) ||
               lastMessage.toLowerCase().includes(query);
      });
    }

    // Trier les conversations : épinglées en haut, puis par ordre de dernier message
    const sorted = filtered.sort((a, b) => {
      const aPrefs = preferencesMap.get(a.id);
      const bPrefs = preferencesMap.get(b.id);
      const aPinned = aPrefs?.isPinned || false;
      const bPinned = bPrefs?.isPinned || false;

      // Les conversations épinglées viennent en premier
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // Pour les conversations du même statut d'épinglage, trier par date de dernier message
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    //   total: conversations.length,
    //   filtered: sorted.length,
    //   searchQuery,
    //   selectedFilter,
    //   pinnedCount: sorted.filter(c => preferencesMap.get(c.id)?.isPinned).length,
    //   archivedCount: conversations.filter(c => preferencesMap.get(c.id)?.isArchived).length
    // });

    return sorted;
  }, [conversations, searchQuery, preferencesMap, selectedFilter]);

  // Grouper les conversations par catégorie
  const groupedConversations = useMemo(() => {
    const groups: Array<{
      type: 'pinned' | 'category' | 'uncategorized';
      categoryId?: string;
      categoryName?: string;
      conversations: Conversation[];
    }> = [];

    // Séparer les conversations
    const pinnedWithoutCategory: Conversation[] = [];
    const conversationsByCategory = new Map<string, Conversation[]>();
    const uncategorized: Conversation[] = [];

    filteredConversations.forEach(conv => {
      const prefs = preferencesMap.get(conv.id);
      const isPinned = prefs?.isPinned || false;
      const categoryId = prefs?.categoryId;

      if (isPinned && !categoryId) {
        // Épinglées sans catégorie
        pinnedWithoutCategory.push(conv);
      } else if (categoryId) {
        // Avec catégorie (épinglée ou non)
        if (!conversationsByCategory.has(categoryId)) {
          conversationsByCategory.set(categoryId, []);
        }
        conversationsByCategory.get(categoryId)!.push(conv);
      } else {
        // Sans catégorie et non épinglée
        uncategorized.push(conv);
      }
    });

    // Ajouter le groupe "Pinned" si nécessaire
    if (pinnedWithoutCategory.length > 0) {
      groups.push({
        type: 'pinned',
        conversations: pinnedWithoutCategory
      });
    }

    // Ajouter les groupes de catégories (dans l'ordre des catégories)
    const displayedCategoryIds = new Set<string>();
    categories.forEach(category => {
      const categoryConvs = conversationsByCategory.get(category.id);
      if (categoryConvs && categoryConvs.length > 0) {
        groups.push({
          type: 'category',
          categoryId: category.id,
          categoryName: category.name,
          conversations: categoryConvs
        });
        displayedCategoryIds.add(category.id);
      }
    });

    // Ajouter les conversations avec categoryId orphelin (catégorie n'existe plus) dans uncategorized
    conversationsByCategory.forEach((convs, categoryId) => {
      if (!displayedCategoryIds.has(categoryId)) {
        console.warn('[ConversationList] Found orphaned conversations with missing category:', categoryId);
        uncategorized.push(...convs);
      }
    });

    // Ajouter le groupe "Non catégorisées" si nécessaire
    if (uncategorized.length > 0) {
      groups.push({
        type: 'uncategorized',
        conversations: uncategorized
      });
    }

    return groups;
  }, [filteredConversations, preferencesMap, categories]);

  // Gérer le focus de la recherche
  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback((e: React.FocusEvent) => {
    // Vérifier si le focus va vers un élément du carousel
    const relatedTarget = e.relatedTarget as HTMLElement;
    const searchContainer = searchContainerRef.current;

    if (searchContainer && relatedTarget && searchContainer.contains(relatedTarget)) {
      // Le focus reste dans le container (carousel), ne pas fermer
      return;
    }

    // Petit délai pour permettre les clics sur le carousel
    setTimeout(() => {
      setIsSearchFocused(false);
    }, 150);
  }, []);

  // Détection du scroll infini avec Intersection Observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );
    
    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }
    
    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [onLoadMore, hasMore, isLoadingMore]);
  
  // Test de défilement - ajouter des éléments de test si nécessaire
  // Logs désactivés pour éviter la répétition excessive

  return (
    <div className="flex flex-col h-full max-h-full bg-card conversation-list-container">
      {/* Header de la liste des conversations */}
      <div className="flex-shrink-0 p-4 border-b bg-card z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          
          <div className="flex items-center gap-2">
            {/* Bouton créer nouvelle conversation */}
            <Button
              onClick={onCreateConversation}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t('createNewConversation')}
            >
              <MessageSquare className="h-4 w-4 text-primary" />
            </Button>

            {/* Bouton créer lien */}
            <CreateLinkButton
              onLinkCreated={onLinkCreated}
              forceModal={true}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
            >
              <Link2 className="h-4 w-4 text-primary" />
            </CreateLinkButton>
          </div>
        </div>

        {/* Barre de recherche et carousel */}
        <div ref={searchContainerRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              placeholder={tSearch('placeholder')}
              className="pl-9 h-9"
            />
          </div>

          {/* Community Carousel - affiché uniquement quand la recherche est focalisée */}
          {isSearchFocused && (
            <div onMouseDown={(e) => e.preventDefault()}>
              <CommunityCarousel
                conversations={conversations}
                selectedFilter={selectedFilter}
                onFilterChange={setSelectedFilter}
                t={(key: string) => t(key)}
                preferencesMap={preferencesMap}
              />
            </div>
          )}
        </div>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('loadingConversations')}</p>
            </div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? t('noConversationsFound')
                : t('noConversations')
              }
            </p>
          </div>
        ) : (
          <div className="px-4 py-2">
            {groupedConversations.map((group, groupIndex) => {
              const sectionId = group.type === 'category' && group.categoryId
                ? `category-${group.categoryId}`
                : group.type;
              const isCollapsed = collapsedSections.has(sectionId);

              // Calculer si le groupe contient des conversations avec des messages non lus
              const hasUnreadMessages = group.conversations.some(conv =>
                conv.unreadCount !== undefined && conv.unreadCount > 0
              );

              return (
                <div key={`group-${group.type}-${group.categoryId || groupIndex}`} className="mb-4">
                  {/* Header de section */}
                  {(group.type === 'pinned' || group.type === 'category' || (group.type === 'uncategorized' && categories.length > 0)) && (
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 mb-1 cursor-pointer hover:bg-accent/50 rounded-md transition-colors"
                      onClick={() => toggleSection(sectionId)}
                    >
                      {/* Chevron pour indiquer si la section est ouverte ou fermée */}
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}

                      {group.type === 'pinned' ? (
                        <>
                          <Pin className="h-4 w-4 text-primary fill-current flex-shrink-0" />
                          <h4 className={cn(
                            "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                            hasUnreadMessages && "font-bold text-foreground"
                          )}>
                            {t('conversationsList.pinned') || 'Épinglées'}
                          </h4>
                        </>
                      ) : group.type === 'uncategorized' ? (
                        <>
                          <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h4 className={cn(
                            "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                            hasUnreadMessages && "font-bold text-foreground"
                          )}>
                            {t('conversationsList.uncategorized') || 'Non catégorisées'}
                          </h4>
                        </>
                      ) : (
                        <>
                          <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h4 className={cn(
                            "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                            hasUnreadMessages && "font-bold text-foreground"
                          )}>
                            {group.categoryName}
                          </h4>
                        </>
                      )}
                      <Badge variant="secondary" className="ml-auto h-5 px-2 text-[10px]">
                        {group.conversations.length}
                      </Badge>
                    </div>
                  )}

                  {/* Conversations du groupe - masquées si collapsed, sauf pour uncategorized sans catégories */}
                  {(!isCollapsed || (group.type === 'uncategorized' && categories.length === 0)) && (
                    <div className="space-y-1">
                      {group.conversations.map((conversation, convIndex) => {
                        const prefs = preferencesMap.get(conversation.id);
                        return (
                          <ConversationItem
                            key={`${group.type}-${conversation.id}-${convIndex}`}
                            conversation={conversation}
                            isSelected={selectedConversation?.id === conversation.id}
                            currentUser={currentUser}
                            onClick={() => onSelectConversation(conversation)}
                            onShowDetails={onShowDetails}
                            t={t}
                            isPinned={prefs?.isPinned || false}
                            isMuted={prefs?.isMuted || false}
                            isArchived={prefs?.isArchived || false}
                            reaction={prefs?.reaction}
                            tags={prefs?.tags || []}
                            isMobile={isMobile}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicateur de chargement de plus de conversations */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t('loadingMore') || 'Chargement...'}
                </span>
              </div>
            )}
            
            {/* Trigger pour le chargement infini - invisible mais détecté */}
            {hasMore && !isLoadingMore && (
              <div 
                ref={loadMoreTriggerRef}
                className="h-4 w-full"
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>

      {/* Bouton de création en bas */}
      <div className="flex-shrink-0 p-4 border-t bg-card">
        <Button
          onClick={onCreateConversation}
          className="w-full flex items-center justify-center gap-2 h-11 text-sm font-medium"
        >
          <MessageSquare className="h-5 w-5" />
          {t('createNewConversation')}
        </Button>
      </div>
    </div>
  );
}
