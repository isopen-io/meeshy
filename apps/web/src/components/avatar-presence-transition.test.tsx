import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { UserPresenceStatus } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar, HEADER_HERE_DOT_RATIO } from './avatar';

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

const avatar = (state: {
  readonly here?: boolean;
  readonly hereActive?: boolean;
  readonly hereFocused?: boolean;
  readonly hereDotRatio?: number;
  readonly presence?: UserPresenceStatus;
  readonly mood?: string;
}) => (
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
    expect(keyframes.length).toBe(6);
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

  test('en plein écran, il se stabilise et pulse imperceptiblement — le plein écran prime sur l’activité', async () => {
    const host = await mounter.mount(avatar({ here: true, hereActive: true, hereFocused: true }));
    const dot = host.querySelector('[data-presence="here"]');
    expect(dot?.className).toContain('presence-dot-focused');
    expect(dot?.className).not.toContain('presence-dot-active');

    await mounter.rerender(host, avatar({ here: true }));
    expect(host.querySelector('[data-presence="here"]')?.className).not.toContain('presence-dot-focused');
  });

  test('une seule échelle d’onde : imperceptible < repos < vive', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    const peak = (name: string) => Number(new RegExp(`@keyframes ${name}[\\s\\S]*?100%[^}]*scale\\(([\\d.]+)\\)`).exec(css)?.[1]);
    const start = (name: string) => Number(new RegExp(`@keyframes ${name}[\\s\\S]*?0%[^}]*opacity:\\s*([\\d.]+)`).exec(css)?.[1]);
    expect(peak('presence-dot-hush')).toBeCloseTo(1.25, 5);
    expect(start('presence-dot-hush')).toBeCloseTo(0.2, 5);
    expect(peak('presence-dot-hush')).toBeLessThan(peak('presence-dot-rest'));
    expect(peak('presence-dot-rest')).toBeLessThan(peak('presence-dot-pulse'));
    expect(start('presence-dot-hush')).toBeLessThan(start('presence-dot-rest'));
    expect(css).toMatch(/\.presence-dot-focused::before\s*\{[^}]*animation:\s*presence-dot-hush 2\.8s[^;]*infinite/);
    expect(css).toMatch(/\.presence-dot-focused::after\s*\{[^}]*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*presence-dot-focused/);
  });

  test('l’arrivée ici est un gros pulse : anneau de 3 px, ×3 en 0,9 s', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.presence-dot-here\.presence-dot-enter::after\s*\{[^}]*border:\s*3px[^}]*animation:\s*presence-dot-ripple 0\.9s/);
    expect(Number(/@keyframes presence-dot-ripple[\s\S]*?100%[^}]*scale\(([\d.]+)\)/.exec(css)?.[1])).toBeCloseTo(3, 5);
  });

  test('l’activité seule, sans « ici », ne fait rien pulser', async () => {
    const host = await mounter.mount(avatar({ presence: 'online', hereActive: true }));
    expect(host.querySelector('[data-presence]')?.className).not.toContain('presence-dot-active');
  });

  test('au repos, « ici » garde un petit pulse ; actif, il pulse bien plus fort (#9065)', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.presence-dot-here::before\s*\{[^}]*animation:\s*presence-dot-rest[^;]*infinite/);
    const peak = (name: string) => Number(new RegExp(`@keyframes ${name}[\\s\\S]*?100%[^}]*scale\\(([\\d.]+)\\)`).exec(css)?.[1]);
    expect(peak('presence-dot-pulse')).toBeGreaterThan(peak('presence-dot-rest') + 0.8);
    expect(css).toMatch(/\.presence-dot-active::before\s*\{[^}]*animation:\s*none/);
  });

  test('dans l’en-tête, le point « ici » est plus discret (#9065)', async () => {
    const host = await mounter.mount(avatar({ here: true, hereDotRatio: HEADER_HERE_DOT_RATIO }));
    const width = Number.parseFloat((host.querySelector('[data-presence="here"]') as HTMLElement).style.width);
    expect(width).toBeCloseTo(44 * 0.4, 1);
  });

  test('la pulsation se répète et se tait en mouvement réduit', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.presence-dot-active::after\s*\{[^}]*animation:\s*presence-dot-pulse[^;]*infinite/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*presence-dot-active/);
  });
});

/**
 * **LE MOOD ARRIVE ET PART COMME LE POINT** (#9065, demande porteur 2026-10-02) :
 * même chorégraphie, le mood au milieu.
 */
describe('le mood en mouvement avec « ici »', () => {
  test('au premier rendu, rien ne bouge', async () => {
    const host = await mounter.mount(avatar({ here: true, mood: '☕' }));
    expect(host.querySelector('[data-mood]')?.className).not.toContain('mood-enter');
    expect(host.querySelector('[data-mood-leaving]')).toBeNull();
  });

  test('l’arrivée ici : le badge rebondit et porte l’onde indigo', async () => {
    const host = await mounter.mount(avatar({ presence: 'online', mood: '☕' }));
    await mounter.rerender(host, avatar({ here: true, presence: 'online', mood: '☕' }));
    const badge = host.querySelector('[data-mood]');
    expect(badge?.className).toContain('mood-enter');
    expect(badge?.className).toContain('mood-arrive');
    expect(host.querySelector('[data-mood-glyph]')?.getAttribute('data-mood-outline')).toBe('here');
  });

  test('le départ : le badge indigo se rétracte, puis revient en rebondissant, cerné de vert', async () => {
    const host = await mounter.mount(avatar({ here: true, presence: 'online', mood: '☕' }));
    await mounter.rerender(host, avatar({ presence: 'online', mood: '☕' }));
    const leaving = host.querySelector('[data-mood-leaving]');
    expect(leaving?.className).toContain('mood-leave');
    expect(leaving?.querySelector('[data-mood-glyph]')?.getAttribute('data-mood-outline')).toBe('here');
    const badge = host.querySelector('[data-mood]');
    expect(badge?.className).toContain('mood-enter');
    expect(badge?.className).not.toContain('mood-arrive');
    expect(host.querySelector('[data-mood] [data-mood-glyph]')?.getAttribute('data-mood-outline')).toBe('online');

    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(host.querySelector('[data-mood-leaving]')).toBeNull();
  });

  test('un changement d’activité seul ne rejoue pas l’arrivée', async () => {
    const host = await mounter.mount(avatar({ here: true, mood: '☕' }));
    await mounter.rerender(host, avatar({ here: true, hereActive: true, mood: '☕' }));
    expect(host.querySelector('[data-mood]')?.className).not.toContain('mood-enter');
  });

  test('transform et opacité seulement, et le mouvement réduit coupe l’arrivée et le départ', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.mood-enter\s*\{[^}]*animation:\s*presence-dot-bounce/);
    expect(css).toMatch(/\.mood-leave\s*\{[^}]*animation:\s*presence-dot-shrink/);
    expect(css).toMatch(/\.mood-arrive::after\s*\{[^}]*border:\s*3px[^}]*animation:\s*presence-dot-ripple 0\.9s/);
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\n\}/.exec(css)?.[1] ?? '';
    expect(reduced).toContain('.mood-enter');
    expect(reduced).toContain('.mood-leave');
    expect(reduced).toContain('.mood-arrive::after');
  });
});
