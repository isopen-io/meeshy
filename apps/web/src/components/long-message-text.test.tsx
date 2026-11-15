import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { FLIP_PROPERTIES } from '@/lib/view/flip';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LongMessageText } from './long-message-text';

/**
 * **LE DÉPLIAGE D'UN MESSAGE LONG** (#11314, #16464) : la hauteur ne s'anime
 * pas. Le texte intégral prend sa place d'un coup, le corps s'allume en
 * `opacity`, et le message reste déplié — aucun contrôle ne le replie.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const LONG = `${'Bonjour tout le monde, voici un très long message. '.repeat(30)}Fin.`;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const played: (readonly Keyframe[])[] = [];
let realAnimate: PropertyDescriptor | undefined;
let realRect: PropertyDescriptor | undefined;

beforeAll(async () => {
  ensureHappyDomRegistered();
  realAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  realRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  played.length = 0;
  if (realAnimate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', realAnimate);
  if (realRect === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect');
  else Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', realRect);
});

function stub(): void {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(frames: readonly Keyframe[]) {
      played.push(frames);
      return { cancel: () => undefined };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value(this: HTMLElement) {
      const unfolded = this.closest('[data-long-message]')?.getAttribute('data-long-message') === 'unfolded';
      const top = this.hasAttribute('data-long-message-toggle') ? (unfolded ? 400 : 100) : 50;
      return { left: 10, top, right: 10, bottom: top, width: 0, height: 0, x: 10, y: top, toJSON: () => ({}) };
    },
  });
}

describe('LongMessageText — un toucher déplie, rien ne replie (#16464)', () => {
  test('déplier : le texte intégral prend sa place, le corps s’allume en opacity — aucune hauteur, aucun « Réduire »', async () => {
    stub();
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    await act(async () => root?.render(<LongMessageText messageId="m-1" text={LONG} />));
    expect(played).toHaveLength(0);
    await act(async () => container?.querySelector<HTMLButtonElement>('[data-long-message-toggle]')?.click());
    expect(container.querySelector('[data-long-message]')?.getAttribute('data-long-message')).toBe('unfolded');
    expect(container.textContent).toContain('Fin.');
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('Réduire');
    expect(played).toContainEqual([{ opacity: 0.4 }, { opacity: 1 }]);
    for (const frames of played) for (const key of frames.flatMap((frame) => Object.keys(frame))) expect(FLIP_PROPERTIES).toContain(key);
  });

  test('le bouton disparu, le focus clavier se pose sur le texte déplié — il ne tombe pas sur la page', async () => {
    stub();
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    await act(async () => root?.render(<LongMessageText messageId="m-2" text={LONG} />));
    container.querySelector<HTMLButtonElement>('[data-long-message-toggle]')?.focus();
    await act(async () => container?.querySelector<HTMLButtonElement>('[data-long-message-toggle]')?.click());
    expect(document.activeElement).toBe(container.querySelector('[data-long-message]'));
  });

  test('deux messages dépliés le restent ensemble', async () => {
    stub();
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <>
          <LongMessageText messageId="m-a" text={LONG} />
          <LongMessageText messageId="m-b" text={LONG} />
        </>,
      ),
    );
    for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>('[data-long-message-toggle]'))) {
      await act(async () => button.click());
    }
    const states = Array.from(container.querySelectorAll('[data-long-message]')).map((node) => node.getAttribute('data-long-message'));
    expect(states).toEqual(['unfolded', 'unfolded']);
  });

  test('le bouton se nomme « Lire la suite », annonce son état replié et offre une cible de 44 px', async () => {
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    await act(async () => root?.render(<LongMessageText messageId="m-3" text={LONG} />));
    const button = container.querySelector<HTMLButtonElement>('[data-long-message-toggle]');
    expect(button?.textContent).toBe('Lire la suite');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(button?.classList.contains('min-h-11')).toBe(true);
  });
});
