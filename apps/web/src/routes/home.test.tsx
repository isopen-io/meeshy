import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { SESSION_STORAGE_KEY } from '@/lib/api/session';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import HomeScreen from './home';
import HomeShellScreen from './home-shell';

/**
 * `/` QUAND L'APPLICATION LA TIENT (#10002) — dans la coque, la liste ; sur le
 * web, la MÊME landing que le prérendu, comportement compris.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();
const realFetch = globalThis.fetch;

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'https://meeshy.example/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  unmountAll();
  globalThis.fetch = realFetch;
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const answer = (status: number, body: unknown): typeof fetch =>
  Object.assign(() => Promise.resolve(new Response(JSON.stringify(body), { status })), { preconnect: () => undefined });

describe('/ dans la coque (#10002)', () => {
  test('ouvre la liste des conversations sur /chats, sans laisser / dans l’historique', async () => {
    window.history.replaceState(null, '', '/');
    const before = window.history.length;
    await mount(<HomeShellScreen />);
    expect(window.location.pathname).toBe('/chats');
    expect(window.history.length).toBe(before);
  });
});

describe('/ sur le web, servie par la coquille (#10002)', () => {
  test('rend la landing, et un compte y trouve « Mes conversations » vers /chats', async () => {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: 't', sessionToken: 's', user: { id: 'u', username: 'u' }, expiresAt: Date.now() + 60_000 }),
    );
    globalThis.fetch = answer(200, {
      success: true,
      data: { identifier: 'world', title: 'World Wide', shareLinkIdentifier: 'mshy_x', memberCount: 250, memberCountCapped: true },
    });
    const host = await mount(<HomeScreen />);
    await settle();
    expect(host.querySelector('[data-landing]')).not.toBe(null);
    expect(document.documentElement.getAttribute('data-session')).toBe('member');
    expect(host.querySelector('[data-my-conversations]')?.getAttribute('href')).toBe('/chats');
    expect(host.querySelector('[data-world-count]')?.textContent).toContain('250+');
  });

  test('l’application installée (PWA d’avant #10002, start_url sur /) ouvre /chats sans peindre la landing', async () => {
    globalThis.fetch = answer(500, null);
    const realMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) => {
      const real = realMatchMedia.call(window, query);
      return Object.create(real, { matches: { value: query === '(display-mode: standalone)' } });
    };
    try {
      const before = window.history.length;
      const host = await mount(<HomeScreen />);
      expect(host.querySelector('[data-landing]')).toBe(null);
      expect(window.location.pathname).toBe('/chats');
      expect(window.history.length).toBe(before);
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });

  test('quitter l’écran retire l’état de session posé sur le document', async () => {
    globalThis.fetch = answer(404, { success: false, error: 'x', code: 'WORLD_UNAVAILABLE', message: 'x' });
    await mount(<HomeScreen />);
    await settle();
    const qr = [...document.querySelectorAll('[data-world-qr]')];
    expect(qr.length).toBe(2);
    expect(qr.every((node) => node.hasAttribute('hidden'))).toBe(true);
    expect(document.querySelector('[data-world-form]')).toBe(null);
    unmountAll();
    expect(document.documentElement.hasAttribute('data-session')).toBe(false);
  });
});
