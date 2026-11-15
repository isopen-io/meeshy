import { describe, expect, test } from 'bun:test';

import type { Rect, Size } from '../call-montage-shapes';
import { captureFrames } from './frame-catalogue';
import { frameAreas, frameSlots } from './frame-layout';
import { frameScene, frameSlotsFor, textSceneOf } from './frame-paint';
import { footprint, intersects } from './frame-paint-kit';
import { nameRoom, namesFitBelow, textLayout } from './frame-paint-text';
import { recorder } from './frame-recorder.test-support';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * LES NOMS POSÉS SOUS LA CASE NE COUVRENT JAMAIS UN VISAGE (#10478, jumelle
 * de #9780). En appel à deux, Cœur de rose empile ses deux cœurs : sans place
 * entre eux, la banderole des noms se repliait DANS chaque cœur sur son fond
 * plein et en masquait la moitié basse. La géométrie de la scène laisse
 * désormais sous chaque case la place de ses noms, et le peintre les pose
 * dessous. Mêmes tailles que `CallFrameNameRoomTests` (iOS).
 */

const LIVE_SCREENS: readonly Size[] = [
  { width: 440, height: 956 },
  { width: 1320, height: 2868 },
  { width: 393, height: 852 },
  { width: 956, height: 440 },
];
const TEXTS: FrameTexts = { groupName: null, isGroup: false, date: '9 oct. 2026', accent: null };
const DUO: readonly FramePerson[] = [
  { id: 'a', name: 'Amélie Durand', handle: 'amelie', isSelf: true },
  { id: 'b', name: 'Bastien Morel', handle: 'bastien', isSelf: false },
];
const people = (count: number): readonly FramePerson[] => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Personne ${index}`, handle: `p${index}`, isSelf: index === 0 }));

const coeurDeRose = () => {
  const frame = captureFrames().find((candidate) => candidate.id === 'feerique.coeur-de-rose.duo');
  if (frame === undefined) throw new Error('Cœur de rose (duo) absent du catalogue');
  return frame;
};

const bottomOf = (rect: Rect): number => rect.y + rect.height;
const contains = (outer: Rect, inner: Rect, slack: number): boolean =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && bottomOf(inner) <= bottomOf(outer) + slack;

describe('les noms sous la case (#10478)', () => {
  test('Cœur de rose, en appel à deux, pose la banderole SOUS chaque cœur', () => {
    const frame = coeurDeRose();
    LIVE_SCREENS.forEach((size) => {
      const scene = textSceneOf(frameScene(frame, DUO, TEXTS, size));
      const { plan } = textLayout(recorder().context, scene);
      expect({ size, fits: namesFitBelow(scene, plan) }).toEqual({ size, fits: true });
    });
  });

  test('en portrait, la bande de la banderole sous un cœur ne touche aucun autre cœur ni ne sort du contenu', () => {
    const frame = coeurDeRose();
    LIVE_SCREENS.filter((size) => size.height > size.width).forEach((size) => {
      const scene = frameScene(frame, DUO, TEXTS, size);
      const room = nameRoom(frame, scene.areas.unit);
      expect(room).toBeGreaterThan(0);
      const footprints = scene.slots.map(footprint);
      footprints.forEach((own, index) => {
        const band: Rect = { x: own.x, y: bottomOf(own), width: own.width, height: room };
        expect({ size, index, out: bottomOf(band) > bottomOf(scene.areas.content) + 0.5 }).toEqual({ size, index, out: false });
        footprints
          .filter((_, other) => other !== index)
          .forEach((other) => {
            const overlap = intersects(band, other) ? Math.min(bottomOf(band), bottomOf(other)) - Math.max(band.y, other.y) : 0;
            expect({ size, index, covers: overlap >= 0.5 }).toEqual({ size, index, covers: false });
          });
      });
    });
  });

  test('les cadres dont les noms vivent dans la case gardent la géométrie de la fixture de parité', () => {
    const size = { width: 440, height: 956 };
    captureFrames()
      .filter((frame) => nameRoom(frame, Math.min(size.width, size.height)) === 0)
      .forEach((frame) => {
        const count = frame.people[0];
        expect({ id: frame.id, slots: frameSlotsFor(frame, count, size) }).toEqual({ id: frame.id, slots: frameSlots(frame, count, size) });
      });
  });

  test('chaque cadre aux noms dessous garde chaque case dans le contenu et au moins la moitié de sa hauteur', () => {
    captureFrames().forEach((frame) => {
      LIVE_SCREENS.forEach((size) => {
        const count = frame.people[0];
        const made = frameSlotsFor(frame, count, size);
        const web = frameSlots(frame, count, size);
        const content = frameAreas(frame.layout, size).content;
        expect({ id: frame.id, count: made.length }).toEqual({ id: frame.id, count: web.length });
        made.forEach((box, index) => {
          const original = web[index];
          if (original === undefined) return;
          expect({ id: frame.id, index, half: box.rect.height >= original.rect.height * 0.5 - 0.001, inside: contains(content, box.rect, 0.5) }).toEqual({ id: frame.id, index, half: true, inside: true });
        });
      });
    });
  });

  test('la scène peinte place les visages dans les cases qui laissent la place des noms', () => {
    const frame = coeurDeRose();
    const size = LIVE_SCREENS[0] as Size;
    expect(frameScene(frame, people(2), TEXTS, size).slots).toEqual(frameSlotsFor(frame, 2, size));
  });
});
