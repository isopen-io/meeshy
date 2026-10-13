import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { chromeReserveOnScreen } from '@/lib/calls/frames/frame-chrome-reserve';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { montageChromeReserve } from './use-montage-frames';

/**
 * LES BANDES DES COMMANDES DU MODE MONTAGE, MESURÉES (#10481) — en haut
 * l'encart sûr de l'écran d'appel, en bas la plus haute commande VISIBLE :
 * un statut vide, transparent, ne couvre aucun texte du cadre.
 */

const placed = (element: Element, top: number, height: number): Element => {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ left: 0, top, width: 440, height, x: 0, y: top, right: 440, bottom: top + height }) });
  return element;
};

describe('montageChromeReserve', () => {
  beforeAll(() => ensureHappyDomRegistered());
  afterAll(async () => releaseHappyDomIfRegistered());

  const screen = { viewport: { width: 440, height: 956 }, canvas: { width: 540, height: 960 } };

  const controlsWith = (status: 'shown' | 'empty') => {
    const controls = document.createElement('div');
    const line = placed(document.createElement('p'), 606, 32);
    line.setAttribute('style', status === 'empty' ? 'opacity: 0' : 'opacity: 1');
    controls.append(line, placed(document.createElement('div'), 650, 52), placed(document.createElement('div'), 714, 124), placed(document.createElement('div'), 850, 48));
    document.body.append(controls);
    return controls;
  };

  const stage = () => {
    const element = document.createElement('div');
    element.setAttribute('style', 'padding-top: 62px');
    document.body.append(element);
    return element;
  };

  test('un statut vide ne compte pas : la bande basse part de la première commande visible', () => {
    const reserve = montageChromeReserve({ stage: stage(), controls: controlsWith('empty'), ...screen });
    expect(reserve).toEqual(chromeReserveOnScreen({ ...screen, top: 62, bottom: 956 - 650 }));
    expect(reserve.bottom).toBeGreaterThan(0);
  });

  test('un statut affiché couvre, lui', () => {
    expect(montageChromeReserve({ stage: stage(), controls: controlsWith('shown'), ...screen })).toEqual(chromeReserveOnScreen({ ...screen, top: 62, bottom: 956 - 606 }));
  });

  test('sans commandes mesurées, aucune bande', () => {
    expect(montageChromeReserve({ stage: null, controls: null, ...screen })).toEqual({ top: 0, bottom: 0 });
  });
});
