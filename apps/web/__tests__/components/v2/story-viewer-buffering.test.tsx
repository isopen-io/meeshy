/**
 * W2 — unified-timeline gate (iOS R1/R2 pattern ported to web): the
 * auto-advance timer must FREEZE while the primary background video buffers
 * (waiting/stalled) and resume from the REMAINING time (playing/canplay),
 * with a 5s watchdog so a dead stream can never freeze the story forever.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/TranslationToggle', () => ({
  TranslationToggle: () => null,
}));

jest.mock('@/components/v2/CommentList', () => ({
  CommentList: () => null,
}));

const mockUseCommentsInfiniteQuery = jest.fn(() => ({
  isLoading: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
}));
jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentsInfiniteQuery: (...args: unknown[]) => mockUseCommentsInfiniteQuery(...args),
  useCommentsList: () => [],
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

import { StoryViewer } from '@/components/v2/StoryViewer';
import type { StoryData } from '@/components/v2/StoryViewer';

function makeVideoStory(id: string): StoryData {
  return {
    id,
    author: { name: 'Alice', avatar: undefined },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    viewCount: 0,
    mediaUrl: 'https://cdn.test/clip.mp4',
    mediaType: 'video',
  };
}

describe('StoryViewer — buffering freezes the auto-advance timer (W2)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does not auto-advance while the primary video is buffering', () => {
    const onClose = jest.fn();
    render(
      <StoryViewer
        stories={[makeVideoStory('s-1'), makeVideoStory('s-2')]}
        initialIndex={0}
        onClose={onClose}
        onReply={jest.fn()}
      />,
    );

    const video = screen.getByTestId('story-primary-video');
    act(() => {
      fireEvent(video, new Event('waiting'));
    });

    // Full default duration elapses while frozen: still on story 1.
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    // The 5s watchdog has not fired yet at 4s, and the timer is frozen —
    // the comments query must still target the FIRST story.
    expect(mockUseCommentsInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ postId: 's-1' }),
    );
  });

  it('resumes from the remaining time when playback restarts', () => {
    render(
      <StoryViewer
        stories={[makeVideoStory('s-1'), makeVideoStory('s-2')]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    const video = screen.getByTestId('story-primary-video');

    // 2s of healthy playback, then a stall.
    act(() => {
      jest.advanceTimersByTime(2000);
      fireEvent(video, new Event('waiting'));
    });
    // 3s frozen (under the 5s watchdog).
    act(() => {
      jest.advanceTimersByTime(3000);
      fireEvent(video, new Event('playing'));
    });
    // Remaining is ~4s (6s default − 2s consumed): after 3.5s more we are
    // STILL on story 1…
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(mockUseCommentsInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ postId: 's-1' }),
    );
    // …and after the remaining ~0.5s (+ margin) the viewer advances to story 2.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockUseCommentsInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ postId: 's-2' }),
    );
  });

  it('watchdog: a stream that never recovers falls back to the wall clock', () => {
    render(
      <StoryViewer
        stories={[makeVideoStory('s-1'), makeVideoStory('s-2')]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    const video = screen.getByTestId('story-primary-video');
    act(() => {
      fireEvent(video, new Event('stalled'));
    });
    // Watchdog releases at 5s… (separate act: the resumed timer is armed by
    // a React effect that only flushes at the end of the act)
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // …then the full 6s duration runs on the wall clock — the story must
    // advance instead of freezing forever.
    act(() => {
      jest.advanceTimersByTime(6000 + 500);
    });
    expect(mockUseCommentsInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ postId: 's-2' }),
    );
  });
});
