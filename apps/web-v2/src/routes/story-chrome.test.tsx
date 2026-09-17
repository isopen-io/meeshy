import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SoundToggle } from './story-parts';

/**
 * `SoundToggle` (T10, #6899) — le bouton MUET de la ligne auteur du lecteur
 * de story (§ 1.6 de la spécification `stories-lecteur`, rail droit HORS
 * TRANCHE #5817) : miroir du bouton `speaker.slash.fill`/`speaker.wave.2.fill`
 * de `StoryViewerView+Sidebar.swift:486-509` — un contrôle existe s'il a un
 * EFFET (loi 4), jamais un décor.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(node: React.ReactElement): HTMLDivElement {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(node);
  });
  return c;
}

describe('SoundToggle — un bouton MUET avec un effet, jamais un décor', () => {
  test('`aria-pressed` reflète `muted`, et le clic appelle `onToggle`', () => {
    let toggled = 0;
    const el = mount(<SoundToggle muted onToggle={() => (toggled += 1)} />);
    const button = el.querySelector('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(toggled).toBe(1);
  });

  test('non muet : `aria-pressed="false"`', () => {
    const el = mount(<SoundToggle muted={false} onToggle={() => {}} />);
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('la cible tient au moins 44×44 (dimension 5, cibles atteignables)', () => {
    const el = mount(<SoundToggle muted onToggle={() => {}} />);
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.style.width).toBe('44px');
    expect(button.style.height).toBe('44px');
  });

  test('un bouton BASCULE : le libellé « Muet » est CONSTANT, seul `aria-pressed` change', () => {
    const coupe = mount(<SoundToggle muted onToggle={() => {}} />).querySelector('button');
    expect(coupe?.getAttribute('aria-label')).toBe('Muet');
    expect(coupe?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      root.unmount();
    });
    container.remove();
    const joue = mount(<SoundToggle muted={false} onToggle={() => {}} />).querySelector('button');
    expect(joue?.getAttribute('aria-label')).toBe('Muet');
    expect(joue?.getAttribute('aria-pressed')).toBe('false');
  });
});
