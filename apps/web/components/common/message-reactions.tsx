'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import { useI18n } from '@/hooks/use-i18n';
import type { ReactionAggregation } from '@meeshy/shared/types/reaction';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Smile } from 'lucide-react';

interface MessageReactionsProps {
  messageId: string;
  conversationId: string;
  currentUserId?: string;
  currentAnonymousUserId?: string;
  isAnonymous?: boolean;
  className?: string;
  maxVisibleReactions?: number;
  showAddButton?: boolean;
  onAddReactionClick?: () => void;
  // Hook externe optionnel pour partager l'état entre composants
  externalReactionsHook?: ReturnType<typeof useReactionsQuery>;
  conversationColor?: string;
}

/**
 * Composant MessageReactions
 * 
 * Affiche les réactions d'un message de manière élégante et responsive.
 * Features:
 * - Groupement des réactions par emoji avec compteur
 * - Highlight de la réaction de l'utilisateur actuel
 * - Animations d'apparition/disparition (Framer Motion)
 * - Tooltip avec liste des utilisateurs ayant réagi
 * - Click pour toggle la réaction
 * - Bouton "+" pour ajouter une nouvelle réaction
 * - Responsive (stack sur mobile, inline sur desktop)
 */
export const MessageReactions: React.FC<MessageReactionsProps> = React.memo(({
  messageId,
  conversationId,
  currentUserId,
  currentAnonymousUserId,
  isAnonymous = false,
  className,
  maxVisibleReactions = 10,
  showAddButton = true,
  onAddReactionClick,
  externalReactionsHook,
  conversationColor = '#3B82F6',
}) => {
  const { t } = useI18n('reactions');
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);
  const [previousReactionsCount, setPreviousReactionsCount] = React.useState(0);
  const [isNewReaction, setIsNewReaction] = React.useState(false);
  const [reactionCounts, setReactionCounts] = React.useState<Record<string, number>>({});
  const [animatingEmojis, setAnimatingEmojis] = React.useState<Set<string>>(new Set());
  const [loadedEmojis, setLoadedEmojis] = React.useState<Set<string>>(new Set());

  // Un seul hook useReactionsQuery : soit externe (partagé), soit interne
  // Si externalReactionsHook est fourni, on l'utilise directement
  // Sinon, on crée notre propre instance du hook (React Query)
  const shouldCreateInternalHook = !externalReactionsHook;

  const internalReactionsHook = useReactionsQuery({
    messageId,
    currentUserId: isAnonymous ? currentAnonymousUserId : currentUserId,
    isAnonymous,
    enabled: shouldCreateInternalHook
  });

  // Utiliser le hook externe s'il existe, sinon le hook interne
  const reactionsHook = externalReactionsHook || internalReactionsHook;

  const {
    reactions,
    toggleReaction,
    isLoading,
    userReactions
  } = reactionsHook;

  // Debug: log reactions data (disabled to stop infinite loop)
  // React.useEffect(() => {
  //     messageId,
  //     conversationId,
  //     reactions: reactions.length,
  //     isLoading,
  //     userReactions: userReactions.length,
  //     reactionsData: reactions
  //   });
  // }, [messageId, conversationId, reactions, isLoading, userReactions]);

  // Limiter le nombre de réactions affichées
  const visibleReactions = useMemo(() => {
    return reactions.slice(0, maxVisibleReactions);
  }, [reactions, maxVisibleReactions]);

  // Marquer les emojis comme chargés au premier rendu
  React.useEffect(() => {
    if (reactions.length > 0 && isInitialLoad) {
      const emojis = new Set(reactions.map(r => r.emoji));
      setLoadedEmojis(emojis);
      setIsInitialLoad(false);
    }
  }, [reactions, isInitialLoad]);

  // Détecter les nouvelles réactions pour l'animation
  React.useEffect(() => {
    if (isInitialLoad) return; // Skip pendant le chargement initial
    
    const currentCount = reactions.reduce((sum, r) => sum + r.count, 0);
    
    if (currentCount > previousReactionsCount && previousReactionsCount > 0) {
      setIsNewReaction(true);
      
      // Arrêter l'animation après 600ms
      const timer = setTimeout(() => {
        setIsNewReaction(false);
      }, 600);
      
      return () => clearTimeout(timer);
    }
    
    setPreviousReactionsCount(currentCount);
  }, [reactions, previousReactionsCount, isInitialLoad]);

  // Tracker les changements de compteur par emoji pour animer
  React.useEffect(() => {
    if (isInitialLoad) return; // Skip pendant le chargement initial

    const newCounts: Record<string, number> = {};
    const newAnimating = new Set<string>();
    const newEmojis = new Set<string>();
    let hasChanges = false;
    let countsChanged = false;

    reactions.forEach(reaction => {
      const prevCount = reactionCounts[reaction.emoji] || 0;
      newCounts[reaction.emoji] = reaction.count;

      // Vérifier si le compteur a changé
      if (reaction.count !== prevCount) {
        countsChanged = true;
      }

      // Détecter un nouvel emoji (jamais vu avant)
      if (!loadedEmojis.has(reaction.emoji)) {
        newEmojis.add(reaction.emoji);
        newAnimating.add(reaction.emoji);
        hasChanges = true;
      }
      // Si le compteur a augmenté sur un emoji existant
      else if (reaction.count > prevCount && prevCount > 0) {
        newAnimating.add(reaction.emoji);
        hasChanges = true;
      }
    });

    // Ne mettre à jour que si nécessaire pour éviter les boucles infinies
    if (hasChanges || countsChanged) {
      // Mettre à jour les emojis chargés
      if (newEmojis.size > 0) {
        setLoadedEmojis(prev => new Set([...prev, ...newEmojis]));
      }

      // Ne mettre à jour les compteurs que s'ils ont vraiment changé
      if (countsChanged) {
        setReactionCounts(newCounts);
      }

      // Lancer les animations
      if (newAnimating.size > 0) {
        setAnimatingEmojis(prev => new Set([...prev, ...newAnimating]));

        // Arrêter les animations après 500ms
        setTimeout(() => {
          setAnimatingEmojis(prev => {
            const next = new Set(prev);
            newAnimating.forEach(emoji => next.delete(emoji));
            return next;
          });
        }, 500);
      }
    }
  }, [reactions, isInitialLoad]);
  // IMPORTANT: Ne pas inclure reactionCounts et loadedEmojis dans les dépendances pour éviter boucle infinie

  const handleReactionClick = async (emoji: string) => {
    if (isLoading) return;
    await toggleReaction(emoji);
  };

  // Ne pas retourner null même si vide - le hook doit rester actif pour écouter les événements temps réel
  // Si pas de réactions ET pas de loading ET pas de bouton add, on rend un container vide mais présent
  if (!isLoading && visibleReactions.length === 0 && !showAddButton) {
    return (
      <TooltipProvider>
        <div className={cn('flex flex-wrap items-end gap-1 min-h-[1px]', className)} />
      </TooltipProvider>
    );
  }

  // Pendant le chargement, afficher un skeleton ou rien pour éviter le flash
  if (isLoading && visibleReactions.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <motion.div
        animate={isNewReaction ? {
          scale: 1.05,
          transition: {
            duration: 0.15,
            ease: "easeOut"
          }
        } : { scale: 1 }}
        className={cn(
          'flex flex-nowrap items-center gap-1',
          'py-1 px-0.5',
          'overflow-visible',
          'relative z-[99999]',
          className
        )}
        style={{
          overflowX: 'auto',
          overflowY: 'visible'
        }}
      >
        <AnimatePresence mode="popLayout">
          {showAddButton && (
            <motion.button
              key="add-reaction"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.5 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.15, opacity: 1 }}
              whileTap={{ scale: 0.9 }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
              }}
              onClick={onAddReactionClick}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAddReactionClick?.();
                }
              }}
              style={{
                width: '22px',
                height: '22px',
                minWidth: '22px',
                minHeight: '22px',
              }}
              className={cn(
                'flex items-center justify-center',
                'rounded-full',
                'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm',
                'border border-gray-200/50 dark:border-gray-600/50',
                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                'shadow-sm hover:shadow-md',
                'transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                'p-0'
              )}
              aria-label={t('add')}
            >
              <Smile className="h-3 w-3" strokeWidth={2} />
            </motion.button>
          )}

          {visibleReactions.map((reaction) => {
            const hasUserReacted = userReactions.includes(reaction.emoji);
            const isNewEmoji = !isInitialLoad && animatingEmojis.has(reaction.emoji);
            
            return (
              <Tooltip key={reaction.emoji}>
                <TooltipTrigger asChild>
                  <motion.button
                    layout
                    initial={isNewEmoji ? { scale: 0, opacity: 0, y: 10 } : false}
                    animate={{
                      scale: 1,
                      opacity: 1,
                      y: 0,
                    }}
                    exit={{ scale: 0, opacity: 0, y: 10 }}
                    whileHover={{ scale: 1.15, y: -4 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{
                      layout: {
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      },
                      default: {
                        type: 'spring',
                        stiffness: 400,
                        damping: 20,
                      }
                    }}
                    onClick={() => handleReactionClick(reaction.emoji)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleReactionClick(reaction.emoji);
                      }
                    }}
                    disabled={isLoading}
                    aria-pressed={hasUserReacted}
                    aria-label={hasUserReacted ? t('removeReaction', { emoji: reaction.emoji }) : t('addReactionEmoji', { emoji: reaction.emoji })}
                    style={{
                      width: '22px',
                      height: '22px',
                      minWidth: '22px',
                      minHeight: '22px',
                      ...(hasUserReacted ? {
                        borderColor: conversationColor,
                        boxShadow: `0 0 0 1.5px ${conversationColor}40`,
                      } : {})
                    }}
                    className={cn(
                      'relative flex flex-col items-center justify-center',
                      'rounded-full',
                      'bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm',
                      'border-2 shadow-md',
                      'transition-[border-color,box-shadow] duration-200',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'hover:shadow-lg hover:scale-110',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                      'p-0',
                      hasUserReacted
                        ? ''
                        : 'border-gray-200/80 dark:border-gray-600/80 hover:border-gray-400'
                    )}
                  >
                    {/* Emoji */}
                    <motion.span
                      className="leading-none"
                      style={{ fontSize: '13px' }}
                      key={`emoji-${reaction.emoji}`}
                      animate={
                        animatingEmojis.has(reaction.emoji)
                          ? {
                              scale: 1.3,
                              rotate: [0, -15, 15, -15, 0],
                            }
                          : hasUserReacted
                            ? { scale: 1.1 }
                            : { scale: 1 }
                      }
                      transition={{
                        duration: 0.5,
                        ease: "easeInOut"
                      }}
                    >
                      {reaction.emoji}
                    </motion.span>
                    
                    {/* Badge compteur - visible uniquement si > 1 */}
                    {reaction.count > 1 && (
                      <motion.span
                        key={`count-${reaction.emoji}-${reaction.count}`}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={
                          animatingEmojis.has(reaction.emoji)
                            ? {
                                scale: 1.2,
                                opacity: 1,
                              }
                            : { scale: 1, opacity: 1 }
                        }
                        transition={{
                          type: 'spring',
                          stiffness: 600,
                          damping: 20,
                        }}
                        style={{
                          minWidth: '12px',
                          height: '12px',
                          fontSize: '7px',
                          ...(hasUserReacted ? {
                            backgroundColor: conversationColor,
                            borderColor: conversationColor,
                          } : {})
                        }}
                        className={cn(
                          'absolute -top-1 -right-1',
                          'flex items-center justify-center',
                          'px-0.5',
                          'rounded-full font-bold',
                          'shadow-sm border',
                          animatingEmojis.has(reaction.emoji)
                            ? 'ring-1 ring-offset-0.5'
                            : '',
                          hasUserReacted
                            ? 'text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                        )}
                      >
                        {reaction.count}
                      </motion.span>
                    )}
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="text-xs">
                    {hasUserReacted ? (
                      <p className="font-medium mb-1">
                        {t('youAndOthers', { count: reaction.count - 1 })}
                      </p>
                    ) : (
                      <p className="font-medium mb-1">
                        {t('peopleReacted', { count: reaction.count })}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {hasUserReacted ? t('clickToRemove') : t('clickToReact')}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}

        </AnimatePresence>
      </motion.div>
    </TooltipProvider>
  );
});

MessageReactions.displayName = 'MessageReactions';

export default MessageReactions;
