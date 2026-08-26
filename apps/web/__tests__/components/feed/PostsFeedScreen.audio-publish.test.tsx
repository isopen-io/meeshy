/**
 * PostsFeedScreen — audio publish wiring (Task W7, incrément I2).
 *
 * Avant W7 : le bouton rond ouvrait `AudioPostComposer`, un dialogue avec sa
 * PROPRE stratégie de téléversement (`TusUploadService` en deux temps) et son
 * propre relais (`handleAudioPublish`), distinct de `handlePublish`. Cette
 * suite pinnait ce relais — audience, `originalLanguage` recopié depuis la
 * locale du reconnaisseur, `optimisticMedia` avec sa durée brute en ms.
 *
 * Après W7 : le micro est un OUTIL de la surface document du meuble
 * (`AudioCapture`, monté dans `ComposerDocumentSurface`) ; le fichier produit
 * entre dans le MÊME pool que photo/vidéo et publie par le MÊME `onPublish`
 * que n'importe quel autre média — `handleAudioPublish` n'existe plus.
 * `PostsFeedScreen`, désormais, ne fait QUE deux choses de spécifique au
 * micro : (1) le bouton rond ARME l'outil (un jeton, relayé à
 * `MeeshyComposer.armCaptureToken` — la moitié « ça ouvre vraiment le
 * panneau » est prouvée, sans mock de `MeeshyComposer`, par
 * `composer-document-arm-capture.test.tsx`) ; (2) la charge qu'un `onPublish`
 * capté transporte ne référence plus jamais `mobileTranscription` ni
 * `originalLanguage` — Whisper (gateway) produit désormais la transcription
 * serveur dès que la première clé est absente (`PostService.createPost`).
 *
 * La garde de source (« `PostsFeedScreen.tsx` n'importe plus
 * `TusUploadService`/`MobileTranscription` ») vit dans
 * `composer-doors-creation.test.tsx` — pas de doublon ici.
 *
 * Même patron de harnais que les autres suites `PostsFeedScreen.*` : chaque
 * dépendance est mockée ; `MeeshyComposer` est un espion qui capture ses
 * props pour la porte `feedComposer`, ce qui permet d'invoquer `onPublish`
 * directement avec la forme exacte que la surface produit une fois le
 * fichier téléversé dans le pool partagé.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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
  PostCard: () => null,
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
}));

type CapturedProps = {
  door: { kind: string };
  onPublish: (payload: Record<string, unknown>) => void;
  armCaptureToken?: number;
};

let capturedCalls: CapturedProps[] = [];
jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: (props: CapturedProps) => {
    capturedCalls.push(props);
    return <div data-testid={`meeshy-composer-${props.door.kind}`} />;
  },
}));

function latestFeedComposerCall(): CapturedProps {
  const matches = capturedCalls.filter((c) => c.door.kind === 'feedComposer');
  return matches[matches.length - 1];
}

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

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

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

beforeEach(() => {
  jest.clearAllMocks();
  capturedCalls = [];
});

describe("PostsFeedScreen — le bouton rond arme l'outil micro (Task W7)", () => {
  it("n'ouvre plus de dialogue audio séparé : il pose un armCaptureToken défini", () => {
    render(<PostsFeedScreen />);
    expect(latestFeedComposerCall().armCaptureToken).toBeUndefined();

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    expect(latestFeedComposerCall().armCaptureToken).not.toBeUndefined();
  });

  it('un second tap change la valeur du jeton (JETON, pas un booléen) — refermer puis re-taper doit pouvoir ré-armer', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByLabelText('Record an audio post'));
    const first = latestFeedComposerCall().armCaptureToken;

    fireEvent.click(screen.getByLabelText('Record an audio post'));
    const second = latestFeedComposerCall().armCaptureToken;

    expect(second).not.toBe(first);
  });
});

describe('PostsFeedScreen — la charge audio relaie par le MÊME onPublish que tout autre média', () => {
  it('relaie la visibilité, `visibilityUserIds`, `mediaIds` et `optimisticMedia` (avec sa durée BRUTE en ms)', () => {
    render(<PostsFeedScreen />);

    latestFeedComposerCall().onPublish({
      content: 'A caption',
      type: 'POST',
      visibility: 'ONLY',
      visibilityUserIds: ['friend-1', 'friend-2'],
      mediaIds: ['media-1'],
      optimisticMedia: [
        { id: 'media-1', mimeType: 'audio/webm', fileUrl: 'https://cdn.test/media-1.webm', duration: 75_000, order: 0 },
      ],
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: 'ONLY',
        visibilityUserIds: ['friend-1', 'friend-2'],
        mediaIds: ['media-1'],
        optimisticMedia: [expect.objectContaining({ id: 'media-1', mimeType: 'audio/webm', duration: 75_000 })],
      }),
      expect.anything(),
    );
  });

  // Retourné en garde négative (Task W7, §2 du plan) — ce test pinnait
  // auparavant `originalLanguage: 'en'` recopié depuis la locale DÉCLARÉE du
  // reconnaisseur vocal, jamais une langue mesurée dans ce qui a été dit.
  // La clé n'existe plus dans `ComposerDocumentPayload` (voir
  // `components/composer/payload.ts`, § Aucune langue d'origine n'y figure) :
  // Whisper (gateway) détecte désormais la langue depuis le texte dès que la
  // clé est absente — poser une valeur devinée aurait SUPPRIMÉ cette
  // détection serveur (règle F7d).
  it('ne transporte plus JAMAIS `originalLanguage` ni `mobileTranscription`, même si le payload les portait', () => {
    render(<PostsFeedScreen />);

    latestFeedComposerCall().onPublish({
      content: '',
      type: 'POST',
      visibility: 'PUBLIC',
      mediaIds: ['media-1'],
      optimisticMedia: [{ id: 'media-1', mimeType: 'audio/webm', fileUrl: 'https://cdn.test/media-1.webm', order: 0 }],
      // Un appelant malveillant ou un défaut de type ne réintroduirait pas la
      // clé en silence : la garde porte sur ce que `handlePublish` RELAIE,
      // pas sur ce qu'il reçoit.
      originalLanguage: 'en',
      mobileTranscription: { text: 'Hello', language: 'en' },
    });

    const call = mockCreatePostMutate.mock.calls[0][0];
    expect(call).not.toHaveProperty('originalLanguage');
    expect(call).not.toHaveProperty('mobileTranscription');
  });
});
