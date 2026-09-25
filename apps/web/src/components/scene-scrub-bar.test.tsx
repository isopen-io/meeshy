import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SceneScrubBar, type SceneScrubBarProps, type SceneScrubPainter } from './scene-scrub-bar';

/**
 * LA BARRE QU'ON PARCOURT AU DOIGT (#7879) — le slider partagé par le réel à
 * scène et le segment actif de la story. Le geste : appuyer AGRANDIT la barre
 * et pose la poignée sous le doigt ; glisser pointe le temps ; relâcher
 * rend la main. Le visuel s'écrit par ref, jamais par un état par trame.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Journal = { starts: number; scrubs: number[]; ends: number[]; parentDowns: number };

function mountBar(overrides: Partial<SceneScrubBarProps> = {}): {
  readonly slider: HTMLElement;
  readonly journal: Journal;
  readonly painter: { current: SceneScrubPainter | null };
} {
  const journal: Journal = { starts: 0, scrubs: [], ends: [], parentDowns: 0 };
  const painter: { current: SceneScrubPainter | null } = { current: null };
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <div onPointerDown={() => (journal.parentDowns += 1)}>
        <SceneScrubBar
          durationSeconds={10}
          language="fr"
          align="bottom"
          fill="red"
          painterRef={painter}
          onScrubStart={() => (journal.starts += 1)}
          onScrub={(s) => journal.scrubs.push(s)}
          onScrubEnd={(s) => journal.ends.push(s)}
          {...overrides}
        />
      </div>,
    );
  });
  const slider = container.querySelector('[role="slider"]') as HTMLElement;
  slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 44, right: 300, bottom: 44, x: 100, y: 0, toJSON: () => ({}) });
  return { slider, journal, painter };
}

const pointer = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, clientX, pointerId: 1 });
const fill = (slider: HTMLElement) => slider.querySelector('[data-scene-scrub-fill]') as HTMLElement;
const thumb = (slider: HTMLElement) => slider.querySelector('[data-scene-scrub-thumb]') as HTMLElement;

describe('SceneScrubBar — le slider (#7879)', () => {
  test('un slider NOMMÉ, en pourcentage, avec le temps dit en toutes lettres', () => {
    const { slider, painter } = mountBar();
    expect(slider.getAttribute('aria-label')).toBe('Position de lecture');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
    expect(slider.tabIndex).toBe(0);
    act(() => painter.current?.(0.35));
    expect(slider.getAttribute('aria-valuenow')).toBe('35');
    expect(slider.getAttribute('aria-valuetext')).toBe('0:03 sur 0:10');
  });

  test('l’hôte peint la progression par ref : le rempli et la poignée suivent', () => {
    const { slider, painter } = mountBar();
    act(() => painter.current?.(0.5));
    expect(fill(slider).style.transform).toBe('scaleX(0.5)');
    expect(thumb(slider).style.left).toBe('50%');
  });

  test('appuyer AGRANDIT la barre, pointe le temps sous le doigt — et le geste n’atteint pas le parent', () => {
    const { slider, journal } = mountBar();
    act(() => slider.dispatchEvent(pointer('pointerdown', 150)));
    expect(slider.hasAttribute('data-scrubbing')).toBe(true);
    expect(journal.starts).toBe(1);
    expect(journal.scrubs).toEqual([2.5]);
    expect(fill(slider).style.transform).toBe('scaleX(0.25)');
    expect(journal.parentDowns).toBe(0);
  });

  test('glisser suit le doigt, borné à la piste ; sans appui, survoler ne pointe rien', () => {
    const { slider, journal } = mountBar();
    act(() => slider.dispatchEvent(pointer('pointermove', 200)));
    expect(journal.scrubs).toEqual([]);
    act(() => slider.dispatchEvent(pointer('pointerdown', 150)));
    act(() => slider.dispatchEvent(pointer('pointermove', 250)));
    act(() => slider.dispatchEvent(pointer('pointermove', 900)));
    expect(journal.scrubs).toEqual([2.5, 7.5, 10]);
  });

  test('relâcher rend la main AU temps pointé, et la barre revient à sa taille', () => {
    const { slider, journal } = mountBar();
    act(() => slider.dispatchEvent(pointer('pointerdown', 150)));
    act(() => slider.dispatchEvent(pointer('pointerup', 200)));
    expect(journal.ends).toEqual([5]);
    expect(slider.hasAttribute('data-scrubbing')).toBe(false);
  });

  test('un geste ANNULÉ (le système reprend le pointeur) rend la main au dernier temps pointé', () => {
    const { slider, journal } = mountBar();
    act(() => slider.dispatchEvent(pointer('pointerdown', 150)));
    act(() => slider.dispatchEvent(pointer('pointermove', 250)));
    act(() => slider.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
    expect(journal.ends).toEqual([7.5]);
    expect(slider.hasAttribute('data-scrubbing')).toBe(false);
  });

  test('les flèches avancent d’un dixième de la scène depuis la position peinte', () => {
    const { slider, journal, painter } = mountBar();
    act(() => painter.current?.(0.5));
    act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(journal.scrubs).toEqual([6, 0]);
    expect(journal.starts).toBe(0);
  });

  test('la barre RÉCLAME son geste : le lecteur de story le lui cède', () => {
    const { slider } = mountBar();
    expect(slider.hasAttribute('data-claims-gesture')).toBe(true);
  });
});
