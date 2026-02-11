'use client';

import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Skeleton } from './Skeleton';

interface StoryItem {
  id: string;
  author: { name: string; avatar?: string };
  thumbnailUrl?: string;
  hasUnviewed: boolean;
  isOwn: boolean;
}

interface StoryTrayProps {
  stories: StoryItem[];
  onStoryPress: (storyId: string) => void;
  onAddStory: () => void;
  isLoading?: boolean;
  className?: string;
}

function StoryTray({
  stories,
  onStoryPress,
  onAddStory,
  isLoading = false,
  className,
}: StoryTrayProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-start gap-4 px-4 py-3 overflow-x-auto',
          '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
          className
        )}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
            <Skeleton variant="circular" className="w-16 h-16" />
            <Skeleton variant="text" className="w-12 h-3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-4 px-4 py-3 overflow-x-auto transition-colors duration-300',
        '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
        className
      )}
    >
      {/* Add story button */}
      <button
        onClick={onAddStory}
        className="flex flex-col items-center gap-1.5 shrink-0 group"
      >
        <div
          className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center',
            'border-2 border-dashed border-[var(--gp-border)]',
            'bg-[var(--gp-parchment)] transition-colors duration-300',
            'group-hover:border-[var(--gp-terracotta)]',
            'relative'
          )}
        >
          <svg
            className="w-6 h-6 text-[var(--gp-text-muted)] transition-colors duration-300 group-hover:text-[var(--gp-terracotta)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {/* Subtle pulse ring */}
          <div
            className={cn(
              'absolute inset-0 rounded-full border-2 border-[var(--gp-terracotta)] opacity-0',
              'group-hover:animate-[story-pulse_2s_ease-in-out_infinite]'
            )}
          />
        </div>
        <span className="text-xs text-[var(--gp-text-muted)] transition-colors duration-300">
          Add
        </span>
      </button>

      {/* Story items */}
      {stories.map((story) => (
        <button
          key={story.id}
          onClick={() => onStoryPress(story.id)}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          {/* Gradient ring container */}
          <div
            className={cn(
              'w-[68px] h-[68px] rounded-full p-[3px] transition-all duration-300',
              story.hasUnviewed
                ? 'bg-gradient-to-br from-[var(--gp-terracotta)] to-[var(--gp-jade-green)]'
                : 'bg-[var(--gp-border)]'
            )}
          >
            {/* White gap ring */}
            <div className="w-full h-full rounded-full bg-[var(--gp-surface)] p-[2px] transition-colors duration-300">
              <Avatar
                src={story.thumbnailUrl || story.author.avatar}
                name={story.author.name}
                size="lg"
                className="w-full h-full [&>img]:w-full [&>img]:h-full [&>div]:w-full [&>div]:h-full"
              />
            </div>
          </div>
          <span className="text-xs text-[var(--gp-text-secondary)] truncate max-w-[64px] transition-colors duration-300">
            {story.isOwn ? 'You' : story.author.name.slice(0, 8)}
          </span>
        </button>
      ))}

      {/* Keyframe for pulse animation */}
      <style jsx>{`
        @keyframes story-pulse {
          0%, 100% {
            opacity: 0;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}

StoryTray.displayName = 'StoryTray';

export { StoryTray };
export type { StoryItem, StoryTrayProps };
