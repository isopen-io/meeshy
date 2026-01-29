'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

  // Variantes d'animation pour le container
  const containerVariants = {
    hidden: {
      opacity: 0,
      scale: 0.92,
      y: -10,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 280,
        damping: 22,
        staggerChildren: 0.04,
        delayChildren: 0.08,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -8,
      transition: {
        duration: 0.2,
        ease: 'easeInOut',
      },
    },
  };

  // Variantes d'animation pour les items
  const itemVariants = {
    hidden: {
      opacity: 0,
      x: -12,
      scale: 0.96,
    },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
  };

  // Utiliser un portail React pour "teleporter" le composant au niveau body
  // Cela garantit qu'il apparaît au-dessus de TOUS les autres éléments
  // Sur mobile: afficher en modal centré en haut pour garantir la visibilité
  // Sur desktop: positionner relatif au curseur
  const autocompleteContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key="mention-autocomplete"
        ref={containerRef}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={`fixed overflow-y-auto ${
          isMobile
            ? 'left-1/2 -translate-x-1/2 top-4 w-[90vw] max-w-sm max-h-[40vh]'
            : 'max-h-64 w-56'
        }`}
        style={{
          ...(!isMobile && position.top !== undefined && { top: `${position.top}px` }),
          ...(!isMobile && position.bottom !== undefined && { bottom: `${position.bottom}px` }),
          ...(!isMobile && { left: `${position.left}px` }),
          zIndex: 2147483647, // Valeur maximale pour z-index (2^31 - 1)
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(239, 246, 255, 0.98) 50%, rgba(255, 255, 255, 0.95) 100%)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          borderRadius: '16px',
          border: '2px solid rgba(59, 130, 246, 0.3)',
          boxShadow: `
            0 0 0 1px rgba(59, 130, 246, 0.2),
            0 4px 16px rgba(59, 130, 246, 0.15),
            0 12px 32px rgba(59, 130, 246, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.8)
          `,
        }}
      >
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          <motion.div
            className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mx-auto mb-2"
            style={{
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            }}
          />
          Recherche...
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 text-center text-sm text-red-500 dark:text-red-400 font-medium"
          style={{
            textShadow: '0 1px 2px rgba(239, 68, 68, 0.1)',
          }}
        >
          {error}
        </motion.div>
      )}

      {!isLoading && !error && suggestions.length > 0 && (
        <motion.div
          className="py-1"
          initial="hidden"
          animate="visible"
        >
          <motion.div
            variants={itemVariants}
            className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 border-b-2 border-blue-200/40 dark:border-blue-700/40 bg-gradient-to-r from-blue-50/50 via-indigo-50/40 to-blue-50/50 dark:from-blue-900/20 dark:via-indigo-900/15 dark:to-blue-900/20"
            style={{
              backdropFilter: 'blur(8px)',
            }}
          >
            Mentionner un utilisateur
          </motion.div>
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={suggestion.id}
              data-index={index}
              variants={itemVariants}
              className={`w-full flex items-center gap-3 px-3 py-2 transition-all duration-300 ${
                index === selectedIndex
                  ? 'bg-gradient-to-r from-blue-100/80 via-indigo-100/70 to-blue-100/80 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/40'
                  : 'hover:bg-gradient-to-r hover:from-blue-50/60 hover:via-indigo-50/50 hover:to-blue-50/60 dark:hover:from-blue-900/20 dark:hover:via-indigo-900/15 dark:hover:to-blue-900/20'
              }`}
              style={{
                backdropFilter: index === selectedIndex ? 'blur(8px)' : 'none',
                boxShadow: index === selectedIndex
                  ? '0 2px 8px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                  : 'none',
              }}
              onClick={() => onSelect(suggestion.username, suggestion.id)}
              onMouseEnter={() => setSelectedIndex(index)}
              whileHover={{
                x: 4,
                transition: {
                  type: 'spring',
                  stiffness: 400,
                  damping: 20,
                },
              }}
              whileTap={{
                scale: 0.98,
              }}
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
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  @{suggestion.username}
                </div>
                {suggestion.displayName && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {suggestion.displayName}
                  </div>
                )}
              </div>

              <Badge
                variant={getBadgeVariant(suggestion.badge)}
                className="text-xs flex-shrink-0 shadow-sm"
              >
                {getBadgeLabel(suggestion.badge)}
              </Badge>
            </motion.button>
          ))}
        </motion.div>
      )}

      {!isLoading && !error && suggestions.length === 0 && !query && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 font-medium"
        >
          Tapez pour rechercher un utilisateur...
        </motion.div>
      )}

      {!isLoading && !error && suggestions.length === 0 && query && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, type: 'spring' }}
          className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 font-medium"
        >
          Aucun utilisateur trouvé pour "{query}"
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t-2 border-blue-200/40 dark:border-blue-700/40 bg-gradient-to-r from-blue-50/30 via-indigo-50/20 to-blue-50/30 dark:from-blue-900/15 dark:via-indigo-900/10 dark:to-blue-900/15"
        style={{
          backdropFilter: 'blur(8px)',
          fontWeight: 500,
        }}
      >
        ↑↓ pour naviguer • Entrée pour sélectionner • Échap pour fermer
      </motion.div>
    </motion.div>
    </AnimatePresence>
  );

  // Utiliser createPortal pour monter le composant directement dans le body
  // Cela garantit qu'il n'est pas affecté par les overflow, z-index ou position des parents
  if (typeof window === 'undefined') return null;
  return createPortal(autocompleteContent, document.body);
}
