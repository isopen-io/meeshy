/**
 * Composant carte de groupe optimisé avec React.memo
 * Suit les Vercel React Best Practices: rerender-memo
 */

import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Lock, Copy, CheckCircle2, Users, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Group } from '@meeshy/shared/types';

interface GroupCardProps {
  group: Group;
  isSelected: boolean;
  onSelect: (group: Group) => void;
  onCopyIdentifier: (identifier: string, e: React.MouseEvent) => void;
  copiedIdentifier: string | null;
}

export const GroupCard = memo(function GroupCard({
  group,
  isSelected,
  onSelect,
  onCopyIdentifier,
  copiedIdentifier
}: GroupCardProps) {
  const displayIdentifier = group.identifier?.replace(/^mshy_/, '') || '';

  return (
    <div
      onClick={() => onSelect(group)}
      className={cn(
        "flex items-start p-4 rounded-2xl cursor-pointer transition-colors border-2",
        isSelected
          ? "bg-primary/20 dark:bg-primary/30 border-primary/40 dark:border-primary/50 shadow-md"
          : "hover:bg-accent/50 dark:hover:bg-accent/70 border-transparent hover:border-border/30 dark:hover:border-border/40"
      )}
    >
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12 ring-2 ring-primary/20">
          <AvatarImage src={group.avatar || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary font-bold">
            {group.name.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div
          className={cn(
            "absolute -bottom-0 -right-0 h-4 w-4 rounded-full border-2 border-background dark:border-background",
            group.isPrivate
              ? "bg-orange-500 dark:bg-orange-600"
              : "bg-green-500 dark:bg-green-600"
          )}
        />
      </div>

      <div className="ml-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-foreground truncate">{group.name}</h3>
          {group.isPrivate && <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </div>

        {group.description && (
          <p className="text-sm text-muted-foreground truncate mb-2">{group.description}</p>
        )}

        <div className="flex items-center gap-1 mb-2 group/identifier">
          <span
            className="text-xs text-primary font-mono cursor-pointer hover:text-primary/80 transition-colors"
            onClick={(e) => onCopyIdentifier(group.identifier || '', e)}
          >
            {displayIdentifier}
          </span>
          {copiedIdentifier === group.identifier ? (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover/identifier:opacity-100 transition-opacity" />
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{group._count?.members || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{group._count?.conversations || 0}</span>
          </div>
          {group.createdAt && (
            <div className="flex items-center gap-1">
              <span>{new Date(group.createdAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
