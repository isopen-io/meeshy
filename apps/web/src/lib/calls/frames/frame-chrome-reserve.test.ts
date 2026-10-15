import { describe, expect, test } from 'bun:test';

import type { Rect, Size } from '../call-montage-shapes';
import { captureFrames } from './frame-catalogue';
import { chromeBands, chromeReserve, chromeReserveCovering, chromeReserveOnScreen, NO_CHROME_RESERVE, type FrameChromeReserve } from './frame-chrome-reserve';
import { CALL_FRAME_USES, offeredFor } from './frame-filter';
import { frameAreas, RESERVE_CONTENT_FLOOR } from './frame-layout';
import { frameScene, textSceneOf } from './frame-paint';
import { footprint } from './frame-paint-kit';
import { textLayout } from './frame-paint-text';
import { recorder } from './frame-recorder.test-support';
import { frameLayersKey } from './frame-render';
import type { CaptureFrame } from './frame-spec';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * AUCUN TEXTE DU CADRE NE PASSE SOUS UN CONTRÔLE (#10481, jumelle de #9777).
 * En appel, la toile du cadre couvre l'écran et sa réserve haute commençait à
 * la marge du cadre : le titre de Gala, d'Aurore, de Fête… passait sous les
 * contrôles du haut, et ceux du bas sous la barre de commandes. Les bandes des
 * contrôles sont désormais RÉSERVÉES. Mêmes écrans et mêmes bandes que
 * `CallFrameChromeReserveTests` (iOS).
 */

const TEXTS: FrameTexts = { groupName: null, isGroup: false, date: '9 oct. 2026', accent: null };
const DUO: readonly FramePerson[] = [
  { id: 'a', name: 'Windie Nh', handle: 'windie', isSelf: true },
  { id: 'b', name: 'J. Charles N. M.', handle: 'jcharles', isSelf: false },
];

/** L'iPhone 16 Pro Max de la recette (encarts 62 / 34) et l'iPhone 16 (59 / 34) ; rangée du haut 52, commandes 84. */
const SCREENS: readonly { readonly size: Size; readonly top: number; readonly bottom: number }[] = [
  { size: { width: 440, height: 956 }, top: 62, bottom: 34 },
  { size: { width: 393, height: 852 }, top: 59, bottom: 34 },
];

/** Les commandes du mode Montage web au repos, au-dessus de l'encart bas : ambiances 52, carrousel 124, barre 48, deux écarts de 12, marge basse 24. */
const MONTAGE_CONTROLS = 52 + 124 + 48 + 12 * 2 + 24;

const callReserve = (screen: (typeof SCREENS)[number]): FrameChromeReserve => chromeReserveCovering({ top: screen.top + 8 + 52, bottom: screen.bottom + 12 + 84, height: screen.size.height });

const liveFrames = () => offeredFor(captureFrames(), CALL_FRAME_USES).filter((frame) => frame.people[0] <= 2 && 2 <= frame.people[1]);

const textBoxes = (frame: CaptureFrame, size: Size, reserve: FrameChromeReserve): readonly Rect[] =>
  textLayout(recorder().context, textSceneOf(frameScene(frame, DUO, TEXTS, size, reserve))).boxes;

const covered = (box: Rect, bands: ReturnType<typeof chromeBands>): boolean => box.y < bands.top.y + bands.top.height - 0.5 || box.y + box.height > bands.bottom.y + 0.5;

describe('les bandes des contrôles en appel (#10481)', () => {
  test('sans réserve, des cadres en direct posent un texte sous les contrôles — Gala compris', () => {
    const screen = SCREENS[0] as (typeof SCREENS)[number];
    const bands = chromeBands(callReserve(screen), screen.size);
    const hidden = liveFrames().filter((frame) => textBoxes(frame, screen.size, NO_CHROME_RESERVE).some((box) => covered(box, bands)));
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.some((frame) => frame.name === 'Gala')).toBe(true);
  });

  test('avec la réserve de l’appel, aucun texte d’aucun cadre en direct ne passe sous un contrôle', () => {
    SCREENS.forEach((screen) => {
      const reserve = callReserve(screen);
      const bands = chromeBands(reserve, screen.size);
      liveFrames().forEach((frame) => {
        textBoxes(frame, screen.size, reserve).forEach((box) => {
          expect({ id: frame.id, size: screen.size, box, covered: covered(box, bands) }).toEqual({ id: frame.id, size: screen.size, box, covered: false });
        });
      });
    });
  });

  test('avec la réserve de l’appel, chaque visage reste entre les contrôles', () => {
    SCREENS.forEach((screen) => {
      const reserve = callReserve(screen);
      const bands = chromeBands(reserve, screen.size);
      liveFrames().forEach((frame) => {
        frameScene(frame, DUO, TEXTS, screen.size, reserve).slots.map(footprint).forEach((face) => {
          expect({ id: frame.id, size: screen.size, covered: covered(face, bands) }).toEqual({ id: frame.id, size: screen.size, covered: false });
        });
      });
    });
  });

  test('dans le mode Montage web, l’aperçu letterboxé 9:16 ne pose aucun texte d’un cadre en direct sous ses commandes', () => {
    const canvas = { width: 540, height: 960 };
    SCREENS.forEach((screen) => {
      const reserve = chromeReserveOnScreen({ viewport: screen.size, canvas, top: screen.top, bottom: MONTAGE_CONTROLS + screen.bottom });
      expect(reserve.bottom).toBeGreaterThan(0);
      const bands = chromeBands(reserve, canvas);
      liveFrames().forEach((frame) => {
        textBoxes(frame, canvas, reserve).forEach((box) => {
          expect({ id: frame.id, size: screen.size, covered: covered(box, bands) }).toEqual({ id: frame.id, size: screen.size, covered: false });
        });
      });
    });
  });

  test('sans réserve, la géométrie est celle de la fixture de parité', () => {
    const size = { width: 440, height: 956 };
    captureFrames().forEach((frame) => {
      expect({ id: frame.id, areas: frameAreas(frame.layout, size, NO_CHROME_RESERVE) }).toEqual({ id: frame.id, areas: frameAreas(frame.layout, size) });
      expect({ id: frame.id, scene: frameScene(frame, DUO, TEXTS, size, NO_CHROME_RESERVE).slots }).toEqual({ id: frame.id, scene: frameScene(frame, DUO, TEXTS, size).slots });
    });
  });

  test('sous des contrôles géants, la zone des visages garde au moins la moitié de sa hauteur et les réserves la leur', () => {
    const size = { width: 956, height: 440 };
    const reserve = chromeReserve(0.45, 0.45);
    captureFrames().forEach((frame) => {
      const canonical = frameAreas(frame.layout, size);
      const reserved = frameAreas(frame.layout, size, reserve);
      expect({ id: frame.id, floor: reserved.content.height >= canonical.content.height * RESERVE_CONTENT_FLOOR - 0.5 }).toEqual({ id: frame.id, floor: true });
      expect({ id: frame.id, top: reserved.top.height, bottom: reserved.bottom.height }).toEqual({ id: frame.id, top: canonical.top.height, bottom: canonical.bottom.height });
      expect({ id: frame.id, background: reserved.inner }).toEqual({ id: frame.id, background: canonical.inner });
    });
  });

  test('une bande arrondie n’est jamais plus courte que le contrôle, et une toile vide n’en a pas', () => {
    const bands = chromeBands(chromeReserveCovering({ top: 122, bottom: 130, height: 956 }), { width: 440, height: 956 });
    expect(bands.top.height).toBeGreaterThanOrEqual(122);
    expect(bands.bottom.height).toBeGreaterThanOrEqual(130);
    expect(chromeReserveCovering({ top: 10, bottom: 10, height: 0 })).toEqual(NO_CHROME_RESERVE);
    expect(chromeReserve(0.9, -1)).toEqual({ top: 0.5, bottom: 0 });
  });

  test('une réserve changée repeint les couches du cadre', () => {
    const frame = liveFrames()[0];
    if (frame === undefined) throw new Error('aucun cadre en direct');
    const size = { width: 10, height: 20 };
    expect(frameLayersKey(frame, DUO, size, TEXTS, chromeReserve(0.1, 0.1))).not.toBe(frameLayersKey(frame, DUO, size, TEXTS));
    expect(frameLayersKey(frame, DUO, size, TEXTS, NO_CHROME_RESERVE)).toBe(frameLayersKey(frame, DUO, size, TEXTS));
  });

  test('à l’écran, la part d’une bande qui tombe dans le bandeau noir ne prend rien au cadre', () => {
    const canvas = { width: 540, height: 960 };
    const tall = chromeReserveOnScreen({ viewport: { width: 440, height: 956 }, canvas, top: 62, bottom: 300 });
    const shown = 960 * (440 / 540);
    const letterbox = (956 - shown) / 2;
    expect(tall.top).toBe(0);
    expect(tall.bottom).toBe(Math.ceil(((300 - letterbox) / shown) * 1000) / 1000);
    const exact = chromeReserveOnScreen({ viewport: { width: 540, height: 960 }, canvas, top: 120, bottom: 192 });
    expect(exact).toEqual({ top: 0.125, bottom: 0.2 });
    expect(chromeReserveOnScreen({ viewport: { width: 0, height: 0 }, canvas, top: 10, bottom: 10 })).toEqual(NO_CHROME_RESERVE);
  });
});
