/**
 * C7-UI — le texte alternatif et l'opt-in `allowSoundExtraction` collectés par
 * `MediaAccessibilityFields` (monté par `PostComposer`) doivent ATTEINDRE le
 * réseau.
 *
 * `MediaAltCollection.PostComposer.test.tsx` prouve que `PostComposer` les
 * porte dans son `onPublish` ; ce fichier prouve le maillon SUIVANT —
 * `PostsFeedScreen.handlePublish`, qui recopiait champ par champ et laissait
 * les deux au bord de la route. Sans lui, la saisie de l'auteur meurt entre le
 * composer et `createPostMutation`, sans aucune erreur visible.
 *
 * Même patron de harnais que
 * `__tests__/components/feed/PostsFeedScreen.handlePublish.test.tsx` :
 * `PostComposer` est remplacé par un stub qui capture `onPublish`, ce qui
 * permet d'appeler `handlePublish` avec exactement la forme que le vrai
 * composer produit.
 */
import { render } from '@testing-library/react';
import React from 'react';
import type { PostPublishPayload } from '@/components/v2/PostComposer';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

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
  PostCard: () => <div data-testid="post-card" />,
  StoryTray: () => <div data-testid="story-tray" />,
  StatusBar: () => <div data-testid="status-bar" />,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

const capturedOnPublish: { current: ((data: PostPublishPayload) => void) | null } = { current: null };
jest.mock('@/components/v2/PostComposer', () => ({
  PostComposer: ({ onPublish }: { onPublish: (data: PostPublishPayload) => void }) => {
    capturedOnPublish.current = onPublish;
    return <div data-testid="post-composer-stub" />;
  },
}));

jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/AudioPostComposer', () => ({ AudioPostComposer: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: jest.fn() }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));
jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: () => undefined }));
jest.mock('@/lib/story-transforms', () => ({
  postToStoryData: jest.fn(),
  groupStoriesByAuthor: () => new Map(),
  groupToStoryItem: jest.fn(),
}));
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));

jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/lib/status-transforms', () => ({ postToStatusItem: jest.fn() }));

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: undefined,
    dataUpdatedAt: 0,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
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
  usePostSocketCacheSync: () => undefined,
}));
jest.mock('@/hooks/use-post-translation', () => ({
  usePreferredLanguage: () => 'en', usePreferredLanguages: () => ['en'],
}));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; avatar: string | null } | null }) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

jest.mock('@/services/tusUploadService', () => ({
  TusUploadService: jest.fn(),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — media accessibility relay (C7-UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnPublish.current = null;
  });

  /**
   * Rougit si le spread `...(data.mediaAlt ? { mediaAlt: data.mediaAlt } : {})`
   * disparaît de `handlePublish` : le texte alternatif saisi par l'auteur
   * n'atteindrait jamais `createPostMutation`, donc jamais le gateway.
   */
  it('relays mediaAlt to createPostMutation', () => {
    render(<PostsFeedScreen />);
    expect(capturedOnPublish.current).not.toBeNull();

    capturedOnPublish.current!({
      content: '',
      type: 'POST',
      visibility: 'PUBLIC',
      mediaIds: ['att-1'],
      mediaAlt: { 'att-1': 'Sunset over the beach' },
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ mediaAlt: { 'att-1': 'Sunset over the beach' } }),
      expect.anything(),
    );
  });

  /**
   * Rougit si le relais devient inconditionnel (`mediaAlt: data.mediaAlt`) :
   * un `undefined` explicite et une clé absente sont deux signaux distincts
   * pour `CreatePostRequest.mediaAlt`, et un `{}` fabriqué en serait un
   * troisième.
   */
  it('omits mediaAlt when the author typed nothing', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: 'Text only',
      type: 'POST',
      visibility: 'PUBLIC',
    });

    expect(mockCreatePostMutate.mock.calls[0][0]).not.toHaveProperty('mediaAlt');
  });

  /**
   * Rougit si le spread `allowSoundExtraction` disparaît : l'opt-in de
   * l'auteur sur SON contenu resterait purement décoratif.
   */
  it('relays an explicit allowSoundExtraction opt-in', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: '',
      type: 'REEL',
      visibility: 'PUBLIC',
      mediaIds: ['att-1'],
      allowSoundExtraction: true,
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ allowSoundExtraction: true }),
      expect.anything(),
    );
  });

  /**
   * Rougit si le relais devient un défaut permissif (`?? true`) ou si le test
   * du `undefined` est remplacé par un test de véracité
   * (`data.allowSoundExtraction ? … : {}`) : un refus EXPLICITE de l'auteur
   * (`false`) doit voyager, exactement comme son accord.
   */
  it('relays an explicit allowSoundExtraction refusal (false is a choice, not an absence)', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: '',
      type: 'REEL',
      visibility: 'PUBLIC',
      mediaIds: ['att-1'],
      allowSoundExtraction: false,
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ allowSoundExtraction: false }),
      expect.anything(),
    );
  });

  /**
   * Rougit si un `false` est fabriqué quand l'auteur n'a jamais touché
   * l'interrupteur — il écraserait un choix serveur que personne n'a révoqué.
   */
  it('omits allowSoundExtraction when the toggle was never touched', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: 'Text only',
      type: 'POST',
      visibility: 'PUBLIC',
    });

    expect(mockCreatePostMutate.mock.calls[0][0]).not.toHaveProperty('allowSoundExtraction');
  });
});
