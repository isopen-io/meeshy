/**
 * Loi produit 2026-08-23 — l'auteur change l'audience à TOUT MOMENT.
 *
 * Le feed est le point d'entrée principal de l'édition : il doit (1) rouvrir
 * l'éditeur avec l'audience nommée que le post porte déjà — sinon un post en
 * ONLY repart avec une liste vide et perd ses destinataires — et (2) faire
 * suivre `visibilityUserIds` jusqu'à la mutation. Le cast local en
 * `'PUBLIC' | 'FRIENDS' | 'PRIVATE'` qui régnait ici rendait les trois autres
 * audiences intransmissibles.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: ({ onEdit }: { onEdit?: () => void }) => (
    <button data-testid="post-card-edit" onClick={onEdit}>Edit</button>
  ),
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

// W8 — le fil ouvre désormais la porte `edit` du meuble unifié, pas
// `PostEditor`. Le stub ne peint la surface édition QUE pour cette porte ;
// les autres portes que `PostsFeedScreen` monte aussi (`feedComposer`,
// `moodChip`, `repost`) restent hors de portée de cette suite.
type EditSourceStub = {
  postId: string;
  visibility: string;
  visibilityUserIds: readonly string[];
};
type MeeshyComposerEditStubProps = {
  door: { kind: string };
  editSource?: EditSourceStub;
  onSaveEdit?: (payload: { postId: string; data: Record<string, unknown> }) => void;
};
jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: ({ door, editSource, onSaveEdit }: MeeshyComposerEditStubProps) => {
    if (door.kind !== 'edit' || !editSource) return null;
    return (
      <div>
        <span data-testid="editor-initial-visibility">{editSource.visibility}</span>
        <span data-testid="editor-initial-audience">{editSource.visibilityUserIds.join(',')}</span>
        <button
          data-testid="editor-save"
          onClick={() =>
            onSaveEdit?.({
              postId: editSource.postId,
              data: { content: 'Texte réécrit', visibility: 'ONLY', visibilityUserIds: ['user-9'] },
            })
          }
        >
          Save
        </button>
      </div>
    );
  },
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

jest.mock('@/services/posts.service', () => ({
  postsService: { recordMediaDownloads: jest.fn() },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn(), reportStory: jest.fn() },
}));

jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: jest.fn() }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));
jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: jest.fn() }));
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));

const mockPost = {
  id: 'post-1',
  authorId: 'viewer-1',
  type: 'POST',
  visibility: 'EXCEPT',
  visibilityUserIds: ['user-3', 'user-4'],
  content: 'Texte original',
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useFeedPosts: () => [mockPost],
  usePrefetchPost: () => jest.fn(),
}));

const mockUpdate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: (...args: unknown[]) => mockUpdate(...args), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice', avatar: null } }),
}));
jest.mock('@/services/tusUploadService', () => ({ TusUploadService: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — changing a published post audience', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reopens the editor on the audience the post already carries', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('post-card-edit'));

    expect(screen.getByTestId('editor-initial-visibility')).toHaveTextContent('EXCEPT');
    expect(screen.getByTestId('editor-initial-audience')).toHaveTextContent('user-3,user-4');
  });

  it('forwards the new visibility AND its named audience to the update mutation', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('post-card-edit'));
    fireEvent.click(screen.getByTestId('editor-save'));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'post-1',
        data: expect.objectContaining({
          content: 'Texte réécrit',
          visibility: 'ONLY',
          visibilityUserIds: ['user-9'],
        }),
      }),
      expect.anything(),
    );
  });
});
