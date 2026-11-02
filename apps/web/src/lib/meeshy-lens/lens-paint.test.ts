import { describe, expect, test } from 'bun:test';

import type { Surface2D } from '@/lib/calls/video-effects-frames';

import { paintLens, type LensPaintEnv } from './lens-paint';
import type { LensDrawOp } from './lens-plan';

/**
 * LE PEINTRE 2D D'UNE LENS (W14, #11320) — il trace ce que le plan a décidé,
 * jamais plus : un fichier absent n'est pas peint, la LUT n'est pas de son
 * ressort, le cadre se délègue. Le canevas est une doublure qui journalise.
 */
function recorder() {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const state: Record<string, unknown> = {};
  const record = (name: string) => (...args: unknown[]) => void calls.push([name, ...args]);
  const context = new Proxy(state, {
    get: (target, key: string) => (key in target ? target[key] : record(key)),
    set: (target, key: string, value: unknown) => {
      calls.push([`set:${key}`, value]);
      target[key] = value;
      return true;
    },
  }) as unknown as Surface2D;
  return { calls, context, names: () => calls.map(([name]) => name) };
}

const SIZE = { width: 1280, height: 720 };
const image = { name: 'couronne' } as unknown as CanvasImageSource;
const env = (overrides: Partial<LensPaintEnv> = {}): LensPaintEnv => ({ assets: (asset) => (asset === 'bbbbbbbbbbbbbbbb.png' ? image : null), ...overrides });

const sticker = (asset: string, rotation = 0): LensDrawOp => ({ kind: 'sticker', id: 's', asset, x: 640, y: 100, size: 144, rotation });

describe('paintLens', () => {
  test('un sticker se pose centré sur son point, à sa taille, tourné', () => {
    const r = recorder();
    paintLens(r.context, [sticker('bbbbbbbbbbbbbbbb.png', 0.5)], SIZE, env());
    expect(r.calls).toContainEqual(['translate', 640, 100]);
    expect(r.calls).toContainEqual(['rotate', 0.5]);
    expect(r.calls).toContainEqual(['drawImage', image, -72, -72, 144, 144]);
  });

  test('un fichier absent n’est pas peint, et le reste de la lens l’est', () => {
    const r = recorder();
    const text: LensDrawOp = { kind: 'text', id: 't', text: 'Bonne année', language: 'fr', font: '50px "Fraunces"', color: '#FFFFFF', x: 640, y: 648 };
    paintLens(r.context, [sticker('dddddddddddddddd.png'), text], SIZE, env());
    expect(r.names()).not.toContain('drawImage');
    expect(r.calls).toContainEqual(['fillText', 'Bonne année', 640, 648]);
  });

  test('un texte arabe s’écrit de droite à gauche', () => {
    const r = recorder();
    paintLens(r.context, [{ kind: 'text', id: 't', text: 'سنة سعيدة', language: 'ar', font: '50px "Fraunces"', color: '#FFFFFF', x: 640, y: 648 }], SIZE, env());
    expect(r.calls).toContainEqual(['set:direction', 'rtl']);
  });

  test('la LUT est sautée, le cadre est délégué au peintre des cadres', () => {
    const r = recorder();
    const framed: Array<readonly unknown[]> = [];
    paintLens(
      r.context,
      [
        { kind: 'lut', id: 'g', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 1 },
        { kind: 'frame', id: 'c', motif: 'elegant.art-deco', opacity: 0.9 },
      ],
      SIZE,
      env({ frame: (_context, motif, size, opacity) => void framed.push([motif, size, opacity]) }),
    );
    expect(r.calls).toEqual([]);
    expect(framed).toEqual([['elegant.art-deco', SIZE, 0.9]]);
  });

  test('une particule invisible (alpha 0) n’est pas tracée', () => {
    const r = recorder();
    paintLens(r.context, [{ kind: 'particles', id: 'p', preset: 'snow', dots: [{ x: 1, y: 2, r: 3, alpha: 0 }, { x: 4, y: 5, r: 6, alpha: 0.5 }] }], SIZE, env());
    expect(r.calls.filter(([name]) => name === 'arc')).toEqual([['arc', 4, 5, 6, 0, Math.PI * 2]]);
  });
});
