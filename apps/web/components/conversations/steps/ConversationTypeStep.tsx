'use client';

import React, { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Users, User as UserIcon, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { ConversationType } from '@meeshy/shared/types';

interface ConversationTypeStepProps {
  conversationType: ConversationType;
  onTypeChange: (type: ConversationType) => void;
  selectedUsersCount: number;
}

const ConversationTypeStepComponent: React.FC<ConversationTypeStepProps> = ({
  conversationType,
  onTypeChange,
  selectedUsersCount
}) => {
  const { t } = useI18n('modals');

  const handleTypeChange = useCallback((type: ConversationType) => {
    onTypeChange(type);
  }, [onTypeChange]);

  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">
        {t('createConversationModal.conversationDetails.conversationType')}
      </Label>
      <div className={cn(
        "grid gap-2",
        selectedUsersCount === 1 ? "grid-cols-3" : "grid-cols-2"
      )}>
        {selectedUsersCount === 1 && (
          <Button
            type="button"
            variant={conversationType === 'direct' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeChange('direct')}
            className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-pressed={conversationType === 'direct'}
          >
            <UserIcon className="h-4 w-4" aria-hidden="true" />
            {t('createConversationModal.conversationTypes.direct')}
          </Button>
        )}
        {selectedUsersCount > 0 && (
          <Button
            type="button"
            variant={conversationType === 'group' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeChange('group')}
            className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-pressed={conversationType === 'group'}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            {t('createConversationModal.conversationTypes.group')}
          </Button>
        )}
        <Button
          type="button"
          variant={conversationType === 'public' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleTypeChange('public')}
          className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-pressed={conversationType === 'public'}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          {t('createConversationModal.conversationTypes.public')}
        </Button>
      </div>
    </div>
  );
};

export const ConversationTypeStep = memo(ConversationTypeStepComponent);
