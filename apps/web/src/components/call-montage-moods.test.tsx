import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MoodChips } from './call-montage-moods';

/**
 * LES PUCES D'AMBIANCE DU MODE MONTAGE (#8742, spec § 3) — une rangée de
 * boutons pressés ou non, « Classiques » en tête ; toucher une puce la
 * choisit, les flèches passent à la voisine (sens inversé en arabe), Début
 * et Fin aux bouts ; chaque puce fait 44 au moins et répond dès le doigt posé.
 */

const CHIPS = [
  { id: 'classics', label: 'Classiques' },
  { id: 'signature', label: 'Signature' },
  { id: 'jovial', label: 'Jovial' },
];

describe('MoodChips', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (options: { readonly selected?: string; readonly dir?: 'rtl' | 'ltr' } = {}) => {
    const picked: string[] = [];
    const host = document.createElement('div');
    if (options.dir !== undefined) {
      host.setAttribute('dir', options.dir);
      host.style.direction = options.dir;
    }
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<MoodChips label="Ambiances" chips={CHIPS} selected={options.selected ?? 'classics'} onPick={(id) => void picked.push(id)} />));
    const chips = () => [...host.querySelectorAll<HTMLButtonElement>('[data-call-frame-mood]')];
    const key = (target: Element, name: string) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, chips, key, picked, done };
  };

  test('un groupe nommé de boutons pressés ou non ; « Classiques » d’abord', () => {
    const view = mount({ selected: 'signature' });
    const group = view.host.querySelector('[data-call-frame-moods]');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Ambiances');
    expect(view.chips().map((chip) => [chip.textContent, chip.getAttribute('aria-pressed'), chip.tabIndex])).toEqual([
      ['Classiques', 'false', -1],
      ['Signature', 'true', 0],
      ['Jovial', 'false', -1],
    ]);
    view.done();
  });

  test('chaque puce est une cible de 44 au moins, qui répond dès le doigt posé', () => {
    const view = mount();
    view.chips().forEach((chip) => {
      expect(chip.getAttribute('type')).toBe('button');
      expect(chip.className).toContain('min-h-11');
      expect(chip.className).toContain('min-w-11');
      expect(chip.className).toContain('touch-manipulation');
      expect(chip.className).toContain('active:scale-95');
    });
    view.done();
  });

  test('toucher une puce la choisit', () => {
    const view = mount();
    act(() => view.chips()[2]?.click());
    expect(view.picked).toEqual(['jovial']);
    view.done();
  });

  test('les flèches passent à la voisine, Début et Fin aux bouts — sans rien choisir', () => {
    const view = mount();
    const [first, second, third] = view.chips();
    if (first === undefined || second === undefined || third === undefined) throw new Error('trois puces');
    first.focus();
    view.key(first, 'ArrowRight');
    expect(document.activeElement).toBe(second);
    view.key(second, 'End');
    expect(document.activeElement).toBe(third);
    view.key(third, 'Home');
    expect(document.activeElement).toBe(first);
    expect(view.picked).toEqual([]);
    view.done();
  });

  test('en arabe, la flèche de gauche avance', () => {
    const view = mount({ dir: 'rtl' });
    const [first, second] = view.chips();
    if (first === undefined || second === undefined) throw new Error('deux puces');
    first.focus();
    view.key(first, 'ArrowLeft');
    expect(document.activeElement).toBe(second);
    view.done();
  });
});
