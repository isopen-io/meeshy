'use client';

import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { Search, Clock, Users, Star } from 'lucide-react';

interface SmartSearchProps {
  searchQuery: string;
  onSearch: (query: string) => void;
  recentUsers?: User[];
  suggestedUsers?: User[];
  onUserSelect: (user: User) => void;
  selectedUsers: User[];
}

export function SmartSearch({
  searchQuery,
  onSearch,
  recentUsers = [],
  suggestedUsers = [],
  onUserSelect,
  selectedUsers
}: SmartSearchProps) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recent_conversation_searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading recent searches:', error);
      }
    }
  }, []);

  // Save search to recent searches
  const saveSearch = (query: string) => {
    if (!query.trim()) return;
    
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent_conversation_searches', JSON.stringify(updated));
  };

  // Handle search
  const handleSearch = (query: string) => {
    onSearch(query);
    if (query.trim()) {
      saveSearch(query);
    }
  };

  // Filter out already selected users
  const availableRecentUsers = useMemo(() => 
    recentUsers.filter(user => !selectedUsers.some(selected => selected.id === user.id)),
    [recentUsers, selectedUsers]
  );

  const availableSuggestedUsers = useMemo(() => 
    suggestedUsers.filter(user => !selectedUsers.some(selected => selected.id === user.id)),
    [suggestedUsers, selectedUsers]
  );

  if (!searchQuery && availableRecentUsers.length === 0 && availableSuggestedUsers.length === 0 && recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Recent searches */}
      {!searchQuery && recentSearches.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Recherches récentes
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((search, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleSearch(search)}
              >
                <Search className="h-3 w-3 mr-1" />
                {search}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Recent users */}
      {!searchQuery && availableRecentUsers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            Utilisateurs récents
          </div>
          <div className="space-y-1">
            {availableRecentUsers.slice(0, 3).map(user => (
              <Button
                key={user.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start h-auto p-2"
                onClick={() => onUserSelect(user)}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {(user.displayName || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">
                      {user.displayName || user.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{user.username}
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested users */}
      {!searchQuery && availableSuggestedUsers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
            Suggestions
          </div>
          <div className="space-y-1">
            {availableSuggestedUsers.slice(0, 3).map(user => (
              <Button
                key={user.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start h-auto p-2"
                onClick={() => onUserSelect(user)}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-medium">
                    {(user.displayName || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">
                      {user.displayName || user.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{user.username}
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
