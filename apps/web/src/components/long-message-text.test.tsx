import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { FLIP_PROPERTIES } from '@/lib/view/flip';
import { collapseUnfolded } from '@/lib/view/unfold-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LongMessageText } from './long-message-text';

/**
 * **LE DÉPLIAGE D'UN MESSAGE LONG SE JOUE EN FLIP** (#11314) : la hauteur ne
 * s'anime plus. Le texte intégral prend sa place d'un coup ; le bouton, seul
 * élément qui change de place, repart de l'ancienne en `transform`, et le
 * corps s'allume en `opacity`.
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
  collapseUnfolded();
  if (realAnimate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', realAnimate);
  if (realRect !== undefined) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', realRect);
});

function stub(): void {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(frames: readonly Keyframe[]) {
      played.push(frames);
      return { cancel: () => undefined };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const unfolded = this.closest('[data-long-message]')?.getAttribute('data-long-message') === 'unfolded';
      const top = this.hasAttribute('data-long-message-toggle') ? (unfolded ? 400 : 100) : 50;
      return { left: 10, top, right: 10, bottom: top, width: 0, height: 0, x: 10, y: top, toJSON: () => ({}) };
    },
  });
}

describe('LongMessageText — dépliage et repli', () => {
  test('déplier : le bouton repart de sa place d’avant en transform, le corps s’allume en opacity — aucune hauteur', async () => {
    stub();
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    await act(async () => root?.render(<LongMessageText messageId="m-1" text={LONG} />));
    expect(played).toHaveLength(0);
    await act(async () => container?.querySelector<HTMLButtonElement>('[data-long-message-toggle]')?.click());
    expect(container.querySelector('[data-long-message]')?.getAttribute('data-long-message')).toBe('unfolded');
    expect(played).toContainEqual([{ transform: 'translate(0px, -300px)' }, { transform: 'none' }]);
    expect(played).toContainEqual([{ opacity: 0.4 }, { opacity: 1 }]);
    for (const frames of played) for (const key of frames.flatMap((frame) => Object.keys(frame))) expect(FLIP_PROPERTIES).toContain(key);
  });

  test('replier : le bouton remonte de 300 px, repart du bas', async () => {
    stub();
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    await act(async () => root?.render(<LongMessageText messageId="m-2" text={LONG} />));
    const toggle = () => container?.querySelector<HTMLButtonElement>('[data-long-message-toggle]')?.click();
    await act(async () => toggle());
    played.length = 0;
    await act(async () => toggle());
    expect(played).toContainEqual([{ transform: 'translate(0px, 300px)' }, { transform: 'none' }]);
  });
});
