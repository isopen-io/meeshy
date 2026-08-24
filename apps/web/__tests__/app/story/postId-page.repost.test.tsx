/**
 * Tests for the story deep-link page's minimal repost wiring (Task 4, point 4).
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'story-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const mockStoryPost: Record<string, unknown> = {
  id: 'story-1',
  authorId: 'author-2',
  type: 'STORY',
  visibility: 'PUBLIC',
  content: 'A story',
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

jest.mock('@/hooks/queries/use-post-query', () => ({
  usePostQuery: () => ({ isLoading: false, isError: false, data: mockStoryPost }),
}));

jest.mock('@/hooks/social/use-stories', () => ({
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useRepostMutation: () => ({ mutate: mockRepostMutate, isPending: false }),
}));

jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-comment-target', () => ({
  useCommentTarget: () => ({ targetCommentId: null, targetParentCommentId: null }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/lib/story-transforms', () => ({
  postToStoryData: (post: typeof mockStoryPost) => ({
    id: post.id,
    authorId: post.authorId,
    author: { name: 'Bob' },
    content: post.content,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
    viewCount: post.viewCount,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'viewer-1' } }),
}));

type StoryViewerStubProps = {
  onRepost?: (storyId: string) => void;
  onRepostAsPost?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  StoryViewer: ({ onRepost, onRepostAsPost, stories }: StoryViewerStubProps) => (
    <div>
      {onRepost && (
        <button data-testid="story-repost" onClick={() => onRepost(stories[0]?.id ?? '')}>
          Repost
        </button>
      )}
      {onRepostAsPost && (
        <button data-testid="story-repost-as-post" onClick={() => onRepostAsPost(stories[0]?.id ?? '')}>
          Keep on my feed
        </button>
      )}
    </div>
  ),
}));

jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: jest.fn() },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportStory: jest.fn() },
}));

import StoryPage from '@/app/story/[postId]/page';

describe('StoryPage — minimal repost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoryPost.visibility = 'PUBLIC';
    delete mockStoryPost.repostOfId;
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  /**
   * Moitié RÉFÉRENCE — et la borne de sa portée. Le repli vers la racine est
   * une loi des surfaces de CARTE (`repostTargetId`, jumeau iOS
   * `RepostTargeting`) ; le viewer de story vise la SCÈNE VUE, comme
   * `StoryViewerView.repostAsPostDirect` qui envoie `story.id`.
   *
   * Deux raisons, chacune suffisante : `repostPost` recopie une source
   * éphémère dans son repost (donc pas de carte vide à éviter), et il refuse
   * un original dont l'échéance est passée — une story repartagée survit à sa
   * racine, donc grimper casserait un geste qui réussit aujourd'hui.
   */
  it("vise la SCÈNE VUE, jamais la racine, même quand la story est un repost", async () => {
    mockStoryPost.repostOfId = 'story-root';
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-repost'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false, targetType: 'STORY' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  /**
   * Reformulé le 2026-08-23 (loi du miroir). Le test gravait le défaut : il
   * assérait `{ isQuote: false }` SANS `targetType`, donc le gateway retombait
   * sur son défaut `?? POST` et republier une story fabriquait un post
   * PERMANENT. Le geste disait « repartager », le résultat disait « ancrer ».
   *
   * Ce qu'il protégeait reste : un seul geste, aucune modale, `isQuote: false`.
   */
  it('reposte une story EN STORY — un seul geste, sans modale (loi du miroir)', async () => {
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-repost'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false, targetType: 'STORY' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  /**
   * L'ANCRAGE — « garder ça pour de bon ». Le miroir laisse l'éphémère
   * éphémère (20 h) ; changer de format est le geste explicite qui rend
   * permanent. Sans cette option, le miroir serait une régression sèche :
   * l'utilisateur perdrait à 20 h ce qu'il obtenait définitivement avant.
   */
  it('offre l\'ancrage : reposter la story EN POST, permanent', async () => {
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-repost-as-post'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false, targetType: 'POST' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  it('retire AUSSI l\'ancrage quand la story n\'est pas PUBLIC — la garde d\'audience vaut pour les deux', () => {
    mockStoryPost.visibility = 'FRIENDS';
    render(<StoryPage />);

    expect(screen.queryByTestId('story-repost-as-post')).not.toBeInTheDocument();
  });

  it('withholds onRepost when the story is not PUBLIC (gateway 403s non-PUBLIC originals)', () => {
    mockStoryPost.visibility = 'FRIENDS';
    render(<StoryPage />);

    expect(screen.queryByTestId('story-repost')).not.toBeInTheDocument();
  });

  it('shows a failure toast if the repost 403s despite the gate', async () => {
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onError?.());
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-repost'));
    });

    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith("Couldn't repost", 'error'));
  });
});
