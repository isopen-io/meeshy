'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Message } from '@meeshy/shared/types/conversation';
import { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import { useI18n } from '@/hooks/useI18n';

interface ReactionSelectionMessageViewProps {
  message: Message;
  isOwnMessage: boolean;
  onSelectReaction: (emoji: string) => void;
  onClose: () => void;
  recentEmojis?: string[];
  // Props pour les réactions
  conversationId?: string;
  currentUserId?: string;
  currentAnonymousUserId?: string;
  isAnonymous?: boolean;
}

// Catégories d'emojis avec traductions
const EMOJI_CATEGORIES = {
  smileys: {
    key: 'smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍',
      '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋',
      '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢',
      '🫣', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑',
      '😶', '🫥', '😶‍🌫️', '😏', '😒', '🙄', '😬', '😮‍💨',
      '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵',
      '😵‍💫', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐',
      '😕', '🫤', '😟', '🙁', '☹️', '😮', '😯', '😲',
      '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥',
      '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩',
      '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿'
    ]
  },
  symbols: {
    key: 'symbols',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '❤️‍🔥', '❤️‍🩹', '💔', '❣️', '💕', '💞', '💓',
      '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️',
      '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐'
    ]
  },
  people: {
    key: 'people',
    icon: '👤',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳',
      '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵',
      '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌',
      '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳',
      '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃'
    ]
  },
  nature: {
    key: 'nature',
    icon: '🌲',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
      '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸',
      '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦',
      '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺',
      '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌',
      '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️'
    ]
  },
  food: {
    key: 'food',
    icon: '🍔',
    emojis: [
      '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇',
      '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
      '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️',
      '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠'
    ]
  },
  activities: {
    key: 'activities',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
      '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
      '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿',
      '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌'
    ]
  },
  objects: {
    key: 'objects',
    icon: '💡',
    emojis: [
      '💌', '💎', '💍', '💡', '💰', '💳', '💸', '💻',
      '⌚', '📱', '📲', '💽', '💾', '💿', '📀', '📷',
      '📸', '📹', '🎥', '📞', '☎️', '📟', '📠', '📺',
      '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰'
    ]
  },
};

