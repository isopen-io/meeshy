'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, MessageSquare, PhoneMissed, Settings, Users, UserPlus } from '@/lib/icons';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

export type NotificationType = 'all' | 'new_message' | 'missed_call' | 'system' | 'conversation' | 'friend_request';

interface NotificationFiltersProps {
  selectedType: NotificationType;
  onTypeChange: (type: NotificationType) => void;
  counts?: {
    all: number;
    new_message: number;
    missed_call: number;
    system: number;
    conversation: number;
    friend_request: number;
  };
}

export function NotificationFilters({ selectedType, onTypeChange, counts }: NotificationFiltersProps) {
  const { t } = useI18n('notifications');

  const filters: { key: NotificationType; Icon: LucideIcon }[] = [
    { key: 'all', Icon: Bell },
    { key: 'new_message', Icon: MessageSquare },
    { key: 'friend_request', Icon: UserPlus },
    { key: 'missed_call', Icon: PhoneMissed },
    { key: 'system', Icon: Settings },
    { key: 'conversation', Icon: Users },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {filters.map((filter) => {
        const { Icon } = filter;
        return (
          <Button
            key={filter.key}
            variant={selectedType === filter.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => onTypeChange(filter.key)}
            className="flex items-center gap-2"
          >
            <Icon className="h-4 w-4" />
            <span>{t(`filters.${filter.key}`)}</span>
            {counts && counts[filter.key] > 0 && (
              <Badge variant="secondary" className="ml-1">
                {counts[filter.key]}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
