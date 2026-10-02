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

const avatar = (state: { readonly here?: boolean; readonly hereActive?: boolean; readonly presence?: UserPresenceStatus }) => (
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
    expect(keyframes.length).toBe(4);
    const animated = keyframes.flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]));
    expect(new Set(animated)).toEqual(new Set(['transform', 'opacity']));
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*presence-dot/);
  });
});

/**
 * **DEUX FOIS PLUS GROS, POSÉ SUR LE CERCLE, ET VIVANT QUAND IL SE PASSE QUELQUE
 * CHOSE** (#9061, demande porteur 2026-10-01).
 */
describe('le point indigo « ici »', () => {
  const geometry = (dot: Element | null) => {
    const style = (dot as HTMLElement | null)?.style;
    const width = Number.parseFloat(style?.width ?? 'NaN');
    return { width, centre: Number.parseFloat(style?.left ?? 'NaN') + width / 2, middle: Number.parseFloat(style?.top ?? 'NaN') + width / 2 };
  };

  test('il est deux fois plus gros que les autres points de présence', async () => {
    const here = geometry((await mounter.mount(avatar({ here: true }))).querySelector('[data-presence="here"]'));
    const online = geometry((await mounter.mount(avatar({ presence: 'online' }))).querySelector('[data-presence="online"]'));
    expect(here.width).toBeCloseTo(online.width * 2, 5);
  });

  test('son centre est sur le cercle, à 45°', async () => {
    const { centre, middle } = geometry((await mounter.mount(avatar({ here: true }))).querySelector('[data-presence="here"]'));
    const onCircle = 22 + 22 * Math.cos(Math.PI / 4);
    expect(centre).toBeCloseTo(onCircle, 1);
    expect(middle).toBeCloseTo(onCircle, 1);
  });

  test('il pulse tant que le pair regarde, écoute ou agit — et seulement alors', async () => {
    const host = await mounter.mount(avatar({ here: true }));
    expect(host.querySelector('[data-presence="here"]')?.className).not.toContain('presence-dot-active');

    await mounter.rerender(host, avatar({ here: true, hereActive: true }));
    const dot = host.querySelector('[data-presence="here"]');
    expect(dot?.className).toContain('presence-dot-active');
    expect(dot?.getAttribute('data-presence-active')).toBe('true');

    await mounter.rerender(host, avatar({ here: true }));
    expect(host.querySelector('[data-presence="here"]')?.className).not.toContain('presence-dot-active');
  });

  test('l’activité seule, sans « ici », ne fait rien pulser', async () => {
    const host = await mounter.mount(avatar({ presence: 'online', hereActive: true }));
    expect(host.querySelector('[data-presence]')?.className).not.toContain('presence-dot-active');
  });

  test('la pulsation se répète et se tait en mouvement réduit', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.presence-dot-active::after\s*\{[^}]*animation:\s*presence-dot-pulse[^;]*infinite/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*presence-dot-active/);
  });
});
