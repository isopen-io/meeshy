import { describe, expect, test } from 'bun:test';

import { inSelfGroup, mineInMenu, selfControlsPlace, selfRowBounds, selfRowsLayout, selfRowWidth, SELF_ROW_HEIGHT } from './call-self-controls';

/**
 * LES COMMANDES DE MA CAMÉRA (#8626) — dans ma vignette, en haut au centre
 * quand mon image remplit l'écran, et dans le `(…)` seulement quand je n'ai
 * pas de vignette où les poser. Jamais à deux endroits à la fois.
 */

const place = (overrides: Partial<Parameters<typeof selfControlsPlace>[0]> = {}) => selfControlsPlace({ layout: 'video-duo', selfFull: false, selfTileShown: true, ...overrides });

describe('selfControlsPlace', () => {
  test('ma vignette en coin porte les commandes de ma caméra', () => {
    expect(place()).toBe('tile');
  });

  test('mon image en plein écran : les commandes montent en haut au centre', () => {
    expect(place({ selfFull: true })).toBe('top');
    expect(place({ selfFull: true, selfTileShown: false })).toBe('top');
  });

  test('sans vignette (caméra coupée), elles restent dans le (…) pour pouvoir la rallumer', () => {
    expect(place({ selfTileShown: false })).toBe('menu');
  });

  test('hors du duo vidéo (vocal, groupe, écran partagé par le pair), elles restent dans le (…)', () => {
    expect(place({ layout: 'portrait' })).toBe('menu');
    expect(place({ layout: 'grid', selfFull: true })).toBe('menu');
    expect(place({ layout: 'screen' })).toBe('menu');
  });
});

describe('mineInMenu', () => {
  test('la rangée « Mon image » du (…) ne double jamais les commandes posées ailleurs', () => {
    const set = { mine: ['camera', 'flip', 'effects', 'screen'] as const, call: ['captions'] as const };
    expect(mineInMenu(set, 'tile')).toEqual({ mine: [], call: ['captions'] });
    expect(mineInMenu(set, 'top')).toEqual({ mine: [], call: ['captions'] });
    expect(mineInMenu(set, 'menu')).toBe(set);
  });
});

/**
 * AUTOUR DE MA VIGNETTE (#8747) — Effets · Écran au-dessus, Retourner ·
 * Couper en dessous ; à l'écran, jamais sous l'en-tête ni sous la pilule.
 */
describe('inSelfGroup', () => {
  test('Effets et Écran vont au-dessus, Retourner et Couper en dessous ; sans groupe, tout', () => {
    const all = ['flip', 'camera', 'effects', 'screen'] as const;
    expect(all.filter((action) => inSelfGroup('effects', action))).toEqual(['effects', 'screen']);
    expect(all.filter((action) => inSelfGroup('camera', action))).toEqual(['flip', 'camera']);
    expect(all.filter((action) => inSelfGroup(undefined, action))).toEqual([...all]);
  });
});

describe('selfRowsLayout', () => {
  const phone = selfRowBounds({ width: 390, height: 844 });
  const tile = (y: number, x = 262, width = 112, height = 160) => ({ x, y, width, height });
  const two = selfRowWidth(2);
  const layout = (frame: ReturnType<typeof tile>, bounds = phone, effectsWidth = two, cameraWidth = two) => selfRowsLayout({ tile: frame, bounds, effectsWidth, cameraWidth });

  test('de la place des deux côtés : Effets au-dessus, la caméra en dessous, à 8 px de la vignette', () => {
    const frame = tile(128);
    const rows = layout(frame);
    expect(rows.effects?.side).toBe('above');
    expect(rows.camera?.side).toBe('below');
    expect((rows.effects?.y ?? 0) + SELF_ROW_HEIGHT).toBe(frame.y - 8);
    expect(rows.camera?.y).toBe(frame.y + frame.height + 8);
  });

  test('les rangées sont hors de la vignette, et centrées sur elle', () => {
    const frame = tile(300, 100);
    const rows = layout(frame);
    for (const row of [rows.effects, rows.camera]) {
      expect(row).not.toBeNull();
      const inside = row !== null && row.y < frame.y + frame.height && row.y + row.height > frame.y;
      expect(inside).toBe(false);
      expect((row?.x ?? 0) + (row?.width ?? 0) / 2).toBe(frame.x + frame.width / 2);
    }
  });

  test('une vignette plus étroite que sa rangée, contre le bord : la rangée reste à l’écran', () => {
    const rows = layout(tile(300, 390 - 16 - 80, 80, 114), phone, selfRowWidth(3), two);
    expect((rows.effects?.x ?? 0) + (rows.effects?.width ?? 0)).toBeLessThanOrEqual(phone.x + phone.width);
  });

  test('collée sous l’en-tête : Effets passent sous la rangée de la caméra', () => {
    const frame = tile(70);
    const rows = layout(frame);
    expect(rows.effects?.side).toBe('below');
    expect(rows.camera?.y).toBe(frame.y + frame.height + 8);
    expect(rows.effects?.y).toBe(frame.y + frame.height + 8 + SELF_ROW_HEIGHT + 8);
  });

  test('collée à la pilule : la caméra passe au-dessus de la rangée des Effets', () => {
    const frame = tile(844 - 104 - 160 - 10);
    const rows = layout(frame);
    expect(rows.camera?.side).toBe('above');
    expect((rows.effects?.y ?? 0) + SELF_ROW_HEIGHT).toBe(frame.y - 8);
    expect((rows.camera?.y ?? 0) + SELF_ROW_HEIGHT).toBe(frame.y - 8 - SELF_ROW_HEIGHT - 8);
  });

  test('aucune place (fenêtre basse) : chaque rangée chevauche le bord de la vignette du strict nécessaire', () => {
    const short = selfRowBounds({ width: 900, height: 360 });
    const rows = layout(tile(60, 600, 112, 150), short);
    expect(rows.effects?.side).toBe('above');
    expect(rows.effects?.y).toBe(short.y);
    expect(rows.camera?.side).toBe('below');
    expect((rows.camera?.y ?? 0) + SELF_ROW_HEIGHT).toBe(short.y + short.height);
  });

  test('où que soit la vignette, aucune rangée ne passe sous l’en-tête ni sous la pilule', () => {
    for (let y = 0; y <= 700; y += 20) {
      const rows = layout(tile(y));
      for (const row of [rows.effects, rows.camera]) {
        expect(row?.y ?? phone.y).toBeGreaterThanOrEqual(phone.y);
        expect((row?.y ?? 0) + SELF_ROW_HEIGHT).toBeLessThanOrEqual(phone.y + phone.height);
      }
    }
  });

  test('une rangée sans bouton ne se pose pas', () => {
    expect(layout(tile(128), phone, 0, two).effects).toBeNull();
  });

  test('ma vignette au repos (8 rem sous la zone sûre) laisse la place d’Effets au-dessus', () => {
    expect(layout(tile(128)).effects?.side).toBe('above');
    expect(layout(tile(128, 206, 168, 240)).camera?.side).toBe('below');
  });

  test('chaque bouton garde 44 px', () => {
    expect(SELF_ROW_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(selfRowWidth(2)).toBeGreaterThanOrEqual(2 * 44);
  });
});
