'use client';

import { memo } from 'react';
import { Settings, Pin, Bell, BellOff, Archive, Share2, Smile, MoreVertical } from 'lucide-react';
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

interface ConversationActionMenuItemsProps {
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  reaction?: string;
  onTogglePin: (e: React.MouseEvent) => void;
  onToggleMute: (e: React.MouseEvent) => void;
  onToggleArchive: (e: React.MouseEvent) => void;
  onSetReaction: (e: React.MouseEvent, emoji: string) => void;
  onShowDetails: (e: React.MouseEvent) => void;
  onShareConversation: (e: React.MouseEvent) => void;
  t: (key: string) => string;
}

interface ConversationItemActionsProps extends ConversationActionMenuItemsProps {
  conversation: Conversation;
  isMobile: boolean;
}

const REACTION_EMOJIS = ['❤️', '👍', '😊', '🎉', '🔥', '⭐'] as const;

/**
 * Les SIX entrées d'action du rang — réglages, épingle, sourdine, archive,
 * partage, réactions — SANS leur menu ni leur déclencheur.
 *
 * Extraites du dropdown ci-dessous par REV-4/B3 : sous drapeau Lentille, le
 * rang historique n'est plus rendu, donc ces entrées devenaient
 * inatteignables (behaviour-matrix L07). La peau Lentille monte CETTE
 * section-ci dans son propre menu (`LentillePeek`), à côté du catalogue de
 * modes — le miroir exact de ce que le contrat décrit côté iOS, où c'est le
 * menu d'actions qui gagne le sous-menu « Mode de lecture ».
 *
 * Aucune copie n'existe : une divergence entre les deux chemins est
 * impossible par construction, et la garde
 * `__tests__/lentille/lentille-actions-not-duplicated.test.ts` le verrouille.
 * Le marquage rendu est INCHANGÉ (mêmes composants, même ordre, mêmes
 * séparateurs) — le chemin drapeau OFF reste bit-à-bit identique.
 */
export const ConversationActionMenuItems = memo(function ConversationActionMenuItems({
  isPinned,
  isMuted,
  isArchived,
  reaction,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onSetReaction,
  onShowDetails,
  onShareConversation,
  t
}: ConversationActionMenuItemsProps) {
  return (
    <>
      <DropdownMenuItem onClick={onShowDetails}>
        <Settings className="mr-2 h-4 w-4" />
        <span>{t('conversationHeader.settings')}</span>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={onTogglePin}>
        <Pin className="mr-2 h-4 w-4" />
        <span>{isPinned ? t('conversationHeader.unpin') : t('conversationHeader.pin')}</span>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={onToggleMute}>
        {isMuted ? (
          <Bell className="mr-2 h-4 w-4" />
        ) : (
          <BellOff className="mr-2 h-4 w-4" />
        )}
        <span>{isMuted ? t('conversationHeader.unmute') : t('conversationHeader.mute')}</span>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={onToggleArchive}>
        <Archive className="mr-2 h-4 w-4" />
        <span>{isArchived ? t('conversationHeader.unarchive') : t('conversationHeader.archive')}</span>
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
          <span>{t('conversationHeader.reactions')}</span>
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
    </>
  );
});

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
          aria-label={t('conversationHeader.menuActions')}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <ConversationActionMenuItems
          isPinned={isPinned}
          isMuted={isMuted}
          isArchived={isArchived}
          reaction={reaction}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onToggleArchive={onToggleArchive}
          onSetReaction={onSetReaction}
          onShowDetails={onShowDetails}
          onShareConversation={onShareConversation}
          t={t}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
