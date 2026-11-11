import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { callPillText, pillHasBaseRow, pillShowsCaptionsBand, pillStaysWhenChromeStowed, PILL_TEXT_MAX_WIDTH, PILL_TEXT_WIDTH_CLASS } from './call-pill-text';
import { PILL_TEXT_EXIT } from './call-pill-text-exit';
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

/**
 * G1.3 · G1.11 (#17536, miroir de `CallPillText.staysWhenChromeStowed` d'iOS, #17534) —
 * UN seul verre : la pilule rangée ne s'efface pas quand elle porte des sous-titres ; elle
 * perd sa rangée de base et se resserre autour d'eux. Jamais un second verre à côté.
 */
describe('un seul verre : la pilule rangée garde ses sous-titres (G1.3)', () => {
  test('seuls les sous-titres laissés seuls restent à l’écran quand les commandes se rangent', () => {
    expect(pillStaysWhenChromeStowed('captionsAlone')).toBe(true);
    expect((['none', 'captions', 'journal'] as const).every((text) => !pillStaysWhenChromeStowed(text))).toBe(true);
  });

  test('les sous-titres sont dans le verre : au repos, ou seuls quand la pilule est rangée', () => {
    expect(pillShowsCaptionsBand('captions')).toBe(true);
    expect(pillShowsCaptionsBand('captionsAlone')).toBe(true);
    expect(pillShowsCaptionsBand('none')).toBe(false);
    expect(pillShowsCaptionsBand('journal')).toBe(false);
  });

  test('la rangée de base se retire pour les sous-titres seuls, à chaque couche', () => {
    for (const layer of [IDLE, menu, panel('journal'), panel('react')]) {
      const stowed = text(layer, { chromeShown: false });
      expect(pillStaysWhenChromeStowed(stowed)).toBe(true);
      expect(pillHasBaseRow(stowed)).toBe(false);
    }
    expect((['none', 'captions', 'journal'] as const).every(pillHasBaseRow)).toBe(true);
  });
});

describe('une seule largeur pour le verre (P3.10)', () => {
  test('le verre qui porte du texte, et le verre des sous-titres rangés, tiennent en 560 px — sans condition de fenêtre', () => {
    expect(PILL_TEXT_MAX_WIDTH).toBe(560);
    expect(PILL_TEXT_WIDTH_CLASS).toContain(`${PILL_TEXT_MAX_WIDTH}px`);
  });
});

/**
 * #17406 — RIEN NE DISPARAÎT D'UN COUP : les sous-titres repartent comme ils sont
 * venus, vers la rangée de base, en fondu. Ils se retiennent le temps de la
 * sortie ; la feuille la joue sur la même durée, par la transformation et
 * l'opacité seulement ; sous « Réduire les animations », rien ne se joue.
 */
describe('le texte repart comme il est venu (#17406)', () => {
  const css = readFileSync(new URL('../../styles/call-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const block = (selector: string): string => {
    const start = css.indexOf(selector);
    return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  };
  const keyframes = (name: string): string => {
    const start = css.indexOf(`@keyframes ${name}`);
    return start < 0 ? '' : css.slice(start, css.indexOf('}\n}', start));
  };

  test('un fondu de 200 ms au plus, et aucune attente sous « Réduire les animations »', () => {
    expect(PILL_TEXT_EXIT.exitMs).toBeGreaterThan(0);
    expect(PILL_TEXT_EXIT.exitMs).toBeLessThanOrEqual(200);
    expect(PILL_TEXT_EXIT.reducedExitMs).toBe(0);
  });

  test('la feuille joue la sortie sur la durée que la pilule attend, et le texte qui part ne prend plus le doigt', () => {
    const leaving = block('[data-call-pill-text][data-leaving]');
    expect(leaving).toContain(`call-pill-text-out ${PILL_TEXT_EXIT.exitMs}ms`);
    expect(leaving).toMatch(/pointer-events:\s*none/);
  });

  test('les sous-titres qui repartent gardent la largeur du verre qui porte du texte : la pilule ne se resserre pas sous eux', () => {
    expect(block('[data-call-pill-text="captions"][data-leaving]')).toContain(`${PILL_TEXT_MAX_WIDTH}px`);
  });

  test('la sortie ne bouge que la transformation et l’opacité', () => {
    const out = keyframes('call-pill-text-out');
    expect(out).toContain('opacity: 0');
    expect([...out.matchAll(/([a-z-]+):/g)].map((match) => match[1]).filter((property) => property !== 'opacity' && property !== 'transform')).toEqual([]);
  });
});
