/**
 * Les médias du composer story, jugés sur la forme ÉMISE — depuis F5b, un
 * document `CanvasV3` : le porteur visuel est un objet `media` de plan
 * `content`, l'audio un objet `audio` du même plan. Les règles gardées ici
 * sont inchangées (un seul média par catégorie, durées en SECONDES, tout id
 * référencé claimé par `mediaIds`) — seule leur forme a changé.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CanvasV3Schema, type CanvasV3, type ObjectV3 } from '@meeshy/shared/types/canvas-v3';
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
let mockAttachmentUploadOptions: { uploadContext?: string; maxAttachments?: number } | undefined;
let mockUploadProgress: Record<number, number> = {};
let mockIsUploading = false;

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: (options: { uploadContext?: string; maxAttachments?: number }) => {
    mockAttachmentUploadOptions = options;
    return {
      selectedFiles: mockSelectedFiles,
      uploadedAttachments: mockUploadedAttachments,
      uploadProgress: mockUploadProgress,
      isUploading: mockIsUploading,
      handleFilesSelected: jest.fn(),
      handleRemoveFile: jest.fn(),
      clearAttachments: jest.fn(),
    };
  },
}));

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

function canvas(effects: Record<string, unknown>): CanvasV3 {
  return CanvasV3Schema.parse(effects);
}

function objectsOf(effects: Record<string, unknown>): ObjectV3[] {
  return canvas(effects).scenes?.[0]?.objects ?? [];
}

function carriers(effects: Record<string, unknown>): ObjectV3[] {
  return objectsOf(effects).filter((o) => o.kind === 'media' && o.plane === 'content');
}

function audios(effects: Record<string, unknown>): ObjectV3[] {
  return objectsOf(effects).filter((o) => o.kind === 'audio');
}

describe('StoryComposer media storyEffects (P0 iOS parity)', () => {
  beforeEach(() => {
    mockSelectedFiles = [new File(['x'], 'placeholder.jpg', { type: 'image/jpeg' })];
    mockUploadedAttachments = [];
    mockUploadProgress = {};
    mockIsUploading = false;
  });

  it('adds a background carrier object for the first uploaded image', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img', mimeType: 'image/jpeg' })];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    expect(payload.mediaIds).toEqual(['media-img']);
    const media = carriers(payload.storyEffects);
    expect(media).toHaveLength(1);
    expect(media[0].payload).toMatchObject({
      postMediaId: 'media-img',
      mediaType: 'image',
      isBackground: true,
    });
    expect(media[0].anchor).toEqual({ t: 'free', x: 0.5, y: 0.5 });
    expect(typeof media[0].id).toBe('string');
    expect(media[0].id.length).toBeGreaterThan(0);
    expect('duration' in media[0].payload).toBe(false);
  });

  it('marks the media as video and copies duration in seconds when known', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-vid', mimeType: 'video/mp4', duration: 14000 }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const media = carriers(published().storyEffects);
    expect(media[0].payload.mediaType).toBe('video');
    expect(media[0].payload.duration).toBe(14);
  });

  it('populates an audio object for the first uploaded audio', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg', duration: 9000 }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    expect(carriers(payload.storyEffects)).toHaveLength(0);
    const audio = audios(payload.storyEffects);
    expect(audio).toHaveLength(1);
    expect(audio[0].plane).toBe('content');
    expect(audio[0].anchor).toEqual({ t: 'free', x: 0.5, y: 0.85 });
    expect(audio[0].payload).toMatchObject({
      postMediaId: 'media-audio',
      isBackground: true,
      duration: 9,
    });
  });

  it('emits the placement, and neither the default volume nor the composition waveform', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg' })];
    const { published } = renderComposer();
    clickPublish();

    const audio = audios(published().storyEffects);
    expect(audio[0].payload.placement).toBe('overlay');
    expect('volume' in audio[0].payload).toBe(false);
    expect('waveformSamples' in audio[0].payload).toBe(false);
  });

  it('omits duration entirely when unknown, never as undefined', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img2', mimeType: 'image/png' })];
    const { published } = renderComposer();
    clickPublish();

    expect(Object.keys(carriers(published().storyEffects)[0].payload)).not.toContain('duration');
  });

  it('keeps the background object next to the media carrier', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img3' })];
    const { published } = renderComposer();
    clickPublish();

    const objects = objectsOf(published().storyEffects);
    const background = objects.find((o) => o.plane === 'bg');
    expect(background?.kind).toBe('media');
    expect(typeof background?.payload.background).toBe('string');
    expect(carriers(published().storyEffects)).toHaveLength(1);
  });

  it('emits neither carrier nor audio object when no media was uploaded', () => {
    mockUploadedAttachments = [];
    const { published } = renderComposer();
    clickPublish();

    const effects = published().storyEffects;
    expect(carriers(effects)).toHaveLength(0);
    expect(audios(effects)).toHaveLength(0);
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
    const media = carriers(payload.storyEffects);
    const audio = audios(payload.storyEffects);
    expect(media).toHaveLength(1);
    expect(media[0].payload.postMediaId).toBe('media-img');
    expect(audio).toHaveLength(1);
    expect(audio[0].payload.postMediaId).toBe('media-audio');
  });

  it('every canvas postMediaId is strictly one of the top-level mediaIds', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-vid', mimeType: 'video/mp4' }),
      createAttachment({ id: 'media-audio', mimeType: 'audio/wav' }),
    ];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    expect(payload.mediaIds).toContain(carriers(payload.storyEffects)[0].payload.postMediaId);
    expect(payload.mediaIds).toContain(audios(payload.storyEffects)[0].payload.postMediaId);
  });
});

describe("StoryComposer — contexte d'upload", () => {
  it("déclare le contexte 'story' — ses médias voyagent en PostMedia via TUS, jamais en MessageAttachment", () => {
    renderComposer();
    expect(mockAttachmentUploadOptions?.uploadContext).toBe('story');
  });
});

describe('StoryComposer — la jauge de téléversement', () => {
  beforeEach(() => {
    mockUploadedAttachments = [];
    mockUploadProgress = {};
    mockIsUploading = false;
  });

  it('affiche la jauge PROPRE À CHAQUE vignette pendant le téléversement', () => {
    // Cette surface ne lisait PAS `uploadProgress` du tout : ses médias — les
    // plus lourds du produit, vidéo et audio — montaient sans aucun signal.
    mockSelectedFiles = [
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'b.mp4', { type: 'video/mp4' }),
    ];
    mockUploadProgress = { 0: 100, 1: 15 };
    mockIsUploading = true;

    renderComposer();

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it("n'affiche aucune jauge hors téléversement", () => {
    mockSelectedFiles = [new File(['x'], 'a.jpg', { type: 'image/jpeg' })];
    mockUploadProgress = { 0: 100 };
    mockIsUploading = false;

    renderComposer();

    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });
});
