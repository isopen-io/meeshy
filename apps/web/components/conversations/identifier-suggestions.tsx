'use client';

import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { Hash, Sparkles } from 'lucide-react';

interface IdentifierSuggestionsProps {
  title: string;
  selectedUsers: User[];
  onSelect: (identifier: string) => void;
  currentIdentifier: string;
}

export function IdentifierSuggestions({ 
  title, 
  selectedUsers, 
  onSelect, 
  currentIdentifier 
}: IdentifierSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const generateSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    
    // Suggestion basée sur le titre
    if (title.trim()) {
      const titleBased = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (titleBased) {
        suggestions.push(titleBased);
      }
    }

    // Suggestions basées sur les utilisateurs
    if (selectedUsers.length > 0) {
      if (selectedUsers.length === 1) {
        // Conversation directe
        const user = selectedUsers[0];
        const username = user.username.toLowerCase();
        suggestions.push(`chat-${username}`);
        suggestions.push(`dm-${username}`);
      } else if (selectedUsers.length === 2) {
        // Conversation entre 2 personnes
        const usernames = selectedUsers.map(u => u.username.toLowerCase()).sort();
        suggestions.push(`chat-${usernames[0]}-${usernames[1]}`);
        suggestions.push(`${usernames[0]}-${usernames[1]}`);
      } else {
        // Groupe
        const firstUser = selectedUsers[0].username.toLowerCase();
        suggestions.push(`groupe-${firstUser}`);
        suggestions.push(`team-${firstUser}`);
        suggestions.push(`groupe-${selectedUsers.length}`);
      }
    }

    // Suggestions génériques
    suggestions.push('conversation-privee');
    suggestions.push('chat-groupe');
    suggestions.push('discussion');

    return suggestions.filter((suggestion, index, self) => 
      suggestion && 
      suggestion !== currentIdentifier && 
      self.indexOf(suggestion) === index
    ).slice(0, 5);
  }, [title, selectedUsers, currentIdentifier]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Suggestions d'identifiants
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSelect(suggestion)}
          >
            <Hash className="h-3 w-3 mr-1" />
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
