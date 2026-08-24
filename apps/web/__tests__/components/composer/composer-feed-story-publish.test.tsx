/**
 * Task W7, correctif R1 — la porte `feedComposer` publie VRAIMENT une story.
 *
 * `composer-doors-creation.test.tsx` monte `MeeshyComposer` en ESPION : il
 * prouve que l'hôte PASSE `onPublishStory`, jamais que le geste de l'auteur
 * l'atteint. Un espion ne peut pas rendre le verdict qui compte ici — « la
 * pastille story de l'éventail mène-t-elle à `createStoryMutation` ? » —
 * puisque c'est la surface RÉELLE, montée par le meuble RÉEL, qui décide.
 *
 * Ce fichier est donc le seul du lot à monter l'écran du fil avec le meuble
 * NON MOCKÉ. Il ne re-teste ni le contrat de l'éventail
 * (`composer-format-fan.test.tsx`), ni les capacités de la surface story
 * (`meeshy-composer-story.test.tsx`) : il ne prouve QUE la continuité de la
 * chaîne, du clic sur la pastille jusqu'à la mutation.
 *
 * Le défaut qu'il attrape, mesuré avant correctif : `PostsFeedScreen` montait
 * `MeeshyComposer` sans `onPublishStory` alors que sa porte OFFRE `story`.
 * Le bouton Publier de la surface story était actif, le clic ne créait rien,
 * la surface se démontait et le brouillon partait avec elle — le no-op
 * silencieux que la doc de prop de `MeeshyComposer.tsx` nomme mot pour mot.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

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
  StatusBar: ({ onAddStatus }: { onAddStatus?: () => void }) => (
    <button data-testid="status-bar-add-status" onClick={onAddStatus}>
      add status
    </button>
  ),
  StoryViewer: () => null,
  StoryComposer: () => null,
}));

jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

const mockCreateStoryMutate = jest.fn();
jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: mockCreateStoryMutate }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));
jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: () => undefined }));
jest.mock('@/lib/story-transforms', () => ({
  postToStoryData: jest.fn(),
  groupStoriesByAuthor: () => new Map(),
  groupToStoryItem: jest.fn(),
}));
// `FRIENDS`, et non `PUBLIC` : `DEFAULT_PUBLICATION_VISIBILITY` VAUT `PUBLIC`
// (`packages/shared/types/post.ts`). Un témoin sur la valeur par défaut du
// contrat ne peut pas distinguer « la préférence est passée » de « rien n'est
// passé » — c'est la forme de la leçon 261 : un témoin de rang s'écrit sur un
// rang AUTRE que celui où la règle juste et son absence rendent le même verdict.
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'FRIENDS' } }),
}));

const mockCreateStatusMutate = jest.fn();
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: mockCreateStatusMutate }),
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
let mockCreatePostPending = false;
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: mockCreatePostMutate, isPending: mockCreatePostPending }),
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
  usePreferredLanguage: () => 'en',
  usePreferredLanguages: () => ['en'],
}));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; avatar: string | null } | null }) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
  // Consommé par l'outil micro (`AudioCapture`) que la surface document monte
  // dès qu'elle se déplie : absent, le meuble RÉEL planterait ici alors que la
  // suite « espion » ne le monte jamais.
  useUser: () => null,
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));


// ─── Mocks propres au MEUBLE RÉEL (absents de la suite « espion ») ───────
let mockUploadedAttachments: unknown[] = [];
jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: [],
    uploadedAttachments: mockUploadedAttachments,
    isUploading: false,
    uploadProgress: {},
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: { validateFiles: () => ({ valid: true, errors: [] }) },
}));

jest.mock('@/services/users.service', () => ({
  usersService: { searchUsers: jest.fn().mockResolvedValue([]) },
}));

jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock('use-debounce', () => ({ useDebounce: (value: unknown) => [value] }));

global.URL.createObjectURL = jest.fn(() => 'blob:feed-story');
global.URL.revokeObjectURL = jest.fn();


import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockUploadedAttachments = [];
});

function openFan(): void {
  fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
}

describe('W7 — la pastille STORY du composer inline du fil publie une story', () => {
  it("l'éventail du composer inline offre la pastille story", () => {
    render(<PostsFeedScreen />);
    openFan();

    expect(screen.getByTestId('composer-format-story')).toBeInTheDocument();
  });

  it('la choisir monte la surface story à la place de la surface document', () => {
    render(<PostsFeedScreen />);
    openFan();
    fireEvent.click(screen.getByTestId('composer-format-story'));

    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
  });

  it('taper puis Publier appelle `createStoryMutation` — jamais `createPostMutation`, jamais rien', () => {
    render(<PostsFeedScreen />);
    openFan();
    fireEvent.click(screen.getByTestId('composer-format-story'));
    fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), {
      target: { value: 'Bonjour depuis le fil' },
    });
    fireEvent.click(screen.getByText('publish'));

    expect(mockCreateStoryMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateStoryMutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ content: 'Bonjour depuis le fil' }),
    );
    expect(mockCreatePostMutate).not.toHaveBeenCalled();
  });

  it("la story née de cette porte ouvre sur la préférence de l'auteur, pas sur le PUBLIC par défaut du contrat", () => {
    render(<PostsFeedScreen />);
    openFan();
    fireEvent.click(screen.getByTestId('composer-format-story'));
    fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), {
      target: { value: 'Audience héritée' },
    });
    fireEvent.click(screen.getByText('publish'));

    expect(mockCreateStoryMutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ visibility: 'FRIENDS' }),
    );
  });
});
