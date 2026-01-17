'use client';

import { memo, useCallback, useState, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CommunityCarousel, type CommunityFilter } from '../CommunityCarousel';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

interface ConversationSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedFilter: CommunityFilter;
  onFilterChange: (filter: CommunityFilter) => void;
  conversations: Conversation[];
  preferencesMap: Map<string, UserConversationPreferences>;
  placeholder: string;
  t: (key: string) => string;
}

export const ConversationSearchBar = memo(function ConversationSearchBar({
  searchQuery,
  onSearchChange,
  selectedFilter,
  onFilterChange,
  conversations,
  preferencesMap,
  placeholder,
  t
}: ConversationSearchBarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={searchContainerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          placeholder={placeholder}
          className="pl-9 h-9"
        />
      </div>

      {/* Community Carousel - affiché uniquement quand la recherche est focalisée */}
      {isSearchFocused && (
        <div onMouseDown={(e) => e.preventDefault()}>
          <CommunityCarousel
            conversations={conversations}
            selectedFilter={selectedFilter}
            onFilterChange={onFilterChange}
            t={t}
            preferencesMap={preferencesMap}
          />
        </div>
      )}
    </div>
  );
});
