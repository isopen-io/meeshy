'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Type, Smile, Pencil, Check, X, Info } from 'lucide-react';
import { userPreferencesService } from '@/services/user-preferences.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import type { User } from '@meeshy/shared/types';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function isAnonymousUser(user: any): user is AnonymousParticipant {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

interface CustomizationManagerProps {
  conversationId: string;
  currentUser: User;
  onPreferencesUpdated?: () => void;
}

/**
 * Component for managing custom name and reaction emoji
 * User-specific preferences for conversations
 */
export function CustomizationManager({ conversationId, currentUser, onPreferencesUpdated }: CustomizationManagerProps) {
  const { t } = useI18n('conversations');
  const [customName, setCustomName] = useState('');
  const [reaction, setReaction] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingReaction, setIsEditingReaction] = useState(false);

  useEffect(() => {
    if (isAnonymousUser(currentUser)) {
      setIsLoading(false);
      return;
    }

    const loadPreferences = async () => {
      try {
        setIsLoading(true);
        const prefs = await userPreferencesService.getPreferences(conversationId);
        setCustomName(prefs?.customName || '');
        setReaction(prefs?.reaction || '');
      } catch (error) {
        console.error('Error loading customization preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, [conversationId, currentUser]);

  const handleSaveCustomName = async () => {
    try {
      await userPreferencesService.upsertPreferences(conversationId, {
        customName: customName.trim() || null
      });
      setIsEditingName(false);
      toast.success(t('conversationDetails.customNameSaved'));
      onPreferencesUpdated?.();
    } catch (error) {
      console.error('Error saving custom name:', error);
      toast.error(t('conversationDetails.customNameError'));
    }
  };

  const handleSaveReaction = async () => {
    try {
      await userPreferencesService.upsertPreferences(conversationId, {
        reaction: reaction.trim() || null
      });
      setIsEditingReaction(false);
      toast.success(t('conversationDetails.reactionSaved'));
      onPreferencesUpdated?.();
    } catch (error) {
      console.error('Error saving reaction:', error);
      toast.error(t('conversationDetails.reactionError'));
    }
  };

  if (isLoading) {
    return <div className="text-xs text-muted-foreground italic">{t('common.loading') || 'Loading...'}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Custom Name */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <Type className="h-3.5 w-3.5" />
            {t('conversationDetails.customName')}
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  {t('conversationDetails.customNameTooltip')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveCustomName();
                } else if (e.key === 'Escape') {
                  setIsEditingName(false);
                }
              }}
              placeholder={t('conversationDetails.customNamePlaceholder')}
              className="h-8 flex-1"
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleSaveCustomName}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setIsEditingName(false)}
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setIsEditingName(true)}
          >
            <Type className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1">
              {customName || <span className="text-muted-foreground italic">{t('conversationDetails.noCustomName')}</span>}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Reaction Emoji */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <Smile className="h-3.5 w-3.5" />
            {t('conversationDetails.reaction')}
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  {t('conversationDetails.reactionTooltip')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {isEditingReaction ? (
          <div className="flex items-center gap-2">
            <Input
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveReaction();
                } else if (e.key === 'Escape') {
                  setIsEditingReaction(false);
                }
              }}
              placeholder={t('conversationDetails.reactionPlaceholder')}
              className="h-8 flex-1 text-2xl"
              maxLength={2}
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleSaveReaction}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setIsEditingReaction(false)}
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setIsEditingReaction(true)}
          >
            <Smile className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl flex-1">
              {reaction || <span className="text-sm text-muted-foreground italic">{t('conversationDetails.noReaction')}</span>}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
