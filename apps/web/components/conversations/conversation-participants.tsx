'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getTagColor } from '@/utils/tag-colors';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Users,
  Crown,
  Loader2,
  Ghost
} from 'lucide-react';
import { SocketIOUser as User, MemberRole } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';
import { getUserStatus } from '@/lib/user-status';
import { useUserStore } from '@/stores/user-store';

/** Type-safe accessor for participant.user which is typed as `unknown` in the shared schema */
type ParticipantUser = User & { type?: string; sessionToken?: string; shareLinkId?: string };
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { isAnonymousParticipant, getParticipantDisplayName, getParticipantInitials } from '@/utils/participant-helpers';

interface ConversationParticipantsProps {
  conversationId: string;
  participants: Participant[];
  currentUser: User;
  isGroup: boolean;
  conversationType?: string; // Ajouter le type de conversation
  className?: string;
  typingUsers?: Array<{ userId: string; conversationId: string }>;
  conversationTitle?: string; // Titre de la conversation
  conversationTags?: string[]; // Tags de la conversation
  conversationCategory?: string; // Catégorie de la conversation
}

export function ConversationParticipants({
  conversationId,
  participants,
  currentUser,
  isGroup,
  conversationType = 'group', // Valeur par défaut
  className = "",
  typingUsers = [],
  conversationTitle,
  conversationTags = [],
  conversationCategory
}: ConversationParticipantsProps) {
  const { t } = useI18n('conversations');


  // Les typing users sont désormais passés par props pour éviter des abonnements socket multiples

  // Filtrer les utilisateurs qui tapent dans cette conversation (exclure l'utilisateur actuel)
  // NOTE: Ne pas filtrer par conversationId car le backend normalise les IDs (ObjectId → identifier)
  // et le hook useMessaging ne remonte déjà que les événements de la conversation courante
  const usersTypingInChat = (typingUsers || []).filter((typingUser: { userId: string; conversationId: string }) =>
    typingUser.userId !== currentUser.id
  );



  // Store global pour statuts temps reel
  const userStore = useUserStore();
  const _tick = userStore._lastStatusUpdate;

  // Listes en ligne / hors-ligne via getUserStatus (temps reel)
  const onlineAll = participants.filter(p => {
    const storeUser = p.userId ? userStore.getUserById(p.userId) : undefined;
    return getUserStatus(storeUser || p.user as ParticipantUser) === 'online';
  });
  const offlineAll = participants.filter(p => {
    const storeUser = p.userId ? userStore.getUserById(p.userId) : undefined;
    return getUserStatus(storeUser || p.user as ParticipantUser) !== 'online';
  });
  const recentActiveParticipants = onlineAll.slice(0, 3);



  // Obtenir les noms des utilisateurs qui tapent
  const typingUserNames = usersTypingInChat.map((typingUser: { userId: string; conversationId: string }) => {
    const participant = participants.find(p => p.userId === typingUser.userId);
    return (participant?.user as ParticipantUser)?.displayName || (participant?.user as ParticipantUser)?.username || typingUser.userId;
  });

  const renderTypingMessage = () => {
    if (typingUserNames.length === 1) {
      return `${typingUserNames[0]} ${t('conversationParticipants.typing')}`;
    } else if (typingUserNames.length === 2) {
      return `${typingUserNames[0]} et ${typingUserNames[1]} ${t('conversationParticipants.typing')}`;
    } else {
      return `${typingUserNames.length} ${t('conversationParticipants.typingMultiple')}`;
    }
  };

  const isCreator = (participant: Participant): boolean => {
    return participant.role === MemberRole.CREATOR;
  };

  const shouldShowCrown = (participant: Participant): boolean => {
    return conversationType !== 'direct' && isCreator(participant);
  };

  // Dédupliquer les participants par userId pour éviter les erreurs de clés dupliquées
  const uniqueParticipantsMap = new Map<string, Participant>();
  participants.forEach(p => {
    if (p.userId && !uniqueParticipantsMap.has(p.userId)) {
      uniqueParticipantsMap.set(p.userId, p);
    }
  });
  const uniqueParticipants = Array.from(uniqueParticipantsMap.values());

  // Trouver l'utilisateur connecté dans les participants ou l'ajouter
  const currentUserParticipant = uniqueParticipants.find(p => p.userId === currentUser.id);
  const allParticipantsIncludingCurrent = currentUserParticipant
    ? uniqueParticipants
    : [...uniqueParticipants, {
        id: currentUser.id,
        conversationId,
        type: 'user' as const,
        userId: currentUser.id,
        displayName: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`,
        avatar: currentUser.avatar,
        role: MemberRole.MEMBER as string,
        language: currentUser.systemLanguage || 'fr',
        permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canSendVideos: true, canSendAudios: true, canSendLocations: true, canSendLinks: true },
        isActive: true,
        isOnline: currentUser.isOnline,
        joinedAt: new Date(),
        user: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          avatar: currentUser.avatar,
          isOnline: currentUser.isOnline,
          lastActiveAt: currentUser.lastActiveAt,
          systemLanguage: currentUser.systemLanguage,
          role: currentUser.role,
        },
      } satisfies Participant];

  // Afficher les 3 premiers participants en ligne (incluant l'utilisateur connecté s'il est en ligne)
  // Afficher l'utilisateur courant + 2 autres participants (en ligne ou non)
  let displayParticipants: Participant[] = [];
  if (currentUserParticipant) {
    displayParticipants = [currentUserParticipant];
    // Ajoute 2 autres participants (excluant l'utilisateur courant)
    displayParticipants = displayParticipants.concat(
      allParticipantsIncludingCurrent.filter(p => p.userId !== currentUser.id).slice(0, 2)
    );
  } else {
    // Si l'utilisateur courant n'est pas dans la liste, prendre les 3 premiers
    displayParticipants = allParticipantsIncludingCurrent.slice(0, 3);
  }

  return (
    <>
      {/* Affichage dans l'en-tête : Soit indicateur de frappe seul, soit avatars + détails */}
      <div className={cn("flex items-center gap-2", className)}>
        {usersTypingInChat.length > 0 ? (
          /* INDICATEUR DE FRAPPE SEUL - Toute la zone est nettoyée */
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="font-medium">{renderTypingMessage()}</span>
          </div>
        ) : (
          /* AVATARS + DÉTAILS DE LA CONVERSATION */
          <>
            {/* Avatars des participants en ligne */}
            <div className="flex -space-x-2">
              {displayParticipants.map((participant, index) => {
                const user = participant.user as ParticipantUser;
                const isAnonymous = isAnonymousParticipant(user);
                const isCurrentUser = user?.id === currentUser.id;
                // Utiliser index pour garantir l'unicité même en cas de doublons dans les données
                const uniqueKey = `${participant.userId || user?.id || 'unknown'}-${index}`;

                const avatarContent = (
                  <>
                    {isAnonymous ? (
                      <div className="h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center border-2 border-background">
                        <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                    ) : (
                      <Avatar className="h-6 w-6 border-2 border-background">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getParticipantInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {/* Tooltip au survol */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                      <div className="flex items-center gap-1">
                        {isAnonymous && <Ghost className="h-3 w-3" />}
                        {getParticipantDisplayName(user)}
                        {isCurrentUser && ` (${t('conversationDetails.you')})`}
                      </div>
                    </div>
                  </>
                );

                // Si l'utilisateur n'est pas anonyme et a un username, le rendre cliquable
                if (!isAnonymous && user.username) {
                  return (
                    <Link key={uniqueKey} href={`/u/${user.username}`} onClick={(e) => e.stopPropagation()} className="relative group">
                      {avatarContent}
                    </Link>
                  );
                }

                return (
                  <div key={uniqueKey} className="relative group">
                    {avatarContent}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
