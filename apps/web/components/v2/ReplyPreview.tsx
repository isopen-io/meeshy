'use client';

import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/use-i18n';
import { getLanguageColor } from './theme';

export type ContentType = 'text' | 'image' | 'audio' | 'video';

export interface ReplyPreviewProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content' | 'onClick'> {
  /** Name of the original message author */
  authorName: string;
  /** Content of the original message (text or will be replaced by media label) */
  content: string;
  /** Type of content being replied to */
  contentType: ContentType;
  /** Language code for accent color (e.g., 'fr', 'en', 'zh') */
  languageCode?: string;
  /** Click handler for the reply preview */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

const CONTENT_TYPE_META: Record<
  Exclude<ContentType, 'text'>,
  { emoji: string; key: string; fallback: string }
> = {
  image: { emoji: '📷', key: 'v2chat.photo', fallback: 'Photo' },
  audio: { emoji: '🎤', key: 'v2chat.audio', fallback: 'Audio' },
  video: { emoji: '🎬', key: 'v2chat.video', fallback: 'Video' },
};

const ReplyPreview = forwardRef<HTMLDivElement, ReplyPreviewProps>(
  (
    {
      authorName,
      content,
      contentType,
      languageCode = 'default',
      onClick,
      className,
      ...props
    },
    ref
  ) => {
    const { t } = useI18n('conversations');
    const accentColor = getLanguageColor(languageCode);
    const mediaMeta = contentType === 'text' ? null : CONTENT_TYPE_META[contentType];
    const displayContent = mediaMeta
      ? `${mediaMeta.emoji} ${t(mediaMeta.key, mediaMeta.fallback)}`
      : content;

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          'flex items-stretch gap-2 px-3 py-2 rounded-lg transition-colors duration-300',
          'bg-[var(--gp-parchment)]/60 backdrop-blur-sm',
          'max-w-full overflow-hidden',
          onClick && 'cursor-pointer hover:bg-[var(--gp-parchment)]/80',
          className
        )}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        } : undefined}
        {...props}
      >
        {/* Colored accent bar */}
        <div
          className="w-[3px] rounded-full shrink-0 self-stretch transition-colors duration-300"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />

        {/* Content area */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          {/* Author name */}
          <span
            className="text-xs font-semibold truncate transition-colors duration-300"
            style={{ color: accentColor }}
          >
            {authorName}
          </span>

          {/* Message preview - truncated to 2 lines */}
          <p
            className={cn(
              'text-xs leading-snug transition-colors duration-300',
              'text-[var(--gp-text-secondary)]',
              'line-clamp-2',
              contentType !== 'text' && 'italic'
            )}
          >
            {displayContent}
          </p>
        </div>
      </div>
    );
  }
);

ReplyPreview.displayName = 'ReplyPreview';

export { ReplyPreview };