export const ReactionSelectionMessageView = memo(function ReactionSelectionMessageView({
  message,
  isOwnMessage,
  onSelectReaction,
  onClose,
  recentEmojis = ['❤️', '😀', '👍', '😂', '🔥', '🎉', '💯', '✨'],
  conversationId,
  currentUserId,
  currentAnonymousUserId,
  isAnonymous = false
}: ReactionSelectionMessageViewProps) {
  const { t } = useI18n('reactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('smileys');
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);

  // Hook de réactions intégré (React Query)
  const { addReaction, isLoading, userReactions } = useReactionsQuery({
    messageId: message.id,
    currentUserId: isAnonymous ? currentAnonymousUserId : currentUserId,
    isAnonymous
  });

  // Utiliser les catégories sans recent
  const categories = useMemo(() => {
    return { ...EMOJI_CATEGORIES };
  }, []);

  // Filtrer les emojis selon la recherche
  const filteredEmojis = useMemo(() => {
    if (!searchQuery) {
      return categories[selectedCategory as keyof typeof categories]?.emojis || [];
    }

    // Rechercher dans toutes les catégories
    const allEmojis: string[] = [];
    Object.values(categories).forEach(category => {
      if (category.emojis) {
        allEmojis.push(...category.emojis);
      }
    });

    // Filtrer les doublons et retourner les résultats
    return Array.from(new Set(allEmojis));
  }, [searchQuery, selectedCategory, categories]);

  const handleEmojiSelect = useCallback(async (emoji: string) => {
    // Éviter les doubles clics pendant le traitement
    if (isLoading) return;
    
    try {
      // Ajouter la réaction via le hook
      const success = await addReaction(emoji);
      
      
      // Toujours notifier le parent pour fermer la vue
      // Le parent gérera la fermeture via exitMode()
      onSelectReaction(emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
      // En cas d'erreur, on ferme quand même après un délai
      setTimeout(() => {
        onSelectReaction(emoji);
      }, 500);
    }
  }, [addReaction, isLoading, onSelectReaction]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        "relative w-full mx-auto rounded-lg border shadow-lg overflow-hidden",
        "max-w-[320px] sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl",
        isOwnMessage 
          ? "bg-gradient-to-br from-indigo-500/95 to-indigo-700/95 border-indigo-400 backdrop-blur-sm" 
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b",
        isOwnMessage 
          ? "border-white/20 bg-white/10" 
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      )}>
        <h3 className={cn(
          "text-sm font-semibold",
          isOwnMessage ? "text-indigo-900" : "text-gray-800 dark:text-gray-100"
        )}>
          {t('chooseReaction')}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className={cn(
            "h-6 w-6 p-0 rounded-full",
            isOwnMessage 
              ? "text-indigo-900 hover:text-indigo-950 hover:bg-indigo-900/20" 
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
          )}
          aria-label={t('close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Most Used Section - Déplacé avant la recherche */}
      {recentEmojis.length > 0 && !searchQuery && (
        <div className={cn(
          "px-4 py-3 border-b",
          isOwnMessage 
            ? "border-white/20 bg-white/5" 
            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
        )}>
          <p className={cn(
            "text-xs mb-2 font-medium",
            isOwnMessage ? "text-indigo-900" : "text-gray-600 dark:text-gray-300"
          )}>
            {t('mostUsedReactions')}
          </p>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1 sm:gap-1.5">
            {recentEmojis.slice(0, 12).map((emoji, index) => {
              const isReacted = userReactions.includes(emoji);
              return (
                <motion.button
                  key={`most-used-${emoji}-${index}`}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "relative h-10 w-10 flex items-center justify-center rounded-lg text-xl transition-colors duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-offset-1",
                    isReacted
                      ? isOwnMessage
                        ? "bg-white/40 border-2 border-white/70 shadow-md focus:ring-white/50"
                        : "bg-indigo-100 border-2 border-indigo-500 shadow-md dark:bg-indigo-900/60 dark:border-indigo-500 focus:ring-indigo-400"
                      : isOwnMessage 
                        ? "hover:bg-white/20 border border-transparent" 
                        : "hover:bg-gray-100 border border-transparent dark:hover:bg-gray-700"
                  )}
                  onClick={() => handleEmojiSelect(emoji)}
                  aria-label={`${isReacted ? t('removeReaction') : t('addReaction')} ${emoji}`}
                >
                  <span className="leading-none select-none">{emoji}</span>
                  {isReacted && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className={cn(
                        "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm",
                        isOwnMessage 
                          ? "bg-white text-indigo-600" 
                          : "bg-indigo-600 text-white"
                      )}
                    >
                      ✓
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className={cn(
            "absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4",
            isOwnMessage ? "text-gray-500" : "text-gray-400"
          )} />
          <Input
            type="text"
            placeholder={t('searchEmoji')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "pl-10 pr-4 h-9 text-sm",
              isOwnMessage 
                ? "bg-white border-indigo-300 text-gray-900 placeholder:text-gray-500 focus:bg-white focus:border-indigo-500" 
                : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            )}
            autoFocus
          />
        </div>
      </div>

      {/* Category Tabs */}
      {!searchQuery && (
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="px-4">
          <div className="w-full overflow-x-auto scrollbar-hide">
            <TabsList className={cn(
              "flex h-8 gap-0 w-max min-w-full",
              isOwnMessage 
                ? "bg-white/10" 
                : "bg-gray-100 dark:bg-gray-900"
            )}>
              {Object.entries(categories).map(([key, category]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className={cn(
                    "text-xs px-1 py-0.5 h-7 min-w-[32px] data-[state=active]:text-xs flex-shrink-0",
                    "transition-colors duration-200 flex items-center justify-center",
                    isOwnMessage 
                      ? "data-[state=active]:bg-white/30 data-[state=active]:text-white hover:bg-white/20" 
                      : "data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                  title={t(`category_${category.key}`)}
                >
                  <span className="text-sm">{category.icon}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      )}


      {/* Emoji Grid */}
      <ScrollArea className="h-72 px-4 py-3">
        {filteredEmojis.length === 0 ? (
          <div className={cn(
            "flex flex-col items-center justify-center h-full py-12 text-center",
            isOwnMessage ? "text-indigo-900" : "text-gray-500 dark:text-gray-400"
          )}>
            <Search className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">{t('noEmojisFound')}</p>
            <p className="text-xs mt-1">{t('tryDifferentSearch')}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className={cn(
                "mt-4",
                isOwnMessage 
                  ? "text-indigo-900 hover:text-indigo-950 hover:bg-indigo-900/20" 
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              {t('clearSearch')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1.5 pb-2">
            {filteredEmojis.map((emoji, index) => {
              const isReacted = userReactions.includes(emoji);
              return (
                <motion.button
                  key={`${emoji}-${index}`}
                  whileHover={{ scale: 1.15, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  disabled={isLoading}
                  className={cn(
                    "relative h-11 w-11 flex items-center justify-center rounded-lg text-2xl transition-colors duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-offset-1",
                    isReacted
                      ? isOwnMessage
                        ? "bg-white/40 border-2 border-white/70 shadow-md focus:ring-white/50"
                        : "bg-indigo-100 border-2 border-indigo-500 shadow-md dark:bg-indigo-900/60 dark:border-indigo-500 focus:ring-indigo-400"
                      : hoveredEmoji === emoji 
                        ? isOwnMessage 
                          ? "bg-white/30 border border-white/50" 
                          : "bg-gray-100 border border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                        : isOwnMessage 
                          ? "hover:bg-white/20 border border-transparent" 
                          : "hover:bg-gray-100 border border-transparent dark:hover:bg-gray-700",
                    isLoading && "opacity-40 cursor-not-allowed"
                  )}
                  onClick={() => handleEmojiSelect(emoji)}
                  onMouseEnter={() => setHoveredEmoji(emoji)}
                  onMouseLeave={() => setHoveredEmoji(null)}
                  aria-label={`${isReacted ? t('removeReaction') : t('addReaction')} ${emoji}`}
                  title={isReacted ? t('removeReaction') : t('addReaction')}
                >
                  <span className="leading-none select-none">{emoji}</span>
                  {isReacted && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className={cn(
                        "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm",
                        isOwnMessage 
                          ? "bg-white text-indigo-600" 
                          : "bg-indigo-600 text-white"
                      )}
                    >
                      ✓
                    </motion.div>
                  )}
                  {isLoading && hoveredEmoji === emoji && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg backdrop-blur-sm"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
});