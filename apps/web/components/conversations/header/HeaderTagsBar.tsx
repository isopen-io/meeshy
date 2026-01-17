'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getTagColor } from '@/utils/tag-colors';

interface HeaderTagsBarProps {
  categoryName?: string;
  tags: string[];
  isLoading: boolean;
}

export const HeaderTagsBar = memo(function HeaderTagsBar({
  categoryName,
  tags,
  isLoading
}: HeaderTagsBarProps) {
  if (isLoading || (!categoryName && tags.length === 0)) {
    return null;
  }

  return (
    <div className="px-4 pt-3 pb-2 border-b border-border/50">
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {categoryName && (
          <Badge
            variant="secondary"
            className="h-6 px-3 text-xs font-medium flex-shrink-0 shadow-sm"
          >
            {categoryName}
          </Badge>
        )}
        {tags.map((tag, index) => {
          const colors = getTagColor(tag);
          return (
            <Badge
              key={index}
              variant="outline"
              className={cn(
                "h-6 px-3 text-xs font-medium border flex-shrink-0 shadow-sm",
                colors.bg,
                colors.text,
                colors.border
              )}
            >
              {tag}
            </Badge>
          );
        })}
      </div>
    </div>
  );
});
