'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Edit, Save, X } from 'lucide-react';
import type { Conversation, User } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/use-i18n';

interface DetailsHeaderProps {
  conversation: Conversation;
  currentUser: User;
  canModifyImage: boolean;
  displayName: string;
  avatarUrl: string | undefined;
  isEditingName: boolean;
  conversationName: string;
  isLoading: boolean;
  onEditNameChange: (value: string) => void;
  onSaveName: () => void;
  onCancelNameEdit: () => void;
  onStartNameEdit: () => void;
  onOpenImageUpload: () => void;
}

/**
 * Header section of the conversation details sidebar
 * Displays avatar, name, and edit controls
 */
export function DetailsHeader({
  conversation,
  currentUser,
  canModifyImage,
  displayName,
  avatarUrl,
  isEditingName,
  conversationName,
  isLoading,
  onEditNameChange,
  onSaveName,
  onCancelNameEdit,
  onStartNameEdit,
  onOpenImageUpload,
}: DetailsHeaderProps) {
  const { t } = useI18n('conversations');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSaveName();
    } else if (e.key === 'Escape') {
      onCancelNameEdit();
    }
  };

  return (
    <div className="text-center space-y-3">
      {/* Avatar with optional edit */}
      {canModifyImage ? (
        <div className="relative group mx-auto w-fit">
          <Avatar
            className="h-16 w-16 ring-2 ring-primary/20 cursor-pointer group-hover:ring-primary/50 transition-all"
            onClick={onOpenImageUpload}
          >
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div
            className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
            onClick={onOpenImageUpload}
          >
            <Camera className="h-6 w-6 text-white" />
          </div>
          <p className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {t('conversationDetails.clickToChangeImage') || 'Click to change image'}
          </p>
        </div>
      ) : (
        <Avatar className="h-16 w-16 mx-auto ring-2 ring-primary/20">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Name editing */}
      <div>
        {isEditingName ? (
          <div className="flex items-center gap-2 justify-center">
            <Input
              value={conversationName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="h-8 text-sm"
              placeholder={t('conversationDetails.conversationName')}
              autoFocus
              onKeyDown={handleKeyDown}
              onBlur={onSaveName}
            />
            <Button
              size="sm"
              onClick={onSaveName}
              disabled={isLoading}
              className="h-8 px-2"
            >
              <Save className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelNameEdit}
              className="h-8 px-2"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-center">
            <h3
              className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
              onClick={onStartNameEdit}
              title={t('conversationDetails.clickToEdit')}
            >
              {displayName}
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={onStartNameEdit}
              className="h-6 w-6 p-0"
              title={t('conversationDetails.editName')}
            >
              <Edit className="h-3 w-3" />
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground text-center">
          {conversation.type !== 'direct'
            ? t('conversationDetails.conversationGroup')
            : t('conversationDetails.conversationPrivate')}
        </p>
      </div>
    </div>
  );
}
