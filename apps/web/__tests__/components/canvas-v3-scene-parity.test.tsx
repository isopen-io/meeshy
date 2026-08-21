/**
 * F7a — parité legacy + résilience de `CanvasV3Scene` (addendum rév. 2 du plan
 * lot F, arbitrages 1/3/5 ; constats 5, 6, 7, 8, 10, 13, 14, 24 de la revue).
 *
 * Le chemin v3 devient le chemin PAR DÉFAUT dès `CANVAS_V3_READ` armé : tout ce
 * que le chemin legacy de `StoryViewer` garantissait, le v3 doit le garantir
 * AU MOINS autant — la taille de police du FIL (`fontSize`, px de design sur le
 * canvas 1080), l'autoplay des vidéos, le mute forcé du fond (sans lui la
 * politique navigateur refuse le démarrage), le média posé à 65 % arrondi, la
 * boucle, les gestionnaires de mise en mémoire tampon. Et un objet malformé —
 * que le gateway sert TEL QUEL aux clients caps-3 — est sauté sans emporter la
 * scène ni la page.
 *
 * NB jsdom : les unités `cqw` sont REJETÉES par son moteur CSS (`style.fontSize`
 * rend `''`, l'attribut `style` ne les porte pas non plus). La taille est donc
 * jugée sur le résolveur pur exporté par le module — celui que `TextObject`
 * applique — plutôt que sur une propriété que l'environnement de test efface.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema, type CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { CanvasV3Scene, canvasV3TextFontSize } from '@/components/v2/CanvasV3Scene';

const FIXTURES = join(__dirname, '../../../../packages/shared/fixtures/canvas-v3');

function fixture(name: string): CanvasV3 {
  return CanvasV3Schema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')));
}

function sceneOf(objects: unknown[]): CanvasV3 {
  return { v: 3, scenes: [{ id: 's1', objects }] } as unknown as CanvasV3;
}

function mediaObject(id: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    kind: 'media',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: payload.isBackground === true ? 'bg' : 'content',
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  };
}

describe('CanvasV3Scene — parité legacy (F7a)', () => {
  it('scales the wire fontSize to cqw — the v1 funnel alias is not the wire key', () => {
    // iOS émet `payload.fontSize` (CanvasV3Migration.swift:428) et le
    // convertisseur gateway le recopie tel quel : c'est LA clé du fil.
    expect(canvasV3TextFontSize({ fontSize: 108 })).toBe('10.0000cqw');
    // `fontSizeDesign` reste l'alias interne du funnel v1 (story-transforms).
    expect(canvasV3TextFontSize({ fontSizeDesign: 108 })).toBe('10.0000cqw');
    // La clé du fil l'emporte sur la taille css brute héritée du v1.
    expect(canvasV3TextFontSize({ fontSize: 108, textSize: 30 })).toBe('10.0000cqw');
    expect(canvasV3TextFontSize({ textSize: 30 })).toBe('30px');
    expect(canvasV3TextFontSize({})).toBe('24px');
  });

  it('autoplays a posed carrier video, muted and looping — legacy never left it on frame one', () => {
    const mediaById = new Map([
      ['64b000000000000000000001', { url: '/m/reel.mp4', mimeType: 'video/mp4', aspectRatio: 16 / 9 }],
    ]);
    render(<CanvasV3Scene doc={fixture('reel-16x9-bands')} mediaById={mediaById} />);

    const video = screen.getByTestId('canvas-v3-media-m1') as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
    // La fixture porte `muted: false` : sans mute forcé, Chrome et Safari
    // refusent le démarrage automatique (parité StoryViewer.tsx:996-1004).
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
  });

  it('keeps the background video muted whatever the payload claims, so the browser lets it start', () => {
    const doc = sceneOf([
      mediaObject('bg1', { mediaURL: '/m/bg.mp4', mediaType: 'video', isBackground: true, muted: false }),
    ]);
    render(<CanvasV3Scene doc={doc} />);

    const video = screen.getByTestId('canvas-v3-object-bg1') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
  });

  it('honours the muted prop on the background players — the badge toggles a real element', () => {
    const doc = sceneOf([
      mediaObject('bg1', { mediaURL: '/m/bg.mp4', mediaType: 'video', isBackground: true, muted: false }),
      {
        id: 'a1',
        kind: 'audio',
        anchor: { t: 'free', x: 0.5, y: 0.5 },
        plane: 'content',
        z: 1,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        payload: { mediaURL: '/a/track.mp3', isBackground: true },
      },
    ]);

    const { rerender } = render(<CanvasV3Scene doc={doc} muted />);
    expect((screen.getByTestId('canvas-v3-object-bg1') as HTMLVideoElement).muted).toBe(true);
    expect((screen.getByTestId('canvas-v3-object-a1') as HTMLAudioElement).muted).toBe(true);

    rerender(<CanvasV3Scene doc={doc} muted={false} />);
    expect((screen.getByTestId('canvas-v3-object-bg1') as HTMLVideoElement).muted).toBe(false);
    expect((screen.getByTestId('canvas-v3-object-a1') as HTMLAudioElement).muted).toBe(false);
  });

  it('lays a posed media at 65% of the canvas with the legacy rounding', () => {
    const doc = sceneOf([mediaObject('m1', { mediaURL: '/m/a.jpg', mediaType: 'image' })]);
    render(<CanvasV3Scene doc={doc} />);

    // Parité iOS documentée par le legacy (`baseMediaSize = shortDim * 0.65`,
    // StoryViewer.tsx:951-956) : le média posé n'occupe pas toute la largeur.
    const posed = screen.getByTestId('canvas-v3-object-m1');
    expect(posed.style.width).toBe('65%');
    expect(posed.className).toContain('rounded-lg');
  });

  it('forwards the buffering gate handlers to every video', () => {
    const onWaiting = jest.fn();
    const onStalled = jest.fn();
    const onPlaying = jest.fn();
    const onCanPlay = jest.fn();
    const doc = sceneOf([
      mediaObject('bg1', { mediaURL: '/m/bg.mp4', mediaType: 'video', isBackground: true }),
      mediaObject('m1', { mediaURL: '/m/posed.mp4', mediaType: 'video' }),
    ]);

    render(
      <CanvasV3Scene
        doc={doc}
        videoGateHandlers={{ onWaiting, onStalled, onPlaying, onCanPlay }}
      />
    );

    fireEvent.waiting(screen.getByTestId('canvas-v3-object-bg1'));
    fireEvent.playing(screen.getByTestId('canvas-v3-object-bg1'));
    fireEvent.stalled(screen.getByTestId('canvas-v3-media-m1'));
    fireEvent.canPlay(screen.getByTestId('canvas-v3-media-m1'));

    expect(onWaiting).toHaveBeenCalledTimes(1);
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(onStalled).toHaveBeenCalledTimes(1);
    expect(onCanPlay).toHaveBeenCalledTimes(1);
  });
});

describe('CanvasV3Scene — résilience par objet (F7a)', () => {
  it('defaults a missing transform and skips an unrenderable object without losing the scene', () => {
    const doc = sceneOf([
      // Objet amputé de son `payload` : rien à rendre, il est SAUTÉ.
      { id: 'brokenText', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0 },
      // Objet amputé de son `transform` et de son `anchor` : défauts appliqués.
      { id: 'brokenMedia', kind: 'media', plane: 'content', z: 0, payload: { mediaURL: '/m/a.jpg', mediaType: 'image' } },
      {
        id: 't1', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0,
        transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Bonjour' },
      },
    ]);

    expect(() => render(<CanvasV3Scene doc={doc} />)).not.toThrow();
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Bonjour');
    expect(screen.queryByTestId('canvas-v3-object-brokenText')).toBeNull();

    const defaulted = screen.getByTestId('canvas-v3-object-brokenMedia');
    expect(defaulted.style.transform).toContain('scale(1)');
    expect(defaulted.style.left).toBe('50%');
  });

  it('survives an object whose payload throws while rendering', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const hostile = {
      id: 'hostile', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0,
      transform: { scale: 1, rotation: 0, opacity: 1 },
      payload: Object.defineProperty({}, 'text', {
        get() { throw new Error('payload piégé'); },
        enumerable: true,
      }),
    };
    const doc = sceneOf([
      hostile,
      {
        id: 't1', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0,
        transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Bonjour' },
      },
    ]);

    expect(() => render(<CanvasV3Scene doc={doc} />)).not.toThrow();
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Bonjour');
    expect(screen.queryByTestId('canvas-v3-object-hostile')).toBeNull();
    spy.mockRestore();
  });
});

describe('CanvasV3Scene — multi-scènes, dette assumée (F7a)', () => {
  it('renders exactly the requested scene — multi-scene playback stays out of the lot F scope', () => {
    const doc = fixture('story-3-slides');

    const first = render(<CanvasV3Scene doc={doc} />);
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Premiere slide');
    expect(screen.queryByTestId('canvas-v3-object-t3')).toBeNull();
    first.unmount();

    const third = render(<CanvasV3Scene doc={doc} sceneIndex={2} />);
    expect(screen.getByTestId('canvas-v3-object-t3')).toHaveTextContent('Troisieme slide');
    expect(screen.queryByTestId('canvas-v3-object-t1')).toBeNull();
    third.unmount();
  });
});
