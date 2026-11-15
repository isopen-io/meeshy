import { describe, expect, test } from 'bun:test';

import type { CanvasObject } from '@/lib/canvas/document';

import { layoutSceneText, parseTextShadows } from './scene-export-text';

const textObject = (payload: Record<string, unknown>, extra: Partial<CanvasObject> = {}): CanvasObject => ({
  id: 't',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
  ...extra,
});

/** Chaque caractère mesure la moitié de la taille de police — une mesure stable, sans canvas. */
const measure = (text: string, font: string): number => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '10');
  return text.length * px * 0.5;
};

describe('le texte d’une scène, mis en page pour l’export comme le lecteur le peint', () => {
  test('la taille suit la largeur de la scène, dans le référentiel 1080', () => {
    const layout = layoutSceneText({ object: textObject({ text: 'Bonjour', fontSize: 108 }), preferredLanguages: ['fr'], sceneWidth: 720, measure, defaultFamily: 'Inter' });
    expect(layout?.font).toBe('600 72px Inter');
    expect(layout?.lines.map((line) => line.text)).toEqual(['Bonjour']);
    expect(layout?.box.width).toBe(7 * 36);
  });

  test('un texte long se coupe à 88 % de la scène', () => {
    const layout = layoutSceneText({
      object: textObject({ text: 'un deux trois quatre cinq six sept huit neuf dix', fontSize: 108 }),
      preferredLanguages: ['fr'],
      sceneWidth: 720,
      measure,
      defaultFamily: 'Inter',
    });
    expect(layout?.lines.length).toBeGreaterThan(1);
    for (const line of layout?.lines ?? []) expect(measure(line.text, layout?.font ?? '')).toBeLessThanOrEqual(720 * 0.88);
  });

  test('le Prisme sert la traduction du lecteur, jamais une autre', () => {
    const layout = layoutSceneText({
      object: textObject({ text: 'Hello', translations: { fr: 'Bonjour', es: 'Hola' } }, { locale: 'en' }),
      preferredLanguages: ['fr'],
      sceneWidth: 720,
      measure,
      defaultFamily: 'Inter',
    });
    expect(layout?.lines.map((line) => line.text)).toEqual(['Bonjour']);
  });

  test('la pastille et le contour des glyphes partent avec le texte', () => {
    const layout = layoutSceneText({
      object: textObject({ text: 'Fête', fontSize: 100, textBg: 'FF0000', borderColor: '00FF00', borderWidth: 5 }),
      preferredLanguages: ['fr'],
      sceneWidth: 1080,
      measure,
      defaultFamily: 'Inter',
    });
    expect(layout?.background).toBe('#FF0000');
    expect(layout?.stroke).toEqual({ width: 5, color: '#00FF00' });
    expect(layout?.box.width).toBe(4 * 50 + 2 * 50);
  });

  test('un texte vide ne peint rien', () => {
    expect(layoutSceneText({ object: textObject({ text: '' }), preferredLanguages: ['fr'], sceneWidth: 720, measure, defaultFamily: 'Inter' })).toBeNull();
  });
});

describe('les ombres CSS du texte, lues pour le canvas', () => {
  test('em et px se résolvent sur la taille du texte ; currentColor prend sa couleur', () => {
    expect(parseTextShadows('0 1px 4px rgba(0,0,0,0.5)', 40, '#FFFFFF')).toEqual([{ offsetX: 0, offsetY: 1, blur: 4, color: 'rgba(0,0,0,0.5)' }]);
    expect(parseTextShadows('0.1em 0 0.5em currentColor', 40, '#FF8800')).toEqual([{ offsetX: 4, offsetY: 0, blur: 20, color: '#FF8800' }]);
    expect(parseTextShadows('0 0 0.2em color-mix(in srgb, currentColor 55%, transparent)', 10, '#FF8800')).toEqual([
      { offsetX: 0, offsetY: 0, blur: 2, color: 'rgba(255,136,0,0.55)' },
    ]);
  });
});
