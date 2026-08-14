'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Bell,
  MessageSquare,
  Users,
  Phone,
  UserPlus,
  Heart,
} from 'lucide-react';
import type { NotificationCounts } from '@/types/notification';

export type FilterType = 'all' | 'new_message' | 'conversation' | 'missed_call' | 'friend_request' | 'mention' | 'reaction';

/**
 * Un onglet, et les types BRUTS qu'il recouvre — dits UNE fois.
 *
 * Le groupement des alias (`user_mentioned` et `mention` sous un seul onglet)
 * est une décision d'affichage, pas de stockage : la gateway ne connaît que la
 * liste qu'on lui passe, ce qui laisse ajouter un onglet sans la redéployer.
 *
 * `all` rend une liste VIDE, jamais l'énumération de tous les types : un onglet
 * « tout » qui énumère devient faux le jour où un type de plus est créé, et il
 * le devient en silence.
 */
export const FILTER_TYPES: Record<FilterType, readonly string[]> = {
  all: [],
  new_message: ['new_message', 'message'],
  mention: ['user_mentioned', 'mention'],
  reaction: ['message_reaction', 'reaction'],
  conversation: ['conversation', 'new_conversation'],
  missed_call: ['missed_call'],
  friend_request: ['friend_request'],
};

type FilterOption = {
  value: FilterType;
  label: string;
  labelShort?: string;
  icon: typeof MessageSquare;
};

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

type NotificationFiltersProps = {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  /** Totaux de l'inbox ENTIÈRE — absents tant que la lecture serveur n'a pas répondu. */
  counts: NotificationCounts | undefined;
  t: TranslateFunction;
};

function getFilterOptions(t: TranslateFunction): FilterOption[] {
  return [
    { value: 'all', label: t('filters.all'), labelShort: t('filters.all'), icon: Bell },
    { value: 'new_message', label: t('filters.messages'), labelShort: t('filters.messagesShort'), icon: MessageSquare },
    { value: 'mention', label: t('filters.mentions'), labelShort: t('filters.mentionsShort'), icon: MessageSquare },
    { value: 'reaction', label: t('filters.reactions'), labelShort: t('filters.reactionsShort'), icon: Heart },
    { value: 'conversation', label: t('filters.conversations'), labelShort: t('filters.conversationsShort'), icon: Users },
    { value: 'missed_call', label: t('filters.calls'), labelShort: t('filters.callsShort'), icon: Phone },
    { value: 'friend_request', label: t('filters.friendRequests'), labelShort: t('filters.friendRequestsShort'), icon: UserPlus },
  ];
}

/**
 * Le compte de l'onglet, lu sur les totaux SERVEUR.
 *
 * Il se calculait sur les notifications déjà chargées : « 0 mention » ne
 * signifiait alors que « 0 mention parmi les vingt dernières », et le chiffre
 * changeait à chaque défilement.
 */
function countByFilter(counts: NotificationCounts | undefined, filter: FilterType): number {
  if (!counts) return 0;
  if (filter === 'all') return counts.total;

  return FILTER_TYPES[filter].reduce((sum, type) => sum + (counts.byType?.[type] ?? 0), 0);
}

export const NotificationFilters = memo(function NotificationFilters({
  activeFilter,
  onFilterChange,
  counts,
  t,
}: NotificationFiltersProps) {
  const filters = getFilterOptions(t);

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {filters.map((filter) => {
        const Icon = filter.icon;
        const count = countByFilter(counts, filter.value);
        const isActive = activeFilter === filter.value;

        return (
          <motion.button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{filter.label}</span>
            <span className="sm:hidden">{filter.labelShort || filter.label}</span>
            {count > 0 && (
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-foreground/10 text-muted-foreground'
              )}>
                {count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});
