import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { gamePrefs } from '@/lib/game/preferences';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActAdvancePill } from './act-advance-pill';

/**
 * L'ACTE QUI AVANCE (#17367) — après un envoi, la conversation dit « Acte II · 3 sur 5 » puis l'efface. Rien sans
 * envoi, rien sous « Jeu masqué », rien quand l'acte n'avance pas.
 */
beforeAll(() => ensureHappyDomRegistered());
afterAll(() => releaseHappyDomIfRegistered());

const block = (medium: number) => ({
  game: {
    missions: {
      dayKey: '2026-11-18',
      unlocked: true,
      items: [{ id: 'b', difficulty: 'medium', progress: medium, target: 5, completedAt: null }],
    },
  },
});

const fakeCache = (initial: unknown) => {
  let data = initial;
  const listeners = new Set<() => void>();
  return {
    source: {
      read: () => data,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    write: (next: unknown) => {
      data = next;
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mount = async (cache: ReturnType<typeof fakeCache>, sent: number, times = { armedMs: 200, shownMs: 60 }) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  const render = (next: number) => act(async () => root.render(<ActAdvancePill sent={next} source={cache.source} language="fr" {...times} />));
  await render(sent);
  return {
    host,
    render,
    text: () => host.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
};

describe('ActAdvancePill', () => {
  test('un envoi suivi d’un acte qui avance montre « Acte II · 3 sur 5 », lu par le lecteur d’écran, puis l’efface', async () => {
    const cache = fakeCache(block(2));
    const view = await mount(cache, 0);
    await view.render(1);
    await act(async () => cache.write(block(3)));
    expect(view.text()).toBe('Acte II · 3 sur 5');
    expect(view.host.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => wait(120));
    expect(view.text()).toBe('');
    await view.unmount();
  });

  test('sans envoi, un acte qui avance ailleurs ne dit rien', async () => {
    const cache = fakeCache(block(2));
    const view = await mount(cache, 0);
    await act(async () => cache.write(block(3)));
    expect(view.text()).toBe('');
    await view.unmount();
  });

  test('un envoi qui ne fait avancer aucun acte ne dit rien, et le guet se désarme', async () => {
    const cache = fakeCache(block(2));
    const view = await mount(cache, 0);
    await view.render(1);
    await act(async () => cache.write(block(2)));
    expect(view.text()).toBe('');
    await act(async () => wait(260));
    expect(cache.listeners.size).toBe(0);
    await act(async () => cache.write(block(3)));
    expect(view.text()).toBe('');
    await view.unmount();
  });

  test('« Jeu masqué » : rien, même quand l’acte avance', async () => {
    gamePrefs.set({ hidden: true });
    try {
      const cache = fakeCache(block(2));
      const view = await mount(cache, 0);
      await view.render(1);
      await act(async () => cache.write(block(3)));
      expect(view.text()).toBe('');
      await view.unmount();
    } finally {
      gamePrefs.set({ hidden: false });
    }
  });

  test('quitter la conversation retire le guet', async () => {
    const cache = fakeCache(block(2));
    const view = await mount(cache, 0);
    await view.render(1);
    expect(cache.listeners.size).toBe(1);
    await view.unmount();
    expect(cache.listeners.size).toBe(0);
  });
});
