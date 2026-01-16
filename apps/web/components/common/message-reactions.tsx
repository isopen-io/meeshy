'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import { useI18n } from '@/hooks/use-i18n';
import type { ReactionAggregation } from '@meeshy/shared/types/reaction';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
          'flex flex-nowrap items-end gap-1 md:gap-0.5',
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
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      minHeight: '20px'
                    }}
                    className={cn(
                      'relative flex flex-col items-center justify-center',
                      'rounded-full',
                      'bg-white dark:bg-gray-800',
                      'border shadow-md',
                      'transition-all duration-200',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'hover:shadow-lg hover:scale-110',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      'p-0',
                      hasUserReacted
                        ? 'border-primary ring-1 ring-primary/30 shadow-primary/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary/60'
                    )}
                  >
                    {/* Emoji */}
                    <motion.span
                      className="leading-none"
                      style={{ fontSize: '11px' }}
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
                    
                    {/* Badge avec le nombre - au-dessus de l'emoji */}
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
                        minWidth: '10px',
                        height: '10px',
                        fontSize: '6px'
                      }}
                      className={cn(
                        'absolute -top-0.5 -right-0.5',
                        'flex items-center justify-center',
                        'px-0.5',
                        'rounded-full font-bold',
                        'shadow-sm border',
                        animatingEmojis.has(reaction.emoji)
                          ? 'ring-1 ring-primary/50 ring-offset-0.5'
                          : '',
                        hasUserReacted
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                      )}
                    >
                      {reaction.count}
                    </motion.span>
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

          {showAddButton && (
            <motion.button
              key="add-reaction"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.95 }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
              }}
              onClick={onAddReactionClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAddReactionClick?.();
                }
              }}
              style={{
                width: '16px',
                height: '16px',
                minWidth: '16px',
                minHeight: '16px'
              }}
              className={cn(
                'flex items-center justify-center',
                'rounded-full',
                'bg-secondary/50 border border-border',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-secondary hover:border-primary/50',
                'hover:shadow-sm active:shadow-none',
                'transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'p-0'
              )}
              aria-label={t('add')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </TooltipProvider>
  );
});

MessageReactions.displayName = 'MessageReactions';

export default MessageReactions;
