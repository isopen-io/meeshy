'use client';

import { useCallback, useMemo } from 'react';
import { Archive, Users, MessageSquare, Grid3x3, Heart } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import { useCommunitiesQuery } from '@/hooks/queries';

interface CommunityCarouselProps {
  conversations: Conversation[];
  selectedFilter: CommunityFilter;
  onFilterChange: (filter: CommunityFilter) => void;
  t: (key: string) => string;
  preferencesMap?: Map<string, UserConversationPreferences>;
}

export type CommunityFilter =
  | { type: 'all' }
  | { type: 'archived' }
  | { type: 'reacted' }
  | { type: 'community'; communityId: string }
  | { type: 'category'; categoryId: string };

interface CardData {
  id: string;
  type: 'all' | 'archived' | 'reacted' | 'community';
  title: string;
  image?: string;
  memberCount?: number;
  conversationCount: number;
  communityId?: string;
}

export function CommunityCarousel({
  conversations,
  selectedFilter,
  onFilterChange,
  t,
  preferencesMap = new Map()
}: CommunityCarouselProps) {
  const { data: communities = [], isLoading: isLoadingCommunities } = useCommunitiesQuery();

  // Calculer les données des cartes
  const cards = useMemo((): CardData[] => {
    const result: CardData[] = [];

    // Vérifier que conversations est un tableau valide
    if (!Array.isArray(conversations)) {
      console.warn('[CommunityCarousel] ⚠️ Conversations is not an array:', conversations);
      return result;
    }


    // Carte "All" - toutes les conversations non archivées
    const nonArchivedCount = conversations.filter(c => {
      if (!c || !c.id) return false;
      const prefs = preferencesMap.get(c.id);
      return !(prefs?.isArchived || false);
    }).length;

    result.push({
      id: 'all',
      type: 'all',
      title: t('conversationsList.all') || 'All',
      conversationCount: nonArchivedCount
    });

    // Cartes des communautés
    if (Array.isArray(communities)) {

      communities.forEach(community => {
        if (!community || !community.id) return;

        const conversationCountFromBackend = community._count?.conversations ?? 0;

        result.push({
          id: community.id,
          type: 'community',
          title: community.name || 'Community',
          image: community.avatar,
          memberCount: community._count?.members,
          conversationCount: conversationCountFromBackend, // Utiliser le comptage du backend
          communityId: community.id
        });
      });
    }

    // Carte "Reacted" - conversations avec réaction
    const reactedCount = conversations.filter(c => {
      if (!c || !c.id) return false;
      const prefs = preferencesMap.get(c.id);
      return prefs?.reaction && !(prefs?.isArchived || false);
    }).length;

    if (reactedCount > 0) {
      result.push({
        id: 'reacted',
        type: 'reacted',
        title: t('conversationsList.reacted') || 'Favorites',
        conversationCount: reactedCount
      });
    }

    // Carte "Archived" - conversations archivées
    const archivedCount = conversations.filter(c => {
      if (!c || !c.id) return false;
      const prefs = preferencesMap.get(c.id);
      return prefs?.isArchived || false;
    }).length;

    result.push({
      id: 'archived',
      type: 'archived',
      title: t('conversationsList.archived') || 'Archived',
      conversationCount: archivedCount
    });


    return result;
  }, [conversations, communities, t, preferencesMap]);

  const handleCardClick = useCallback((card: CardData) => {
    if (card.type === 'all') {
      onFilterChange({ type: 'all' });
    } else if (card.type === 'archived') {
      onFilterChange({ type: 'archived' });
    } else if (card.type === 'reacted') {
      onFilterChange({ type: 'reacted' });
    } else if (card.type === 'community' && card.communityId) {
      onFilterChange({ type: 'community', communityId: card.communityId });
    }
  }, [onFilterChange]);

  const isSelected = useCallback((card: CardData): boolean => {
    if (selectedFilter.type === 'all' && card.type === 'all') return true;
    if (selectedFilter.type === 'archived' && card.type === 'archived') return true;
    if (selectedFilter.type === 'reacted' && card.type === 'reacted') return true;
    if (selectedFilter.type === 'community' && card.type === 'community') {
      return selectedFilter.communityId === card.communityId;
    }
    return false;
  }, [selectedFilter]);

  if (isLoadingCommunities) {
    return (
      <div className="w-full py-3 px-2 border-b border-border bg-background/50">
        <div className="flex items-center justify-center h-20 md:h-24 p-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-3 px-2 border-b border-border bg-background/50">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 md:gap-3 p-2">
          {cards.map((card) => (
            <CommunityCard
              key={card.id}
              card={card}
              isSelected={isSelected(card)}
              onClick={() => handleCardClick(card)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

interface CommunityCardProps {
  card: CardData;
  isSelected: boolean;
  onClick: () => void;
}

function CommunityCard({ card, isSelected, onClick }: CommunityCardProps) {
  const getCardIcon = () => {
    if (card.type === 'all') return <Grid3x3 className="h-6 w-6 md:h-8 md:w-8" />;
    if (card.type === 'archived') return <Archive className="h-6 w-6 md:h-8 md:w-8" />;
    if (card.type === 'reacted') return <Heart className="h-6 w-6 md:h-8 md:w-8" />;
    return <Users className="h-6 w-6 md:h-8 md:w-8" />;
  };

  const getCardGradient = () => {
    if (card.type === 'all') return 'from-primary/20 to-primary/10';
    if (card.type === 'archived') return 'from-muted to-muted/50';
    if (card.type === 'reacted') return 'from-pink-500/20 to-red-500/10';
    return 'from-blue-500/20 to-purple-500/10';
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0 w-28 h-20 md:w-32 md:h-24 rounded-xl overflow-hidden transition-[transform,box-shadow,border-color]",
        "hover:scale-105 hover:shadow-lg",
        "border-2",
        isSelected
          ? "border-primary shadow-md scale-105"
          : "border-transparent hover:border-primary/50"
      )}
    >
      {/* Background avec image ou gradient */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br",
        getCardGradient()
      )}>
        {card.image ? (
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={card.image} className="object-cover" />
            <AvatarFallback className="rounded-none bg-transparent">
              {getCardIcon()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary/60">
            {getCardIcon()}
          </div>
        )}
      </div>

      {/* Overlay avec informations */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-2">
        <h3 className="text-white font-semibold text-sm truncate mb-1">
          {card.title}
        </h3>
        <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-white/80">
          <div className="flex items-center gap-0.5 md:gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{card.conversationCount}</span>
          </div>
          {card.memberCount !== undefined && (
            <div className="flex items-center gap-0.5 md:gap-1">
              <Users className="h-3 w-3" />
              <span>{card.memberCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Indicateur de sélection */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 h-2 w-2 bg-primary rounded-full animate-pulse" />
      )}
    </button>
  );
}
