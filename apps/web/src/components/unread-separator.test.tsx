import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UnreadSeparator } from './unread-separator';

/**
 * `<UnreadSeparator>` — le RENDU de « — N messages non lus — » (#7202, D-L3),
 * en couleur PRIMAIRE (`--color-ios-brand`), jamais l'accent de la
 * conversation : c'est CE composant que `thread-modes.tsx` monte juste avant
 * la rangée qui ouvre la frontière (témoin séparé,
 * `routes/thread-modes-unread-separator.test.tsx`, sur le chemin produit).
 * Ici, seul le RENDU du composant nu, en isolation — même répartition que
 * `feed-new-posts-banner.test.tsx` / `thread-chrome.tsx` (DayPill).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const monter = async (label: string): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<UnreadSeparator label={label} />));
  return container;
};

describe('UnreadSeparator', () => {
  test('rend le libellé reçu, texte, sans le recomposer', async () => {
    const host = await monter('3 messages non lus');
    expect(host.querySelector('[data-unread-separator]')?.textContent).toBe('3 messages non lus');
  });

  test('la couleur est le jeton PRIMAIRE — jamais une couleur en dur, jamais --accent-*', async () => {
    const host = await monter('1 message non lu');
    const pill = host.querySelector<HTMLElement>('[data-unread-separator] span');
    expect(pill?.style.backgroundColor).toBe('var(--color-ios-brand)');
  });

  test('c’est un repère de navigation pour un lecteur d’écran, comme la pilule de jour', async () => {
    const host = await monter('2 messages non lus');
    const pill = host.querySelector('[data-unread-separator] span');
    expect(pill?.getAttribute('role')).toBe('heading');
    expect(pill?.getAttribute('aria-level')).toBe('2');
  });
});
