import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { glassToneKeyframes, GLASS_REGULAR_DENSITY, glassToneMs, GLASS_PROMINENT_DENSITY, glassVeil, SWAP_MS, STOW_REDUCED_MS } from './call-pill-motion';
import { playGlassTone } from './pill-motion-engine';

/**
 * LE TON DU VERRE CHANGE EN FONDU (L5.8, #17849 ; `CallGlassVeil` d'iOS, loi 17) — le verre d'appel
 * s'assombrit sur un écran reçu puis revient : un VOILE dont l'opacité seule bouge (le compositeur la
 * porte, aucun fond recalculé à chaque image), joué en Web Animations pour que « Réduire les
 * animations » le raccourcisse au lieu de le couper.
 */

describe('la loi du voile', () => {
  test('le voile posé sur la densité régulière donne EXACTEMENT la densité proéminente de la feuille', () => {
    const composed = 1 - (1 - GLASS_REGULAR_DENSITY / 100) * (1 - glassVeil(true));
    expect(composed).toBeCloseTo(GLASS_PROMINENT_DENSITY / 100, 10);
    expect(glassVeil(false)).toBe(0);
  });

  test('les densités de la loi sont celles de glass.css (une seule matière)', () => {
    const css = readFileSync(new URL('../../styles/glass.css', import.meta.url), 'utf8');
    expect(/\.glass-call\s*\{\s*--glass-density:\s*(\d+)%/.exec(css)?.[1]).toBe(String(GLASS_REGULAR_DENSITY));
    expect(/\.glass-call-prominent\s*\{\s*--glass-density:\s*(\d+)%/.exec(css)?.[1]).toBe(String(GLASS_PROMINENT_DENSITY));
  });

  test('pendant le fondu, le liseré et le reflet du verre passent AU-DESSUS du voile : la fin du fondu ne saute pas d’un pixel ; ces calques viennent avec l’écran d’appel, pas avec la première peinture', () => {
    const strip = (sheet: string): string => readFileSync(new URL(`../../styles/${sheet}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const css = `${strip('glass.css')}\n${strip('call-motion.css')}`;
    const rule = (selector: string): string => {
      const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, selectors]) => (selectors ?? '').split(',').some((item) => item.trim() === selector));
      expect(blocks.length).toBeGreaterThan(0);
      return blocks.map(([, , body]) => body).join('\n');
    };
    const glass = rule('.glass-call-prominent[data-glass-fading]');
    expect(glass).toMatch(/border-color:\s*transparent/);
    expect(glass).toMatch(/box-shadow:\s*var\(--glass-call-drop\)/);
    const veil = rule('.glass-call-prominent[data-glass-fading]::before');
    expect(veil).toMatch(/background-color:\s*var\(--ios-indigo-950\)/);
    expect(veil).not.toMatch(/border:/);
    const rim = rule('.glass-call-prominent[data-glass-fading]::after');
    expect(rim).toMatch(/border:\s*var\(--glass-call-rim\)/);
    expect(rim).toMatch(/box-shadow:\s*var\(--glass-call-sheen\)/);
    expect(rim).not.toMatch(/background/);
    expect(rim).not.toMatch(/opacity/);
    expect(strip('glass.css')).not.toContain('data-glass-fading');
    const rest = rule('.glass-call-danger');
    expect(rest).toMatch(/border:\s*var\(--glass-call-rim\)/);
    expect(rest).toMatch(/box-shadow:\s*var\(--glass-call-sheen\),\s*var\(--glass-call-drop\)/);
  });

  test('l’opacité seule bouge, de l’affichée vers la visée', () => {
    expect(glassToneKeyframes(0, 0.5)).toEqual([{ opacity: 0 }, { opacity: 0.5 }]);
    expect(glassToneKeyframes(0.3, 0)).toEqual([{ opacity: 0.3 }, { opacity: 0 }]);
  });

  test('court : ≈ 200 ms, et un fondu plus court sous « Réduire les animations », jamais nul', () => {
    expect(glassToneMs(false)).toBe(SWAP_MS);
    expect(glassToneMs(true)).toBe(STOW_REDUCED_MS);
    expect(glassToneMs(true)).toBeGreaterThan(0);
  });
});

describe('le moteur joue le voile en Web Animations', () => {
  beforeAll(() => ensureHappyDomRegistered());
  afterAll(() => releaseHappyDomIfRegistered());

  type Call = { readonly keyframes: Keyframe[]; readonly options: KeyframeAnimationOptions };
  const host = (calls: Call[]): HTMLElement => {
    const element = document.createElement('div');
    element.className = 'glass-call-prominent';
    element.animate = ((keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      calls.push({ keyframes, options });
      return { finished: new Promise(() => undefined), cancel: () => undefined } as unknown as Animation;
    }) as unknown as HTMLElement['animate'];
    return element;
  };

  test('vers le ton sombre : le voile monte sur le calque ::before, le fond reste à la densité d’avant jusqu’à la fin', () => {
    const calls: Call[] = [];
    const element = host(calls);
    const played = playGlassTone(element, true, null);
    expect(played).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options.pseudoElement).toBe('::before');
    expect(calls[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 0.5 }]);
    expect(element.hasAttribute('data-glass-fading')).toBe(true);
    expect(element.style.getPropertyValue('--glass-density')).toBe(`${GLASS_REGULAR_DENSITY}%`);
  });

  test('vers le ton habituel : le voile redescend', () => {
    const calls: Call[] = [];
    playGlassTone(host(calls), false, null);
    expect(calls[0]?.keyframes).toEqual([{ opacity: 0.5 }, { opacity: 0 }]);
  });

  test('sous « Réduire les animations » : le fondu est joué, court', () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduced-motion') })) as unknown as typeof window.matchMedia;
    const calls: Call[] = [];
    playGlassTone(host(calls), true, null);
    window.matchMedia = real;
    expect(calls[0]?.options.duration).toBe(STOW_REDUCED_MS);
  });

  test('sans moteur d’animation, rien n’est joué et le ton se pose d’un coup', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'animate', { value: undefined });
    expect(playGlassTone(element, true, null)).toBeNull();
    expect(element.hasAttribute('data-glass-fading')).toBe(false);
  });
});
