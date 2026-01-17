'use client';

import { memo } from 'react';
import {
  Info,
  MoreVertical,
  Image,
  Pin,
  Bell,
  BellOff,
  Archive,
  ArchiveRestore,
  Share2,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { HeaderPreferences } from './types';

interface HeaderActionsProps {
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isLoadingPreferences: boolean;
  onOpenDetails: () => void;
  onOpenGallery?: () => void;
  onOpenSettings: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onShareConversation: () => void;
  t: (key: string) => string;
}

export const HeaderActions = memo(function HeaderActions({
  isPinned,
  isMuted,
  isArchived,
  isLoadingPreferences,
  onOpenDetails,
  onOpenGallery,
  onOpenSettings,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onShareConversation,
  t
}: HeaderActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 sm:h-9 sm:w-9 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={t('conversationHeader.menuActions') || 'Menu des actions'}
        >
          <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          <span className="sr-only">{t('conversationHeader.menuActions') || 'Menu des actions'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onOpenDetails}>
          <Info className="h-4 w-4 mr-2" aria-hidden="true" />
          {t('conversationDetails.title')}
        </DropdownMenuItem>

        {onOpenGallery && (
          <DropdownMenuItem onClick={onOpenGallery}>
            <Image className="h-4 w-4 mr-2" aria-hidden="true" />
            {t('conversationHeader.viewImages') || 'Voir les images'}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={onOpenSettings}>
          <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
          {t('conversationHeader.settings') || 'Paramètres'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onTogglePin} disabled={isLoadingPreferences}>
          <Pin className={cn("h-4 w-4 mr-2", isPinned && "fill-current")} aria-hidden="true" />
          {t(isPinned ? 'conversationHeader.unpin' : 'conversationHeader.pin')}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleMute} disabled={isLoadingPreferences}>
          {isMuted ? (
            <Bell className="h-4 w-4 mr-2" aria-hidden="true" />
          ) : (
            <BellOff className="h-4 w-4 mr-2" aria-hidden="true" />
          )}
          {t(isMuted ? 'conversationHeader.unmute' : 'conversationHeader.mute')}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleArchive} disabled={isLoadingPreferences}>
          {isArchived ? (
            <ArchiveRestore className="h-4 w-4 mr-2" aria-hidden="true" />
          ) : (
            <Archive className="h-4 w-4 mr-2" aria-hidden="true" />
          )}
          {t(isArchived ? 'conversationHeader.unarchive' : 'conversationHeader.archive')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onShareConversation}>
          <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
          {t('conversationHeader.share') || 'Partager'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
