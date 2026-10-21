import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createRainEngine } from './rain';
import { mountMoodRain, type RainScheduler } from './rain-dom';

/**
 * **LA PLUIE DANS LE DOM** (#10813) — chaque instance du moteur est UN nœud ;
 * le nœud d'une instance arrivée à son fondu est RETIRÉ du document, et le
 * démontage ne laisse ni nœud, ni image demandée. Mesuré sur le DOM, pas sur
 * le moteur : c'est le DOM qui retient la mémoire.
 */

beforeAll(() => ensureHappyDomRegistered());
afterAll(() => releaseHappyDomIfRegistered());

/** Une horloge d'images pilotée à la main : `step(now)` rejoue l'image demandée. */
const manualFrames = () => {
  let pending: { id: number; callback: (now: number) => void } | null = null;
  let nextId = 1;
  const cancelled: number[] = [];
  const scheduler: RainScheduler = {
    frame: (callback) => {
      const id = nextId;
      nextId += 1;
      pending = { id, callback };
      return id;
    },
    cancel: (id) => {
      cancelled.push(id);
      if (pending?.id === id) pending = null;
    },
  };
  const step = (now: number) => {
    const current = pending;
    pending = null;
    current?.callback(now);
  };
  return { scheduler, step, cancelled, hasPending: () => pending !== null };
};

const viewport = { width: 400, height: 800 };
const glyphs = (host: HTMLElement) => host.querySelectorAll('[data-mood-rain-glyph]');

const mount = (options: { readonly max: number; readonly lifeMs: number; readonly spawnEveryMs: number }) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const frames = manualFrames();
  const engine = createRainEngine({ viewport: () => viewport, random: () => 0.5, maxParticles: options.max, spawnEveryMs: options.spawnEveryMs, lifeMs: options.lifeMs });
  const dispose = mountMoodRain(host, { emoji: '🎉', engine, viewport: () => viewport, scheduler: frames.scheduler });
  return { host, frames, dispose };
};

describe('mountMoodRain', () => {
  test('le nombre de nœuds d’emoji ne dépasse jamais la borne', () => {
    const { host, frames, dispose } = mount({ max: 5, lifeMs: 10_000, spawnEveryMs: 10 });
    let peak = 0;
    for (let now = 0; now <= 2000; now += 16) {
      frames.step(now);
      peak = Math.max(peak, glyphs(host).length);
    }
    expect(peak).toBe(5);
    dispose();
  });

  test('un nœud arrivé à son fondu est retiré du document', () => {
    const { host, frames, dispose } = mount({ max: 1, lifeMs: 1000, spawnEveryMs: 100_000 });
    frames.step(0);
    const node = glyphs(host)[0] as HTMLElement | undefined;
    expect(node?.textContent).toBe('🎉');
    frames.step(600);
    expect(glyphs(host)).toHaveLength(1);
    expect(Number(node!.style.opacity)).toBeLessThan(1);
    frames.step(1300);
    expect(glyphs(host)).toHaveLength(0);
    expect(node!.isConnected).toBe(false);
    dispose();
  });

  test('chaque nœud est décoratif et ne bouge que par transform et opacity', () => {
    const { host, frames, dispose } = mount({ max: 2, lifeMs: 4000, spawnEveryMs: 10 });
    frames.step(0);
    frames.step(500);
    const node = glyphs(host)[0] as HTMLElement;
    expect(node.getAttribute('aria-hidden')).toBe('true');
    expect(node.style.transform).toContain('translate3d(');
    expect(node.style.willChange).toBe('transform, opacity');
    dispose();
  });

  test('le démontage retire tous les nœuds et n’attend plus aucune image', () => {
    const { host, frames, dispose } = mount({ max: 4, lifeMs: 10_000, spawnEveryMs: 10 });
    for (let now = 0; now <= 100; now += 16) frames.step(now);
    expect(glyphs(host).length).toBeGreaterThan(0);
    dispose();
    expect(glyphs(host)).toHaveLength(0);
    expect(frames.hasPending()).toBe(false);
    frames.step(200);
    expect(glyphs(host)).toHaveLength(0);
  });
});
