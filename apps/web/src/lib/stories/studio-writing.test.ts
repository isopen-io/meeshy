import { describe, expect, test } from 'bun:test';

import { sceneTextAppearance } from '@/lib/canvas/text-appearance';

import { newTextLayer, STUDIO_TEXT_FONT_SIZE, textLayerPayload, type StudioTextLayer } from './studio-text';
import { studioWritingStyle } from './studio-writing';

/**
 * **LE TEXTE S'ÉCRIT À L'ÉCHELLE DE LA SCÈNE** (#8681, jumelle de #8680 —
 * porteur 2026-09-29) : ce qu'on tape a exactement la taille qu'il aura une
 * fois publié, rapporté à la scène VISIBLE — réduite par l'outil ouvert ou non.
 */

const WIDTH_FRACTION = STUDIO_TEXT_FONT_SIZE / 1080;

const layer = (patch: Partial<StudioTextLayer> = {}): StudioTextLayer => ({ ...newTextLayer({ id: 'text-1', language: 'fr' }), ...patch });

/** La taille RENDUE d'une déclaration `Ncqw` × `scale(s)` sur une scène de `sceneWidth` px. */
const renderedPx = (style: { readonly fontSize: string; readonly transform: string }, sceneWidth: number): number => {
  const cqw = Number.parseFloat(style.fontSize.replace('cqw', ''));
  const scale = Number.parseFloat(/scale\(([^)]+)\)/.exec(style.transform)?.[1] ?? 'NaN');
  return (cqw / 100) * sceneWidth * scale;
};

describe('studioWritingStyle — la saisie a la taille du texte publié, rapportée à la scène visible', () => {
  test('la police se déclare en unités de la SCÈNE, comme le texte peint : jamais en px de champ', () => {
    const style = studioWritingStyle({ layer: layer(), widthFraction: WIDTH_FRACTION, box: null });
    expect(style.fontSize).toBe(`${WIDTH_FRACTION * 100}cqw`);
  });

  test('la taille rendue suit la largeur de la scène : réduite par l’outil ouvert, elle se réduit dans la même proportion', () => {
    const style = studioWritingStyle({ layer: layer(), widthFraction: WIDTH_FRACTION, box: null });
    const full = renderedPx(style, 370);
    const reduced = renderedPx(style, 278);
    expect(full / 370).toBeCloseTo(reduced / 278, 9);
    expect(full).toBeCloseTo((STUDIO_TEXT_FONT_SIZE / 1080) * 370, 9);
  });

  test('un texte AGRANDI (pincement, « + ») s’écrit à sa taille agrandie — l’échelle de l’objet entre dans la saisie', () => {
    const style = studioWritingStyle({ layer: layer({ pose: { x: 0.5, y: 0.3, scale: 1.6, rotation: 12 } }), widthFraction: WIDTH_FRACTION, box: null });
    expect(renderedPx(style, 278)).toBeCloseTo(WIDTH_FRACTION * 278 * 1.6, 9);
  });

  test('la saisie se pose à l’ANCRE de l’objet, tournée comme lui : le même transform que `SceneObjectFrame`', () => {
    const style = studioWritingStyle({ layer: layer({ pose: { x: 0.25, y: 0.7, scale: 1.2, rotation: -30 } }), widthFraction: WIDTH_FRACTION, box: null });
    expect(style.left).toBe('25%');
    expect(style.top).toBe('70%');
    expect(style.transform).toBe('translate(-50%, -50%) rotate(-30deg) scale(1.2)');
  });

  test('un texte NEUF (rien de peint) : l’invite s’écrit à SA place, sur 85 % de la scène, jamais dans la boîte d’un autre texte', () => {
    const style = studioWritingStyle({ layer: layer({ pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } }), widthFraction: WIDTH_FRACTION, box: null });
    expect(style.width).toBe('85cqw');
    expect(style.height).toBeUndefined();
    expect(style.left).toBe('50%');
    expect(style.top).toBe('50%');
  });

  test('un texte peint : la saisie adopte sa boîte AVANT transformation, bornée comme lui à 85 % de la scène', () => {
    const style = studioWritingStyle({ layer: layer(), widthFraction: WIDTH_FRACTION, box: { width: 120.4, height: 33.6 } });
    expect(style.width).toBe('121.4px');
    expect(style.maxWidth).toBe('85cqw');
    expect(style.height).toBe('33.6px');
  });

  test('la TYPOGRAPHIE est celle que le moteur peint : famille, graisse, italique, alignement, marge de pastille', () => {
    const typed = layer({ style: 'typewriter', align: 'left', background: 'FF2E63' });
    const look = sceneTextAppearance(textLayerPayload(typed));
    const style = studioWritingStyle({ layer: typed, widthFraction: WIDTH_FRACTION, box: null });
    expect(style.fontFamily).toBe(look.fontFamily);
    expect(style.fontWeight).toBe(look.fontWeight);
    expect(style.textAlign).toBe('left');
    expect(style.padding).toBe(look.padding);
    const italic = layer({ style: 'italic' });
    expect(studioWritingStyle({ layer: italic, widthFraction: WIDTH_FRACTION, box: null }).fontStyle).toBe('italic');
  });

  test('sans pastille, aucune marge : le curseur reste sur la première lettre peinte', () => {
    expect(studioWritingStyle({ layer: layer(), widthFraction: WIDTH_FRACTION, box: null }).padding).toBeUndefined();
  });
});
