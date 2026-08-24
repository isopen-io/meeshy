/**
 * S4-web — le sticker IMAGE, miroir web du contrat posé côté SDK par S1
 * (`StorySticker.kind: .emoji | .image`, dérivé de `postMediaId`).
 *
 * Avant ce lot, `StickerObject` ne lisait QUE `payload.emoji` et faisait
 * `if (!emoji) return null` (CanvasV3Scene.tsx:577-579) : un sticker image
 * — celui que S1 vient de faire exister sur le fil — disparaissait EN
 * SILENCE. Le contrat n'a pas changé le format d'URL des médias : un
 * sticker au payload `{ postMediaId }` doit être résolu exactement comme
 * `MediaObject` résout un `('kind': 'media')` — même `mediaById`, même id.
 *
 * L'oracle des cas emoji reste le comportement ACTUEL, inchangé : ce lot est
 * additif, jamais un remplacement du glyphe natif.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';

import { CanvasV3Scene, type CanvasV3MediaResolution } from '@/components/v2/CanvasV3Scene';
import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

const MEDIA_ID = '64b000000000000000000009';

function stickerObject(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'sticker-1',
    kind: 'sticker',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'fg',
    z: 4,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  };
}

function sceneOf(objects: unknown[]): CanvasV3 {
  return { v: 3, scenes: [{ id: 's1', objects }] } as unknown as CanvasV3;
}

describe('S4-web — StickerObject rend une image quand le payload en porte une', () => {
  it('renders the emoji as before when the payload carries only an emoji', () => {
    render(<CanvasV3Scene doc={sceneOf([stickerObject({ emoji: '🎉' })])} />);

    const el = screen.getByTestId('canvas-v3-object-sticker-1');
    expect(el).toHaveTextContent('🎉');
    expect(el.tagName).toBe('DIV');
  });

  it('renders an <img> resolved through the SAME mediaById map media objects use', () => {
    const mediaById = new Map<string, CanvasV3MediaResolution>([
      [MEDIA_ID, { url: '/m/party-sticker.webp', mimeType: 'image/webp' }],
    ]);
    render(
      <CanvasV3Scene
        doc={sceneOf([stickerObject({ emoji: '🎉', postMediaId: MEDIA_ID, provider: 'genmoji' })])}
        mediaById={mediaById}
      />,
    );

    const img = screen.getByTestId('canvas-v3-object-sticker-1');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('/m/party-sticker.webp');
  });

  it('renders nothing when the payload carries neither a resolvable image nor an emoji', () => {
    render(<CanvasV3Scene doc={sceneOf([stickerObject({ postMediaId: 'unknown-id' })])} />);

    expect(screen.queryByTestId('canvas-v3-object-sticker-1')).toBeNull();
  });

  it('non-regression: an image sticker WITHOUT an emoji still renders the image — the silent-empty defect stays closed', () => {
    const mediaById = new Map<string, CanvasV3MediaResolution>([
      [MEDIA_ID, { url: '/m/no-emoji-fallback.png', mimeType: 'image/png' }],
    ]);
    render(
      <CanvasV3Scene
        doc={sceneOf([stickerObject({ postMediaId: MEDIA_ID })])}
        mediaById={mediaById}
      />,
    );

    const img = screen.getByTestId('canvas-v3-object-sticker-1');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('/m/no-emoji-fallback.png');
  });

  it('uses the alt text keyed by postMediaId when the document carries one', () => {
    const mediaById = new Map<string, CanvasV3MediaResolution>([
      [MEDIA_ID, { url: '/m/party-sticker.webp', mimeType: 'image/webp', alt: 'Confetti party popper' }],
    ]);
    render(
      <CanvasV3Scene
        doc={sceneOf([stickerObject({ postMediaId: MEDIA_ID })])}
        mediaById={mediaById}
      />,
    );

    expect(screen.getByTestId('canvas-v3-object-sticker-1').getAttribute('alt')).toBe('Confetti party popper');
  });

  it('falls back to an empty alt — never an invented label — when the document carries none', () => {
    const mediaById = new Map<string, CanvasV3MediaResolution>([
      [MEDIA_ID, { url: '/m/party-sticker.webp', mimeType: 'image/webp' }],
    ]);
    render(
      <CanvasV3Scene
        doc={sceneOf([stickerObject({ postMediaId: MEDIA_ID })])}
        mediaById={mediaById}
      />,
    );

    expect(screen.getByTestId('canvas-v3-object-sticker-1').getAttribute('alt')).toBe('');
  });

  it('an unresolvable postMediaId falls back to the emoji, like an old client would render it', () => {
    render(
      <CanvasV3Scene
        doc={sceneOf([stickerObject({ emoji: '💫', postMediaId: 'not-in-mediaById' })])}
      />,
    );

    const el = screen.getByTestId('canvas-v3-object-sticker-1');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveTextContent('💫');
  });
});
