import { describe, expect, test } from 'bun:test';

import { callPillText, PILL_TEXT_MAX_WIDTH, PILL_TEXT_WIDTH_CLASS } from './call-pill-text';
import { IDLE, nextLayer, type CallScreenLayer } from './call-screen-layer';

/**
 * #17343 — ce que la pilule porte de TEXTE au-dessus de sa rangée de base,
 * miroir de `CallPillText` (iOS, #17473) : les sous-titres et le journal vivent
 * DANS son verre, en duo comme en groupe ; le journal s'ouvre à la place des
 * sous-titres ; (…) les range tous deux et refermer les actions les rend ; un
 * toucher qui range la pilule laisse les sous-titres dans un verre sans rangée
 * (loi 11 de `docs/product/appels-vue-finale.md`).
 */

const text = (layer: CallScreenLayer = IDLE, { captionsOn = true, chromeShown = true }: { captionsOn?: boolean; chromeShown?: boolean } = {}) => callPillText({ captionsOn, layer, chromeShown });

const menu: CallScreenLayer = { kind: 'menu' };
const panel = (name: 'react' | 'record' | 'people' | 'journal'): CallScreenLayer => ({ kind: 'panel', panel: name });
const mode = (name: 'effects' | 'montage'): CallScreenLayer => ({ kind: 'mode', mode: name });

describe('les sous-titres, dans la pilule', () => {
  test('au repos, sous-titres allumés : ils vivent dans le verre de la pilule', () => {
    expect(text()).toBe('captions');
  });

  test('sous-titres éteints, la pilule ne porte rien', () => {
    expect(text(IDLE, { captionsOn: false })).toBe('none');
  });
});

describe('(…) les range, refermer les rend', () => {
  test('le menu ouvert range les sous-titres', () => {
    expect(text(menu)).toBe('none');
    expect(text(nextLayer(panel('journal'), { type: 'toggle-menu' }))).toBe('none');
  });

  test('refermer le menu rend les sous-titres', () => {
    expect(text(nextLayer(nextLayer(IDLE, { type: 'toggle-menu' }), { type: 'toggle-menu' }))).toBe('captions');
  });

  test('une option ouverte dans la pilule remplace les sous-titres', () => {
    expect(text(panel('react'))).toBe('none');
    expect(text(panel('record'))).toBe('none');
    expect(text(panel('people'))).toBe('none');
  });
});

describe('le journal, à la place des sous-titres', () => {
  test('ouvert, il prend leur place', () => {
    expect(text(panel('journal'))).toBe('journal');
  });

  test('#17342 — le journal garde tout l’appel, sous-titres allumés ou non : il s’ouvre aussi sans eux', () => {
    expect(text(panel('journal'), { captionsOn: false })).toBe('journal');
  });

  test('rangé par (…), il revient quand le menu se referme', () => {
    const stowed = nextLayer(panel('journal'), { type: 'toggle-menu' });
    expect(text(stowed)).toBe('none');
    expect(text(nextLayer(stowed, { type: 'toggle-menu' }))).toBe('journal');
  });
});

describe('un toucher range la pilule : les sous-titres restent, sans rangée (loi 11)', () => {
  test('la pilule rangée laisse les sous-titres dans un verre à eux', () => {
    expect(text(IDLE, { chromeShown: false })).toBe('captionsAlone');
  });

  test('menu ou journal ouvert, la pilule rangée laisse aussi les sous-titres', () => {
    expect(text(menu, { chromeShown: false })).toBe('captionsAlone');
    expect(text(panel('journal'), { chromeShown: false })).toBe('captionsAlone');
  });

  test('sans sous-titres, il n’y a rien à laisser', () => {
    expect(text(IDLE, { captionsOn: false, chromeShown: false })).toBe('none');
    expect(text(panel('journal'), { captionsOn: false, chromeShown: false })).toBe('none');
  });

  test('un mode (Effets, Montage) n’a pas de pilule : les sous-titres y restent dans leur verre', () => {
    expect(text(mode('effects'))).toBe('captionsAlone');
    expect(text(mode('montage'), { chromeShown: false })).toBe('captionsAlone');
    expect(text(mode('effects'), { captionsOn: false })).toBe('none');
  });
});

describe('une seule largeur pour le verre (P3.10)', () => {
  test('le verre qui porte du texte, et le verre des sous-titres rangés, tiennent en 560 px — sans condition de fenêtre', () => {
    expect(PILL_TEXT_MAX_WIDTH).toBe(560);
    expect(PILL_TEXT_WIDTH_CLASS).toContain(`${PILL_TEXT_MAX_WIDTH}px`);
  });
});
