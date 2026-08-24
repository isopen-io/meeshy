/**
 * Tests for PostsFeedScreen's audio publish wiring (Task 3, point 4).
 * `handleAudioPublish` used to hardcode `visibility: 'PUBLIC'` regardless of
 * the composer's audience choice, and never forwarded `originalLanguage`
 * even when the transcription language was known. This exercises the full
 * mapping from AudioPostComposer's `onPublish` payload through to the
 * `createPost` mutation call.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

// ── Static / layout ─────────────────────────────────────────────────────────

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: mockAddToast }),
  PostCard: () => null,
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/PostComposer', () => ({ PostComposer: () => null }));
jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

// ── AudioPostComposer stub — exposes a single "Publish" trigger ────────────

type AudioPublishPayload = {
  audioFile: File;
  transcription: { text: string; language: string } | null;
  content?: string;
  visibility: string;
  visibilityUserIds?: string[];
};

jest.mock('@/components/v2/AudioPostComposer', () => ({
  AudioPostComposer: ({ open, onPublish }: { open: boolean; onPublish: (data: AudioPublishPayload) => void }) => {
    if (!open) return null;
    return <button data-testid="audio-composer-publish" onClick={() => onPublish(
      (globalThis as unknown as { __audioPublishPayload: AudioPublishPayload }).__audioPublishPayload,
    )}>Publish audio</button>;
  },
}));

// ── Stories / statuses / feed hooks ─────────────────────────────────────────

jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: jest.fn() }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));

jest.mock('@/hooks/social/use-stories-realtime', () => ({
  useStoriesRealtime: jest.fn(),
}));

jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));

jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: undefined,
    isLoading: false,
    isSuccess: false,
    isError: false,
    isFetching: false,
    dataUpdatedAt: 0,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useFeedPosts: () => [],
  usePrefetchPost: () => jest.fn(),
}));

const mockCreatePostMutate = jest.fn();

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: mockCreatePostMutate, isPending: false }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useSharePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));

jest.mock('@/hooks/use-post-translation', () => ({
  usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'],
}));

jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

// ── Upload service ───────────────────────────────────────────────────────────

const mockUploadFiles = jest.fn();
jest.mock('@/services/tusUploadService', () => ({
  TusUploadService: jest.fn().mockImplementation(() => ({
    uploadFiles: mockUploadFiles,
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function setAudioPublishPayload(overrides: Partial<AudioPublishPayload> = {}) {
  const payload: AudioPublishPayload = {
    audioFile: new File(['blob'], 'voice.webm', { type: 'audio/webm' }),
    transcription: { text: 'Bonjour', language: 'en' },
    content: 'A caption',
    visibility: 'FRIENDS',
    visibilityUserIds: undefined,
    ...overrides,
  };
  (globalThis as unknown as { __audioPublishPayload: AudioPublishPayload }).__audioPublishPayload = payload;
  return payload;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PostsFeedScreen — audio publish audience wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadFiles.mockResolvedValue([{
      id: 'media-1',
      mimeType: 'audio/webm',
      fileUrl: 'https://cdn.test/media-1.webm',
      thumbnailUrl: undefined,
    }]);
  });

  it('forwards the composer visibility and visibilityUserIds instead of hardcoding PUBLIC', async () => {
    setAudioPublishPayload({ visibility: 'ONLY', visibilityUserIds: ['friend-1', 'friend-2'] });
    render(<PostsFeedScreen />);

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('audio-composer-publish'));
    });

    await waitFor(() => expect(mockCreatePostMutate).toHaveBeenCalled());
    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'ONLY', visibilityUserIds: ['friend-1', 'friend-2'] }),
      expect.anything(),
    );
  });

  it('forwards originalLanguage from the transcription when known', async () => {
    setAudioPublishPayload({ transcription: { text: 'Hello', language: 'en' } });
    render(<PostsFeedScreen />);

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('audio-composer-publish'));
    });

    await waitFor(() => expect(mockCreatePostMutate).toHaveBeenCalled());
    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ originalLanguage: 'en' }),
      expect.anything(),
    );
  });

  it('omits originalLanguage when the transcription is unknown', async () => {
    setAudioPublishPayload({ transcription: null });
    render(<PostsFeedScreen />);

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('audio-composer-publish'));
    });

    await waitFor(() => expect(mockCreatePostMutate).toHaveBeenCalled());
    const [payload] = mockCreatePostMutate.mock.calls[0];
    expect(payload.originalLanguage).toBeUndefined();
  });

  it('includes an optimistic media placeholder built from the upload result', async () => {
    setAudioPublishPayload();
    render(<PostsFeedScreen />);

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('audio-composer-publish'));
    });

    await waitFor(() => expect(mockCreatePostMutate).toHaveBeenCalled());
    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaIds: ['media-1'],
        optimisticMedia: [expect.objectContaining({ id: 'media-1', mimeType: 'audio/webm', fileUrl: 'https://cdn.test/media-1.webm' })],
      }),
      expect.anything(),
    );
  });

  it('carries the raw millisecond duration from the upload result into optimisticMedia', async () => {
    mockUploadFiles.mockResolvedValue([{
      id: 'media-1',
      mimeType: 'audio/webm',
      fileUrl: 'https://cdn.test/media-1.webm',
      thumbnailUrl: undefined,
      duration: 75000,
    }]);
    setAudioPublishPayload();
    render(<PostsFeedScreen />);

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('audio-composer-publish'));
    });

    await waitFor(() => expect(mockCreatePostMutate).toHaveBeenCalled());
    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        optimisticMedia: [expect.objectContaining({ id: 'media-1', duration: 75000 })],
      }),
      expect.anything(),
    );
  });
});
