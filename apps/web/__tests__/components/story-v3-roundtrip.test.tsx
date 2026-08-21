/**
 * F5b (correction de revue) — l'ALLER-RETOUR : ce que le composer ÉMET doit
 * rester LISIBLE par le propre chemin de lecture du web.
 *
 * Émission (`StoryComposer`) → funnel (`postToStoryData`, entonnoir UNIQUE
 * vers `StoryViewer`) → lecture (`StoryViewer` + `CanvasV3Scene`). Chaque cas
 * ci-dessous garde une garantie que la forme v1 offrait déjà : le fond choisi
 * s'affiche, le porteur remplit le cadre, la pièce jointe audio a son lecteur,
 * une vidéo de 14 s occupe ses 14 s, et l'annonce de fond (B3.3-6) atteint le
 * badge. Un blob v3 qui ne traverse pas le funnel est un blob perdu.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Post } from '@meeshy/shared/types/post';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-story-roundtrip');

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ authToken: 'token-1', user: { id: 'user-1', username: 'alice', avatar: null } }),
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

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentsInfiniteQuery: () => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
  useCommentsList: () => [],
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/social/use-stories', () => ({
  useReactToStoryMutation: () => ({ mutate: jest.fn() }),
}));

let mockUploadedAttachments: UploadedAttachmentResponse[] = [];
let mockSelectedFiles: File[] = [];

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: mockSelectedFiles,
    uploadedAttachments: mockUploadedAttachments,
    isUploading: false,
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

import { StoryComposer, StoryComposerProps } from '@/components/v2/StoryComposer';
import { StoryViewer } from '@/components/v2/StoryViewer';
import { postToStoryData } from '@/lib/story-transforms';

type PublishPayload = Parameters<StoryComposerProps['onPublish']>[0];

function createAttachment(overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse {
  return {
    id: 'media-1',
    messageId: 'msg-1',
    fileName: 'file.jpg',
    originalName: 'file.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1000,
    fileUrl: 'https://cdn.example.com/file.jpg',
    uploadedBy: 'user-1',
    isAnonymous: false,
    createdAt: '2026-08-10T00:00:00Z',
    ...overrides,
  };
}

function createStoryPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'Bonjour',
    originalLanguage: 'fr',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    // Dates RELATIVES : une story vit 24 h, et ce montage figeait
    // `expiresAt: '2026-08-21T10:00:00Z'`. Passé cette heure, la story
    // devenait expirée pour de vrai — la vue ne rendait plus rien et les cinq
    // témoins de rendu tombaient ensemble, sans qu'une ligne de code ait
    // changé. La CI l'a prouvé : verte à 09:13 UTC, rouge à 10:11.
    // Aucun test de ce fichier n'assert l'expiration ; ils décrivent tous le
    // rendu d'une story VIVANTE. La rendre vivante par construction supprime
    // la bombe sans toucher à une seule assertion.
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
    ...overrides,
  };
}

function publishFromComposer(
  act: () => void,
  attachments: UploadedAttachmentResponse[] = [],
): PublishPayload {
  mockUploadedAttachments = attachments;
  mockSelectedFiles = [new File(['x'], 'placeholder.jpg', { type: 'image/jpeg' })];
  let published: PublishPayload | null = null;
  const view = render(
    <StoryComposer open onClose={jest.fn()} onPublish={(story) => { published = story; }} />,
  );
  act();
  fireEvent.click(screen.getByText('publish'));
  view.unmount();
  if (!published) throw new Error('onPublish was not called');
  return published;
}

function typeContent(text: string): void {
  fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), { target: { value: text } });
}

function renderStory(post: Post): HTMLElement {
  const { container } = render(
    <StoryViewer
      stories={[postToStoryData(post)]}
      initialIndex={0}
      onClose={jest.fn()}
      onReply={jest.fn()}
    />,
  );
  return container;
}

describe('Story v3 round trip — composer → postToStoryData → StoryViewer', () => {
  beforeEach(() => {
    mockUploadedAttachments = [];
    mockSelectedFiles = [];
  });

  it('keeps the emitted document intact through the funnel - the v === 3 guard is the judge', () => {
    const payload = publishFromComposer(() => typeContent('Bonjour'));
    const story = postToStoryData(createStoryPost({ storyEffects: payload.storyEffects }));

    expect(story.storyEffects?.v).toBe(3);
    expect(story.storyEffects?.scenes?.[0]?.objects.length).toBeGreaterThan(0);
  });

  it('paints the background colour the author picked, never the default gradient', () => {
    const payload = publishFromComposer(() => typeContent('Bonjour'));
    const container = renderStory(createStoryPost({ storyEffects: payload.storyEffects }));

    expect(screen.getByTestId('canvas-v3-scene')).toBeInTheDocument();
    const background = container.querySelector<HTMLElement>('[data-kind="media"]');
    expect(background?.style.background).toContain('rgb(196, 112, 75)');
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
  });

  it('keeps the gradient background a gradient once read back', () => {
    const payload = publishFromComposer(() => {
      typeContent('Bonjour');
      fireEvent.click(screen.getByLabelText('Gradient'));
    });
    const container = renderStory(createStoryPost({ storyEffects: payload.storyEffects }));

    const background = container.querySelector<HTMLElement>('[data-kind="media"]');
    expect(background?.style.background).toContain('linear-gradient');
  });

  it('mounts a player for the attached audio, exactly as the legacy family did', () => {
    const payload = publishFromComposer(
      () => typeContent('Bonjour'),
      [createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg', fileUrl: 'https://cdn.example.com/voice.m4a' })],
    );
    const container = renderStory(createStoryPost({
      storyEffects: payload.storyEffects,
      media: [{ id: 'media-audio', mimeType: 'audio/mpeg', fileUrl: 'https://cdn.example.com/voice.m4a', order: 0 }],
    }));

    const audio = container.querySelector<HTMLAudioElement>('audio');
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('https://cdn.example.com/voice.m4a');
  });

  it('keeps the uploaded photo full-bleed - the carrier IS the background', () => {
    const payload = publishFromComposer(
      () => typeContent('Bonjour'),
      [createAttachment({ id: 'media-img', mimeType: 'image/jpeg', fileUrl: 'https://cdn.example.com/photo.jpg' })],
    );
    renderStory(createStoryPost({
      storyEffects: payload.storyEffects,
      media: [{ id: 'media-img', mimeType: 'image/jpeg', fileUrl: 'https://cdn.example.com/photo.jpg', order: 0 }],
    }));

    const scene = screen.getByTestId('canvas-v3-scene');
    const photo = scene.querySelector<HTMLImageElement>('img[src="https://cdn.example.com/photo.jpg"]');
    expect(photo).not.toBeNull();
    expect(photo?.className).toContain('object-cover');
  });

  it('keeps a 14 s video story on screen for its full 14 s', () => {
    const payload = publishFromComposer(
      () => typeContent('Bonjour'),
      [createAttachment({ id: 'media-vid', mimeType: 'video/mp4', duration: 14000, fileUrl: 'https://cdn.example.com/clip.mp4' })],
    );
    const story = postToStoryData(createStoryPost({ storyEffects: payload.storyEffects }));

    expect(story.storyEffects?.slideDurationMs).toBe(14000);
  });

  it('carries the background sound announcement to the badge (B3.3-6)', () => {
    const container = renderStory(createStoryPost({
      storyEffects: {
        v: 3,
        sound: { source: { t: 'original' }, volume: 1 },
        scenes: [{
          id: 's1',
          objects: [{
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { text: 'Bonjour' },
          }],
        }],
      },
    }));

    expect(container.querySelector('[data-testid="background-sound-badge"]')).not.toBeNull();
  });
});
