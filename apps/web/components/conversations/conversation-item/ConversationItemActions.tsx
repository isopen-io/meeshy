'use client';

import { memo, useCallback } from 'react';
import { Info, Pin, Bell, BellOff, Archive, Share2, Smile, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Conversation } from '@meeshy/shared/types';

interface ConversationItemActionsProps {
  conversation: Conversation;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  reaction?: string;
  isMobile: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onToggleMute: (e: React.MouseEvent) => void;
  onToggleArchive: (e: React.MouseEvent) => void;
  onSetReaction: (e: React.MouseEvent, emoji: string) => void;
  onShowDetails: (e: React.MouseEvent) => void;
  onShareConversation: (e: React.MouseEvent) => void;
  t: (key: string) => string;
}

const REACTION_EMOJIS = ['❤️', '👍', '😊', '🎉', '🔥', '⭐'] as const;

export const ConversationItemActions = memo(function ConversationItemActions({
  isPinned,
  isMuted,
  isArchived,
  reaction,
  isMobile,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onSetReaction,
  onShowDetails,
  onShareConversation,
  t
}: ConversationItemActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 flex-shrink-0 transition-opacity",
            // Sur mobile: toujours visible, sur desktop: visible au hover
            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onShowDetails}>
          <Info className="mr-2 h-4 w-4" />
          <span>Détails</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onTogglePin}>
          <Pin className="mr-2 h-4 w-4" />
          <span>{isPinned ? 'Désépingler' : 'Épingler'}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleMute}>
          {isMuted ? (
            <Bell className="mr-2 h-4 w-4" />
          ) : (
            <BellOff className="mr-2 h-4 w-4" />
          )}
          <span>{isMuted ? 'Activer notifications' : 'Désactiver notifications'}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleArchive}>
          <Archive className="mr-2 h-4 w-4" />
          <span>{isArchived ? 'Désarchiver' : 'Archiver'}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onShareConversation}>
          <Share2 className="mr-2 h-4 w-4" />
          <span>{t('conversationHeader.share')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Smile className="mr-2 h-4 w-4" />
            <span>Réactions</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-auto p-2">
            {/* Grid 3 colonnes x 2 rangées pour les 6 emojis */}
            <div className="grid grid-cols-3 gap-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => onSetReaction(e, emoji)}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-md hover:bg-accent transition-colors relative",
                    reaction === emoji && "bg-accent ring-2 ring-primary"
                  )}
                >
                  <span className="text-xl">{emoji}</span>
                  {reaction === emoji && (
                    <span className="absolute top-0.5 right-0.5 text-[10px] text-primary font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
