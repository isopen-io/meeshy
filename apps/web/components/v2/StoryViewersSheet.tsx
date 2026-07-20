'use client';

import { useI18n } from '@/hooks/use-i18n';
import { Avatar } from './Avatar';
import { Skeleton } from './Skeleton';
import { useStoryViewersQuery } from '@/hooks/social/use-story-viewers';
import type { PostView } from '@meeshy/shared/types/post';

// ============================================================================
// StoryViewersSheet — author-only list of users who viewed a story.
//
// Slides up over the immersive StoryViewer. Backed by GET /posts/:id/views via
// useStoryViewersQuery; the caller gates visibility (only the author opens it).
// ============================================================================

export interface StoryViewersSheetProps {
  storyId: string;
  open: boolean;
  onClose: () => void;
}

function relativeTime(value: string | Date, t: (k: string, p?: Record<string, unknown> | string) => string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return t('time.now', 'just now');
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function viewerName(view: PostView): string {
  return view.user?.displayName ?? view.user?.username ?? 'Unknown';
}

export function StoryViewersSheet({ storyId, open, onClose }: StoryViewersSheetProps) {
  const { t } = useI18n('story');
  const { data, isLoading } = useStoryViewersQuery(storyId, { enabled: open });

  if (!open) return null;

  const viewers = data?.viewers ?? [];
  const total = data?.total ?? viewers.length;

  return (
    <div
      className="bg-black/80 backdrop-blur-md rounded-2xl border border-white/10 p-3 max-h-72 overflow-y-auto pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-sm font-semibold">
          {t('viewers.title', 'Viewers')}
          {total > 0 ? ` · ${total}` : ''}
        </span>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white text-xs"
          aria-label={t('viewers.close', 'Close viewers')}
        >
          ✕
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
          ))}
        </div>
      ) : viewers.length === 0 ? (
        <p className="text-white/50 text-sm py-4 text-center">
          {t('viewers.empty', 'No views yet')}
        </p>
      ) : (
        <ul className="space-y-1">
          {viewers.map((view) => (
            <li key={view.id} className="flex items-center gap-3 py-1.5">
              <Avatar src={view.user?.avatar ?? null} name={viewerName(view)} size="sm" />
              <span className="flex-1 min-w-0 truncate text-sm text-white">{viewerName(view)}</span>
              <span className="text-xs text-white/40 shrink-0">{relativeTime(view.createdAt, t)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
