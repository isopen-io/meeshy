import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StoryComposer, StoryComposerProps } from '@/components/v2/StoryComposer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-story-media');

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { authToken: string | null }) => unknown) =>
    selector({ authToken: 'token-1' }),
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

type PublishPayload = Parameters<StoryComposerProps['onPublish']>[0];

type MediaObjectPayload = {
  id: string;
  postMediaId: string;
  mediaType: 'image' | 'video';
  x: number;
  y: number;
  isBackground: boolean;
  duration?: number;
};

type AudioObjectPayload = {
  id: string;
  postMediaId: string;
  x: number;
  y: number;
  isBackground: boolean;
  duration?: number;
};

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

function renderComposer(): { published: () => PublishPayload } {
  let published: PublishPayload | null = null;
  render(
    <StoryComposer
      open
      onClose={jest.fn()}
      onPublish={(story) => {
        published = story;
      }}
    />
  );
  return {
    published: () => {
      if (!published) throw new Error('onPublish was not called');
      return published;
    },
  };
}

function clickPublish(): void {
  fireEvent.click(screen.getByText('publish'));
}

describe('StoryComposer media storyEffects (P0 iOS parity)', () => {
  beforeEach(() => {
    mockSelectedFiles = [new File(['x'], 'placeholder.jpg', { type: 'image/jpeg' })];
    mockUploadedAttachments = [];
  });

  it('adds a background mediaObject for the first uploaded image', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img', mimeType: 'image/jpeg' })];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    expect(payload.mediaIds).toEqual(['media-img']);
    const mediaObjects = payload.storyEffects.mediaObjects as MediaObjectPayload[];
    expect(mediaObjects).toHaveLength(1);
    expect(mediaObjects[0]).toMatchObject({
      postMediaId: 'media-img',
      mediaType: 'image',
      x: 0.5,
      y: 0.5,
      isBackground: true,
    });
    expect(typeof mediaObjects[0].id).toBe('string');
    expect(mediaObjects[0].id.length).toBeGreaterThan(0);
    expect('duration' in mediaObjects[0]).toBe(false);
  });

  it('marks the media as video and copies duration in seconds when known', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-vid', mimeType: 'video/mp4', duration: 14000 }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const mediaObjects = published().storyEffects.mediaObjects as MediaObjectPayload[];
    expect(mediaObjects[0].mediaType).toBe('video');
    expect(mediaObjects[0].duration).toBe(14);
  });

  it('populates audioPlayerObjects for the first uploaded audio', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg', duration: 9000 }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    expect(payload.storyEffects.mediaObjects).toBeUndefined();
    const audioObjects = payload.storyEffects.audioPlayerObjects as AudioObjectPayload[];
    expect(audioObjects).toHaveLength(1);
    expect(audioObjects[0]).toMatchObject({
      postMediaId: 'media-audio',
      x: 0.5,
      y: 0.85,
      isBackground: true,
      duration: 9,
    });
  });

  it('omits duration entirely when unknown, never as undefined', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img2', mimeType: 'image/png' })];
    const { published } = renderComposer();
    clickPublish();

    const mediaObjects = published().storyEffects.mediaObjects as MediaObjectPayload[];
    expect(Object.keys(mediaObjects[0])).not.toContain('duration');
  });

  it('preserves existing storyEffects keys untouched', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img3' })];
    const { published } = renderComposer();
    clickPublish();

    const effects = published().storyEffects;
    expect(typeof effects.backgroundColor).toBe('string');
    expect(effects.textStyle).toBe('bold');
  });

  it('emits neither mediaObjects nor audioPlayerObjects when no media was uploaded', () => {
    mockUploadedAttachments = [];
    const { published } = renderComposer();
    clickPublish();

    const effects = published().storyEffects;
    expect(effects.mediaObjects).toBeUndefined();
    expect(effects.audioPlayerObjects).toBeUndefined();
  });

  it('picks only the first media per category and keeps every id in mediaIds', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg' }),
      createAttachment({ id: 'media-img', mimeType: 'image/jpeg' }),
      createAttachment({ id: 'media-img-2', mimeType: 'image/png' }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    expect(payload.mediaIds).toEqual(['media-audio', 'media-img', 'media-img-2']);
    const mediaObjects = payload.storyEffects.mediaObjects as MediaObjectPayload[];
    const audioObjects = payload.storyEffects.audioPlayerObjects as AudioObjectPayload[];
    expect(mediaObjects).toHaveLength(1);
    expect(mediaObjects[0].postMediaId).toBe('media-img');
    expect(audioObjects).toHaveLength(1);
    expect(audioObjects[0].postMediaId).toBe('media-audio');
  });

  it('every mediaObjects/audioPlayerObjects postMediaId is strictly one of the top-level mediaIds', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-vid', mimeType: 'video/mp4' }),
      createAttachment({ id: 'media-audio', mimeType: 'audio/wav' }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    const mediaObjects = payload.storyEffects.mediaObjects as MediaObjectPayload[];
    const audioObjects = payload.storyEffects.audioPlayerObjects as AudioObjectPayload[];
    expect(payload.mediaIds).toContain(mediaObjects[0].postMediaId);
    expect(payload.mediaIds).toContain(audioObjects[0].postMediaId);
  });
});
