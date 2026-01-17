'use client';

import React, { memo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Hash } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { IdentifierSuggestions } from '../identifier-suggestions';
import type { User } from '@/types';
import type { ConversationType } from '@meeshy/shared/types';

interface ConversationDetailsStepProps {
  title: string;
  customIdentifier: string;
  conversationType: ConversationType;
  onTitleChange: (title: string) => void;
  onIdentifierChange: (identifier: string) => void;
  selectedUsers: User[];
  identifierAvailable: boolean | null;
  isCheckingIdentifier: boolean;
  validateIdentifierFormat: (identifier: string) => boolean;
}

const ConversationDetailsStepComponent: React.FC<ConversationDetailsStepProps> = ({
  title,
  customIdentifier,
  conversationType,
  onTitleChange,
  onIdentifierChange,
  selectedUsers,
  identifierAvailable,
  isCheckingIdentifier,
  validateIdentifierFormat
}) => {
  const { t } = useI18n('modals');

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onTitleChange(e.target.value);
  }, [onTitleChange]);

  const handleIdentifierChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onIdentifierChange(e.target.value);
  }, [onIdentifierChange]);

  if (conversationType === 'direct') {
    return null;
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5">
      <div className="flex items-center gap-2 mb-2">
        <Hash className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="font-medium">{t('createConversationModal.conversationDetails.title')}</span>
      </div>

      <div>
        <Label htmlFor="title" className="text-sm font-medium">
          {t('createConversationModal.conversationDetails.conversationTitle')}
        </Label>
        <Input
          id="title"
          value={title}
          onChange={handleTitleChange}
          placeholder={t('createConversationModal.conversationDetails.titlePlaceholder')}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('createConversationModal.conversationDetails.titleInfoGroup')}
        </p>
      </div>

      <div>
        <Label htmlFor="identifier" className="text-sm font-medium flex items-center gap-2">
          <Hash className="h-4 w-4" aria-hidden="true" />
          {t('createConversationModal.conversationDetails.identifier')}{' '}
          <span className="text-red-500">{t('createConversationModal.conversationDetails.identifierRequired')}</span>
        </Label>
        <div className="mt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
              {t('createConversationModal.conversationDetails.identifierPrefix')}
            </span>
            <Input
              id="identifier"
              value={customIdentifier}
              onChange={handleIdentifierChange}
              placeholder={t('createConversationModal.conversationDetails.identifierPlaceholder')}
              className="flex-1 font-mono"
              required
            />
          </div>
          {isCheckingIdentifier ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('createConversationModal.conversationDetails.checkingIdentifier') || 'Vérification...'}
            </p>
          ) : customIdentifier && !validateIdentifierFormat(customIdentifier) ? (
            <p className="text-xs text-red-500 mt-1">
              {t('createConversationModal.conversationDetails.identifierError')}
            </p>
          ) : identifierAvailable === false ? (
            <p className="text-xs text-red-600 mt-1">
              ❌ {t('createConversationModal.conversationDetails.identifierTaken') || 'Cet identifiant est déjà utilisé'}
            </p>
          ) : identifierAvailable === true ? (
            <p className="text-xs text-green-600 mt-1">
              ✓ {t('createConversationModal.conversationDetails.identifierAvailable') || 'Cet identifiant est disponible'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              {t('createConversationModal.conversationDetails.identifierInfo')}
            </p>
          )}
        </div>

        <IdentifierSuggestions
          title={title}
          selectedUsers={selectedUsers}
          onSelect={onIdentifierChange}
          currentIdentifier={customIdentifier}
        />
      </div>
    </div>
  );
};

export const ConversationDetailsStep = memo(ConversationDetailsStepComponent);
