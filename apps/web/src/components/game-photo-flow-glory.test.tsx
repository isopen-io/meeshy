import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { PhotoEnv } from '@/lib/game-photo/env';
import type { GloryScene } from '@/lib/game-photo/glory/glory-scene';
import type { GloryRenderSource, PhotoFiles } from '@/lib/game-photo/render';
import { by, choose, env, files, rank, settle, setupGamePhotoFlowTests, takeFrame } from '@/test-support/game-photo-flow-harness';

const { unmountAll, click, open } = setupGamePhotoFlowTests();

/**
 * LE CADRE DÉCORÉ (#10159, L7) : quand l'environnement sert la scène d'un cadre,
 * l'aperçu se peint sur un canvas et la couche DOM ne garde que l'emblème et le
 * carré ; l'image finale est composée avec la scène PLEINE résolution, rendue
 * aussitôt ; la scène d'aperçu se rend en sortant. Sans scène (pack pas prêt,
 * ancien serveur), rien ne change : la carte simple, sans attente.
 */
describe('le cadre décoré (#10159)', () => {
  type SceneLog = { opened: number[]; closed: number[] };
  const fakeScene = (log: SceneLog, scale: number): GloryScene => {
    log.opened.push(scale);
    return {
      frame: { id: 'savane.ambassadeur-2' } as unknown as GloryScene['frame'],
      pack: 'afrique',
      crest: { x: 448, y: 114, w: 184, h: 290 },
      bannerLayout: () => null,
      paint: () => undefined,
      close: () => void log.closed.push(scale),
    };
  };
  const decorated = (ready = true) => {
    const scenes: SceneLog = { opened: [], closed: [] };
    const glorySources: (GloryRenderSource | null | undefined)[] = [];
    const { env: base, log } = env();
    const value: PhotoEnv = {
      ...base,
      render: async (input) => {
        glorySources.push(input.glory);
        return base.render(input);
      },
      glory: async ({ scale }) => (ready ? fakeScene(scenes, scale) : null),
      gloryKit: async () => ({ art: { emblem: {} as CanvasImageSource, mee: {} as CanvasImageSource, meo: {} as CanvasImageSource, signature: {} as CanvasImageSource }, palette: { top: '#000', bottom: '#000', ink: '#fff', inkSoft: '#ccc', scrim: '#000' }, fontFamily: 'system-ui', scratch: { at: () => () => null } }),
    };
    return { env: value, log, scenes, glorySources };
  };

  test('la scène d’aperçu est demandée à demi-résolution ; l’aperçu se peint sur un canvas sous une couche DOM réduite à l’emblème', async () => {
    const { env: e, log, scenes } = decorated();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(scenes.opened).toEqual([0.5]);
    expect(host.querySelector('[data-photo-glory-canvas]')).not.toBeNull();
    expect(host.querySelector('[data-photo-stage] [data-photo-frame-decorated]')).not.toBeNull();
    expect(host.querySelector('[data-photo-stage] [data-game-coin-flip] [data-photo-art="emblem"]')).not.toBeNull();
    for (const slot of ['mee', 'meo', 'signature']) expect(host.querySelector(`[data-photo-stage] [data-photo-art="${slot}"] svg`)).not.toBeNull();
  });

  test('l’image finale est composée avec une scène pleine résolution, rendue aussitôt ; la scène d’aperçu se rend à la fermeture', async () => {
    const { env: e, log, scenes, glorySources } = decorated();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    expect(scenes.opened).toEqual([0.5, 1]);
    expect(scenes.closed).toEqual([1]);
    expect(glorySources.at(-1)?.scene.pack).toBe('afrique');
    expect(glorySources.at(-1)?.recipe).toMatchObject({ pose: null, message: null, showFlame: true, showLink: true });
    unmountAll();
    expect(scenes.closed).toEqual([1, 0.5]);
  });

  test('une scène qui arrive PENDANT la frappe ne la rejoue pas : une seule composition, aucune scène pleine résolution rouverte (même loi que le lien)', async () => {
    const scenes: SceneLog = { opened: [], closed: [] };
    const glorySources: (GloryRenderSource | null | undefined)[] = [];
    const renders: ((files: PhotoFiles | null) => void)[] = [];
    const releases: ((scene: GloryScene | null) => void)[] = [];
    const { env: base, log } = env();
    const e: PhotoEnv = {
      ...base,
      render: (input) => {
        glorySources.push(input.glory);
        return new Promise<PhotoFiles | null>((resolve) => renders.push(resolve));
      },
      glory: ({ scale }) => (scale === 1 ? Promise.resolve(fakeScene(scenes, 1)) : new Promise<GloryScene | null>((resolve) => releases.push(resolve))),
      gloryKit: async () => ({ art: { emblem: {} as CanvasImageSource, mee: {} as CanvasImageSource, meo: {} as CanvasImageSource, signature: {} as CanvasImageSource }, palette: { top: '#000', bottom: '#000', ink: '#fff', inkSoft: '#ccc', scrim: '#000' }, fontFamily: 'system-ui', scratch: { at: () => () => null } }),
    };
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    expect(glorySources).toEqual([null]);
    await act(async () => releases.forEach((release) => release(fakeScene(scenes, 0.5))));
    await settle();
    expect(scenes.opened).toEqual([0.5]);
    expect(glorySources).toEqual([null]);
    await act(async () => renders.forEach((resolve) => resolve(files())));
    await settle();
    expect(by(host, 'data-photo-keep')).not.toBeNull();
    expect(glorySources).toEqual([null]);
  });

  test('pack pas prêt (scène nulle) : la carte simple, sans canvas, et la composition part sans cadre', async () => {
    const { env: e, log, glorySources } = decorated(false);
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.querySelector('[data-photo-glory-canvas]')).toBeNull();
    expect(host.querySelector('[data-photo-frame-decorated]')).toBeNull();
    await click(takeFrame(host));
    await settle();
    expect(glorySources).toEqual([null]);
    expect(log.outputs).toHaveLength(1);
  });
});
