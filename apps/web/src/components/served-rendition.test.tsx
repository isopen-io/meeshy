import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ImageVariant, MediaRendition } from '@meeshy/shared/types/attachment';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { MediaGrid } from './media-grid';
import { VideoTile } from './video-tile';

/**
 * W12 (#11318) — LE RENDU SERVI, lu dans le DOM : une image porte sa
 * `<source type="image/avif">` avant le WebP de son `<img>`, dont le `src`
 * reste l'original HD ; une vidéo HEVC que le navigateur ne décode pas (la
 * sonde de happy-dom rend `''`, comme Chrome sans décodeur HEVC) joue son rendu
 * H.264 de compatibilité.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(node: Parameters<Root['render']>[0]): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

const variant = (width: number, url: string, format: ImageVariant['format']): ImageVariant => ({ width, height: width, url, size: 100, format });

const photo = (id: string, overrides: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id,
  messageId: 'm-photo',
  fileName: `${id}.jpg`,
  originalName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 4_000_000,
  fileUrl: `2026/10/u/${id}.jpg`,
  width: 4032,
  height: 3024,
  uploadedBy: 'u-amina',
  createdAt: new Date().toISOString(),
  imageVariants: [variant(640, `2026/10/u/${id}_640w.webp`, 'webp')],
  avifVariants: [variant(640, `2026/10/u/${id}_640w.avif`, 'avif')],
  ...overrides,
});

const grid = (items: readonly Attachment[]): HTMLDivElement =>
  render(<MediaGrid items={items} frame="box" languages={['fr']} fallbackLanguage="fr" onOpen={() => {}} />);

describe('W12 — une image se sert en AVIF puis en WebP, l’original HD en src', () => {
  test('pièce SEULE : <picture> avec la source AVIF, puis l’<img> WebP dont le src est l’original', () => {
    const el = grid([photo('p1')]);
    const img = el.querySelector('img[data-attachment-image="p1"]')!;
    const picture = img.parentElement!;
    expect(picture.tagName).toBe('PICTURE');
    const source = picture.querySelector('source')!;
    expect(source.getAttribute('type')).toBe('image/avif');
    expect(source.getAttribute('srcset')).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fp1_640w.avif 640w');
    expect(source.getAttribute('sizes')).toBe(img.getAttribute('sizes'));
    expect(img.getAttribute('srcset')).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fp1_640w.webp 640w');
    expect(img.getAttribute('src')).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fp1.jpg');
  });

  test('cases de GRILLE : chaque case porte sa source AVIF, au sizes de sa case', () => {
    const el = grid([photo('g1'), photo('g2')]);
    for (const id of ['g1', 'g2']) {
      const img = el.querySelector(`img[data-attachment-image="${id}"]`)!;
      const source = img.parentElement!.querySelector('source[type="image/avif"]')!;
      expect(source.getAttribute('srcset')).toContain(`${id}_640w.avif 640w`);
      expect(source.getAttribute('sizes')).toBe(img.getAttribute('sizes'));
    }
  });

  test('sans AVIF (pièce d’avant S7) : aucune <picture>, l’<img> d’avant intacte', () => {
    const el = grid([photo('old', { avifVariants: undefined })]);
    const img = el.querySelector('img[data-attachment-image="old"]')!;
    expect(el.querySelector('picture')).toBeNull();
    expect(img.getAttribute('srcset')).toContain('old_640w.webp 640w');
  });
});

const h264: MediaRendition = { codec: 'h264', mimeType: 'video/mp4', url: '2026/10/u/clip_h264.mp4', width: 1920, height: 1080, size: 3_000_000 };

const clip = (overrides: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id: 'v-hevc',
  messageId: 'm-video',
  fileName: 'clip.mov',
  originalName: 'clip.mov',
  mimeType: 'video/quicktime',
  fileSize: 12_000_000,
  fileUrl: '2026/10/u/clip.mov',
  duration: 7_000,
  uploadedBy: 'u-amina',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('W12 — une vidéo HEVC se joue en H.264 là où le HEVC ne se décode pas', () => {
  test('la tuile vidéo joue le rendu H.264', () => {
    const el = render(<VideoTile attachment={clip({ renditions: [h264] })} solo onExpand={() => {}} />);
    expect(el.querySelector('video')!.getAttribute('src')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fclip_h264.mp4',
    );
  });

  test('sans rendu, l’original reste joué', () => {
    const el = render(<VideoTile attachment={clip()} solo onExpand={() => {}} />);
    expect(el.querySelector('video')!.getAttribute('src')).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fclip.mov');
  });
});
