import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { NotificationSwipe } from './notification-swipe';

/**
 * **GLISSER UNE NOTIFICATION VERS LA GAUCHE LA SUPPRIME** (#8960) — la rangée
 * montée en DOM réel : au-delà du seuil, relâcher appelle `onDelete` une fois ;
 * en deçà, rien ; un geste vertical appartient au défilement ; la souris ne
 * glisse pas (elle a le menu) ; le clic qui suit un glissé est avalé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const pointer = (type: string, x: number, y: number, pointerType = 'touch') =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 3, pointerType, isPrimary: true });

async function monter(onDelete: () => void, onClick: () => void = () => undefined) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <NotificationSwipe onDelete={onDelete} background="white">
        <button type="button" onClick={onClick}>
          rangée
        </button>
      </NotificationSwipe>,
    ),
  );
  const surface = container.querySelector('[data-notification-swipe]');
  if (surface === null) throw new Error('surface absente');
  return surface;
}

async function glisser(surface: Element, path: readonly (readonly [number, number])[], pointerType = 'touch') {
  const [first, ...rest] = path;
  if (first === undefined) return;
  await act(async () => surface.dispatchEvent(pointer('pointerdown', first[0], first[1], pointerType)));
  for (const [x, y] of rest) await act(async () => surface.dispatchEvent(pointer('pointermove', x, y, pointerType)));
  const last = rest[rest.length - 1] ?? first;
  await act(async () => surface.dispatchEvent(pointer('pointerup', last[0], last[1], pointerType)));
}

describe('NotificationSwipe', () => {
  test('au-delà de 66 px vers la gauche, relâcher SUPPRIME — une fois', async () => {
    let deleted = 0;
    const surface = await monter(() => (deleted += 1));
    await act(async () => surface.dispatchEvent(pointer('pointerdown', 200, 10)));
    await act(async () => surface.dispatchEvent(pointer('pointermove', 120, 12)));
    expect(container?.querySelector('[data-notification-swipe-indicator]')?.getAttribute('data-notification-swipe-indicator')).toBe('armed');
    await act(async () => surface.dispatchEvent(pointer('pointerup', 120, 12)));
    expect(deleted).toBe(1);
    expect(container?.querySelector('[data-notification-swipe-indicator]')).toBeNull();
  });

  test('relâché avant le seuil, rien n’est supprimé et la rangée revient au repos', async () => {
    let deleted = 0;
    const surface = await monter(() => (deleted += 1));
    await glisser(surface, [[200, 10], [160, 10]]);
    expect(deleted).toBe(0);
    expect(container?.querySelector<HTMLElement>('[data-notification-swipe-content]')?.style.transform ?? '').toBe('');
  });

  test('vers la droite, la rangée ne bouge pas', async () => {
    let deleted = 0;
    const surface = await monter(() => (deleted += 1));
    await glisser(surface, [[10, 10], [120, 10]]);
    expect(deleted).toBe(0);
  });

  test('un glissé vertical appartient au défilement', async () => {
    let deleted = 0;
    const surface = await monter(() => (deleted += 1));
    await glisser(surface, [[200, 10], [120, 80]]);
    expect(deleted).toBe(0);
  });

  test('la souris ne glisse pas — elle a le menu de la rangée', async () => {
    let deleted = 0;
    const surface = await monter(() => (deleted += 1));
    await glisser(surface, [[200, 10], [100, 10]], 'mouse');
    expect(deleted).toBe(0);
  });

  test('le clic qui suit un glissé n’ouvre pas la rangée', async () => {
    let opened = 0;
    const surface = await monter(
      () => undefined,
      () => (opened += 1),
    );
    await glisser(surface, [[200, 10], [160, 10]]);
    await act(async () => container?.querySelector('button')?.click());
    expect(opened).toBe(0);
  });
});
