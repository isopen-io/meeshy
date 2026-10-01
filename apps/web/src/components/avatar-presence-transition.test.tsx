import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { UserPresenceStatus } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';

/**
 * **LE POINT DE PRÉSENCE CHANGE EN SE MONTRANT** (#9047) — demande porteur du
 * 2026-10-01 : le point indigo « ici » PULSE en arrivant ; quand il s'en va, il
 * DIMINUE et le point vert APPARAÎT en rebondissant. Au premier rendu, rien ne
 * bouge : une liste qui s'affiche ne doit pas sautiller.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/c' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const avatar = (state: { readonly here?: boolean; readonly presence?: UserPresenceStatus }) => (
  <Avatar initials="AD" color="#4F46E5" size={44} {...state} />
);

describe('le point de présence en mouvement', () => {
  test('au premier rendu, le point est là sans animation', async () => {
    const host = await mounter.mount(avatar({ here: true, presence: 'online' }));
    const dot = host.querySelector('[data-presence]');
    expect(dot?.getAttribute('data-presence')).toBe('here');
    expect(dot?.className).not.toContain('presence-dot-enter');
  });

  test('un re-rendu sans changement d’état n’anime rien', async () => {
    const host = await mounter.mount(avatar({ here: true, presence: 'online' }));
    await mounter.rerender(host, avatar({ here: true, presence: 'online' }));
    expect(host.querySelector('[data-presence]')?.className).not.toContain('presence-dot-enter');
  });

  test('l’indigo qui arrive pulse : il rebondit et porte son onde', async () => {
    const host = await mounter.mount(avatar({ presence: 'online' }));
    await mounter.rerender(host, avatar({ here: true, presence: 'online' }));
    const dot = host.querySelector('[data-presence="here"]');
    expect(dot?.className).toContain('presence-dot-enter');
    expect(dot?.className).toContain('presence-dot-here');
  });

  test('l’indigo qui part diminue pendant que le vert apparaît en rebondissant, puis s’efface', async () => {
    const host = await mounter.mount(avatar({ here: true, presence: 'online' }));
    await mounter.rerender(host, avatar({ presence: 'online' }));
    expect(host.querySelector('[data-presence-leaving="here"]')?.className).toContain('presence-dot-leave');
    expect(host.querySelector('[data-presence="online"]')?.className).toContain('presence-dot-enter');

    await new Promise((resolve) => setTimeout(resolve, 300));
    await mounter.settle();
    expect(host.querySelector('[data-presence-leaving]')).toBeNull();
  });

  test('un point qui disparaît tout à fait diminue aussi', async () => {
    const host = await mounter.mount(avatar({ here: true }));
    await mounter.rerender(host, avatar({ presence: 'offline' }));
    expect(host.querySelector('[data-presence-leaving="here"]')).not.toBeNull();
    expect(host.querySelector('[data-presence]')).toBeNull();
  });

  test('les animations ne touchent que transform et opacity, et se taisent en mouvement réduit', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    const keyframes = [...css.matchAll(/@keyframes presence-dot[^{]+\{([\s\S]*?)\n\}/g)].map((match) => match[1] ?? '');
    expect(keyframes.length).toBe(3);
    const animated = keyframes.flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]));
    expect(new Set(animated)).toEqual(new Set(['transform', 'opacity']));
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*presence-dot/);
  });
});
