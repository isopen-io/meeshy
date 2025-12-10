'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getUserInitials } from '@/lib/avatar-utils';
import { mentionsService } from '@/services/mentions.service';
import type { MentionSuggestion } from '@meeshy/shared/types/mention';

interface MentionAutocompleteProps {
  conversationId: string;
  query: string;
  onSelect: (username: string, userId: string) => void;
  onClose: () => void;
  position: { top?: number; bottom?: number; left: number };
  maxSuggestions?: number;
}

export function MentionAutocomplete({
  conversationId,
  query,
  onSelect,
  onClose,
  position,
  maxSuggestions = 10
}: MentionAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions from API
  const fetchSuggestions = useCallback(async () => {
    if (!conversationId) return;

    // Vérifier que conversationId est un ObjectId MongoDB valide (24 caractères hexadécimaux)
    // Si ce n'est pas le cas (ex: "meeshy"), ne pas appeler l'API
    const isValidObjectId = /^[a-f\d]{24}$/i.test(conversationId);
    if (!isValidObjectId) {
      console.log('[MentionAutocomplete] conversationId invalide:', conversationId);
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Utiliser le service dédié pour les mentions
      const data = await mentionsService.getSuggestions(conversationId, query);

      if (data && data.length > 0) {
        setSuggestions(data.slice(0, maxSuggestions));
        setSelectedIndex(0); // Reset selection when suggestions change
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      console.error('[MentionAutocomplete] Error fetching suggestions:', err);
      setError('Failed to load suggestions');
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, query, maxSuggestions]);

  // Fetch suggestions when query changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [fetchSuggestions]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex].username, suggestions[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, selectedIndex, onSelect, onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (containerRef.current) {
      const selectedElement = containerRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const getBadgeVariant = (badge: MentionSuggestion['badge']) => {
    switch (badge) {
      case 'conversation':
        return 'default';
      case 'friend':
        return 'secondary';
      case 'other':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getBadgeLabel = (badge: MentionSuggestion['badge']) => {
    switch (badge) {
      case 'conversation':
        return 'Présent';
      case 'friend':
        return 'Inviter';
      case 'other':
        return 'Inviter';
      default:
        return '';
    }
  };

  // Détecter mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Utiliser un portail React pour "teleporter" le composant au niveau body
  // Cela garantit qu'il apparaît au-dessus de TOUS les autres éléments
  // Sur mobile: afficher en modal centré en haut pour garantir la visibilité
  // Sur desktop: positionner relatif au curseur
  const autocompleteContent = (
    <div
      ref={containerRef}
      className={`fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl overflow-y-auto ${
        isMobile
          ? 'left-1/2 -translate-x-1/2 top-4 w-[90vw] max-w-sm max-h-[40vh]'
          : 'max-h-64 w-56'
      }`}
      style={{
        ...(!isMobile && position.top !== undefined && { top: `${position.top}px` }),
        ...(!isMobile && position.bottom !== undefined && { bottom: `${position.bottom}px` }),
        ...(!isMobile && { left: `${position.left}px` }),
        zIndex: 2147483647 // Valeur maximale pour z-index (2^31 - 1)
      }}
    >
      {isLoading && (
        <div className="p-4 text-center text-sm text-gray-500">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto mb-2"></div>
          Recherche...
        </div>
      )}

      {error && (
        <div className="p-4 text-center text-sm text-red-500">
          {error}
        </div>
      )}

      {!isLoading && !error && suggestions.length > 0 && (
        <div className="py-1">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            Mentionner un utilisateur
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              data-index={index}
              className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : ''
              }`}
              onClick={() => onSelect(suggestion.username, suggestion.id)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                {suggestion.avatar && (
                  <AvatarImage src={suggestion.avatar} alt={suggestion.username} />
                )}
                <AvatarFallback className="text-xs">
                  {getUserInitials({
                    firstName: suggestion.displayName || suggestion.username,
                    lastName: ''
                  })}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  @{suggestion.username}
                </div>
                {suggestion.displayName && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {suggestion.displayName}
                  </div>
                )}
              </div>

              <Badge variant={getBadgeVariant(suggestion.badge)} className="text-xs flex-shrink-0">
                {getBadgeLabel(suggestion.badge)}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {!isLoading && !error && suggestions.length === 0 && !query && (
        <div className="p-4 text-center text-sm text-gray-500">
          Tapez pour rechercher un utilisateur...
        </div>
      )}

      {!isLoading && !error && suggestions.length === 0 && query && (
        <div className="p-4 text-center text-sm text-gray-500">
          Aucun utilisateur trouvé pour "{query}"
        </div>
      )}

      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        ↑↓ pour naviguer • Entrée pour sélectionner • Échap pour fermer
      </div>
    </div>
  );

  // Utiliser createPortal pour monter le composant directement dans le body
  // Cela garantit qu'il n'est pas affecté par les overflow, z-index ou position des parents
  if (typeof window === 'undefined') return null;
  return createPortal(autocompleteContent, document.body);
}
