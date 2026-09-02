/**
 * F5b — le composer web ÉMET du v3 (condition d'armement d'O15).
 *
 * L'écran de composition ne gagne AUCUNE fonctionnalité ici : seule la FORME
 * de `storyEffects` change. Le fond couleur devient l'objet `media` de plan
 * `bg`, le média porteur un objet `media`, l'audio un objet `audio` de plan
 * `content`, et le stylage racine (`textStyle` + contenu) un objet `text`
 * selon la règle G3 (synthétisé SEULEMENT en l'absence d'objet texte).
 * Le juge n'est pas une forme réécrite ici : c'est `CanvasV3Schema`, le
 * schéma partagé et gelé du lot A.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CanvasV3Schema, type CanvasV3, type ObjectV3 } from '@meeshy/shared/types/canvas-v3';
import { StoryComposer, StoryComposerProps } from '@/components/v2/StoryComposer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-story-v3');

const FIXTURES = join(__dirname, '../../../../packages/shared/fixtures/canvas-v3');

function fixture(name: string): CanvasV3 {
  return CanvasV3Schema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')));
}

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

type PublishPayload = Parameters<StoryComposerProps['onPublish']>[0];

function renderComposer(): { published: () => PublishPayload } {
  let published: PublishPayload | null = null;
  render(<StoryComposer open onClose={jest.fn()} onPublish={(story) => { published = story; }} />);
  return {
    published: () => {
      if (!published) throw new Error('onPublish was not called');
      return published;
    },
  };
}

function typeContent(text: string): void {
  fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), { target: { value: text } });
}

function clickPublish(): void {
  fireEvent.click(screen.getByText('publish'));
}

function parseEmitted(effects: Record<string, unknown>): CanvasV3 {
  const parsed = CanvasV3Schema.safeParse(effects);
  if (!parsed.success) {
    throw new Error(`emitted storyEffects is not a valid CanvasV3: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

function objectsOf(doc: CanvasV3): ObjectV3[] {
  return doc.scenes?.[0]?.objects ?? [];
}

describe('StoryComposer emits CanvasV3 (F5b)', () => {
  beforeEach(() => {
    mockSelectedFiles = [new File(['x'], 'placeholder.jpg', { type: 'image/jpeg' })];
    mockUploadedAttachments = [];
  });

  it('emits a v3 document and no legacy v1 family - the shared schema is the judge', () => {
    const { published } = renderComposer();
    typeContent('Bonjour');
    clickPublish();

    const effects = published().storyEffects;
    expect(effects.v).toBe(3);
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
    expect(effects.backgroundColor).toBeUndefined();
    expect(effects.textStyle).toBeUndefined();
    expect(effects.mediaObjects).toBeUndefined();
    expect(effects.audioPlayerObjects).toBeUndefined();
  });

  it('turns the colour background into a bg-plane media object carrying the colour', () => {
    const { published } = renderComposer();
    typeContent('Bonjour');
    clickPublish();

    const background = objectsOf(parseEmitted(published().storyEffects))
      .find((o) => o.plane === 'bg');
    expect(background).toBeDefined();
    expect(background?.kind).toBe('media');
    expect(background?.payload.background).toBe('#C4704B');
    // Constat 23 — forme jumelle du convertisseur gateway (`baseObject({ id: 'bg' }, …)`)
    // et d'iOS (`ObjectV3(id: "bg", …)`) : l'objet de fond porte l'id littéral.
    expect(background?.id).toBe('bg');
  });

  it('normalises the gradient background to the canonical gradient:from,to form', () => {
    const { published } = renderComposer();
    typeContent('Bonjour');
    fireEvent.click(screen.getByLabelText('Gradient'));
    clickPublish();

    const background = objectsOf(parseEmitted(published().storyEffects))
      .find((o) => o.plane === 'bg');
    expect(background?.payload.background).toBe('gradient:#C4704B,#1A6B5A');
  });

  it('synthesises the root text as a fg text object carrying the picked style (G3)', () => {
    const { published } = renderComposer();
    typeContent('Bonjour');
    fireEvent.click(screen.getByText('Ne'));
    clickPublish();

    const doc = parseEmitted(published().storyEffects);
    const text = objectsOf(doc).find((o) => o.kind === 'text');
    expect(text).toBeDefined();
    expect(text?.plane).toBe('fg');
    expect(text?.anchor).toEqual({ t: 'free', x: 0.5, y: 0.5 });
    // « Ne » est un PRESET : la police « neon » ET la lueur que ce composer
    // montre à l'auteur — écrite sur l'axe EFFET (#4870), pour que ce qu'il a
    // vu soit ce qui part, sur iOS aussi.
    expect(text?.payload).toMatchObject({ text: 'Bonjour', textStyle: 'neon', textEffect: 'glow' });

    const reference = objectsOf(fixture('minimal-text'))[0];
    const referenceKeys = Object.keys(reference).filter((k) => k !== 'locale').sort();
    expect(Object.keys(text ?? {}).sort()).toEqual(referenceKeys);
  });

  it('never guesses a locale on the root text object - DoD rejection of F7d (constat 4 BLOQUANT) : a client-guessed `locale` becomes `sourceLanguage` server-side and is PREFERRED over text detection, and short-circuits the reader Prisme (`CanvasV3Scene.tsx` `sameLanguage(language, o.locale)`) - a wrong guess mistranslates AND mis-ranks. The web composer has no explicit language picker (unlike iOS), so it can never emit an HONEST `locale` here - closing the Prisme rule 3 gap is done at READ time instead (`postToStoryData`, `withOriginLocale`, `lib/story-transforms.ts`), backfilling from the server-DETECTED `post.originalLanguage`, never guessed client-side', () => {
    const { published } = renderComposer();
    typeContent('Hello there');
    clickPublish();

    const doc = parseEmitted(published().storyEffects);
    const text = objectsOf(doc).find((o) => o.kind === 'text');
    expect(text).not.toHaveProperty('locale');
  });

  it('never synthesises an empty text object when the story carries no text', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-img', mimeType: 'image/jpeg' })];
    const { published } = renderComposer();
    clickPublish();

    expect(objectsOf(parseEmitted(published().storyEffects)).some((o) => o.kind === 'text')).toBe(false);
  });

  it('turns the uploaded visual media into a media object of the content plane', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-vid', mimeType: 'video/mp4', duration: 14000 })];
    const { published } = renderComposer();
    clickPublish();

    const payload = published();
    const media = objectsOf(parseEmitted(payload.storyEffects))
      .find((o) => o.kind === 'media' && o.plane === 'content');
    expect(media).toBeDefined();
    expect(media?.anchor).toEqual({ t: 'free', x: 0.5, y: 0.5 });
    expect(media?.payload).toMatchObject({
      postMediaId: 'media-vid',
      mediaType: 'video',
      isBackground: true,
      duration: 14,
    });
    expect(payload.mediaIds).toContain(media?.payload.postMediaId);
  });

  it('turns the uploaded audio into an audio object of the content plane', () => {
    mockUploadedAttachments = [createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg', duration: 9000 })];
    const { published } = renderComposer();
    clickPublish();

    const audio = objectsOf(parseEmitted(published().storyEffects)).find((o) => o.kind === 'audio');
    expect(audio).toBeDefined();
    expect(audio?.plane).toBe('content');
    expect(audio?.anchor).toEqual({ t: 'free', x: 0.5, y: 0.85 });
    expect(audio?.payload).toMatchObject({
      postMediaId: 'media-audio',
      placement: 'overlay',
      isBackground: true,
      duration: 9,
    });
    expect(audio?.payload.waveformSamples).toBeUndefined();
  });

  it('gives every object its own id and an insertion-ranked z, background first', () => {
    mockUploadedAttachments = [
      createAttachment({ id: 'media-audio', mimeType: 'audio/mpeg' }),
      createAttachment({ id: 'media-img', mimeType: 'image/jpeg' }),
    ];
    const { published } = renderComposer();
    typeContent('Bonjour');
    clickPublish();

    const objects = objectsOf(parseEmitted(published().storyEffects));
    expect(objects.map((o) => o.kind)).toEqual(['media', 'text', 'media', 'audio']);
    expect(objects.map((o) => o.z)).toEqual([0, 1, 2, 3]);
    expect(new Set(objects.map((o) => o.id)).size).toBe(objects.length);
    expect(objects.every((o) => o.transform.scale === 1 && o.transform.opacity === 1)).toBe(true);
  });
});
