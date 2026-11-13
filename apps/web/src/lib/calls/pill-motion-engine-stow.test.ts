import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { fadeStow } from './pill-motion-engine';

/**
 * LE FONDU COURT DU CHROME RANGÉ (#17536) ne touche pas ce que le plein écran garde visible (U2.4) : la capsule
 * « Revenir à la grille · Quitter le plein écran » porte `data-call-chrome-keep`, et rangée avec le reste elle
 * clignoterait sous « Réduire les animations ».
 */

beforeAll(() => ensureHappyDomRegistered());
afterAll(() => releaseHappyDomIfRegistered());

describe('fadeStow — sous « Réduire les animations »', () => {
  test('le chrome rangé s’efface en un fondu court, sauf ce que le plein écran garde', () => {
    const real = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const root = document.createElement('div');
    root.innerHTML = '<div id="header" data-call-stow="top"></div><div id="capsule" data-call-chrome-fade data-call-chrome-keep></div><div id="menu" data-call-chrome-fade></div>';
    document.body.appendChild(root);
    const faded: string[] = [];
    const real_animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value(this: Element) { faded.push(this.id); return {}; } });
    fadeStow(root, true);
    expect(faded.sort()).toEqual(['header', 'menu']);
    if (real_animate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', real_animate);
    window.matchMedia = real;
    root.remove();
  });
});
