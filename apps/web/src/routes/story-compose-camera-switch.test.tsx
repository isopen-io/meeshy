import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraEngine, CameraOpenResult } from '@/lib/stories/studio-camera-engine';
import type { CameraFacing } from '@/lib/stories/studio-quick-capture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioCamera } from './story-compose-camera';

/**
 * LA CAMÉRA DU COMPOSER, DIRECTIVE PORTEUR 2026-10-12 —
 *  - #10308 : basculer avant ↔ arrière ne fige plus le flux ; l'ancienne
 *    image ne reste pas à l'écran, le micro n'est pas renégocié ;
 *  - #10307 : le flux demandé dès l'OUVERTURE est repris tel quel ;
 *  - #10309 : le liseré aux coins arrondis entoure l'aperçu À L'EXTÉRIEUR,
 *    passe au rouge et pulse pendant la prise.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

type Deferred = { readonly resolve: (result: CameraOpenResult) => void };

/** Un moteur dont chaque ouverture peut rester EN ATTENTE (`hold`) : le
 * témoin lit l'écran pendant la bascule. */
function switchingEngine({ fail = [] as readonly CameraFacing[] } = {}) {
  const journal: string[] = [];
  const streams: MediaStream[] = [];
  const pending: Deferred[] = [];
  let hold = false;
  const engine: CameraEngine = {
    open: (facing, previous) => {
      const index = previous === undefined ? -1 : streams.indexOf(previous);
      journal.push(previous === undefined ? `open:${facing}` : `open:${facing}<-#${index}`);
      const stream = new MediaStream();
      const result: CameraOpenResult = fail.includes(facing) ? { ok: false } : { ok: true, stream, torch: false, zoom: { mode: 'preview', min: 1, max: 1, step: 0 } };
      if (result.ok) streams.push(stream);
      if (!hold) return Promise.resolve(result);
      return new Promise((resolve) => pending.push({ resolve: () => resolve(result) }));
    },
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    photo: async () => new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' }),
    setZoom: async () => undefined,
    startRecording: () => {
      journal.push('record');
    },
    stopRecording: async () => new File(['mp4'], 'video.mp4', { type: 'video/mp4' }),
    release: (stream) => {
      journal.push(`release:#${streams.indexOf(stream)}`);
    },
    maxBrightness: async () => null,
  };
  return {
    engine,
    journal,
    streams,
    holdNext: () => {
      hold = true;
    },
    resolveAll: () => {
      hold = false;
      pending.splice(0).forEach((entry) => entry.resolve({ ok: false }));
    },
  };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function camera(engine: CameraEngine, extra: { readonly preopened?: () => Promise<CameraOpenResult> | null; readonly closed?: string[] } = {}) {
  return (
    <StudioCamera
      lang="fr"
      kind="STORY"
      intent="arm"
      holding={false}
      flash={false}
      onFlash={() => undefined}
      engine={engine}
      {...(extra.preopened !== undefined ? { preopened: extra.preopened } : {})}
      onTake={() => undefined}
      onClose={() => extra.closed?.push('closed')}
    />
  );
}

const flip = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-camera-flip]');
const preview = (host: ParentNode) => host.querySelector<HTMLVideoElement>('[data-story-camera-preview]');
const root = (host: ParentNode) => host.querySelector<HTMLElement>('[data-story-camera]');

describe('StudioCamera — la bascule avant ↔ arrière (#10308)', () => {
  test('la caméra avant prend la place de l’arrière en reprenant le flux en cours : rien n’est relâché, le nouveau flux est attaché', async () => {
    const { engine, journal, streams } = switchingEngine();
    const host = await mounter.mount(camera(engine));
    await settle();
    await act(async () => flip(host)?.click());
    await settle();
    expect(journal).toEqual(['open:environment', 'open:user<-#0']);
    expect(preview(host)?.srcObject).toBe(streams[1] ?? null);
    expect(root(host)?.getAttribute('data-story-camera')).toBe('live');
    expect(root(host)?.getAttribute('data-story-camera-facing')).toBe('user');
  });

  test('pendant la bascule, l’image figée de l’ancienne optique quitte l’écran et la bascule ne se redouble pas', async () => {
    const { engine, journal, holdNext } = switchingEngine();
    const host = await mounter.mount(camera(engine));
    await settle();
    holdNext();
    await act(async () => flip(host)?.click());
    await settle();
    expect(preview(host)?.srcObject ?? null).toBeNull();
    expect(root(host)?.hasAttribute('data-story-camera-switching')).toBe(true);
    expect(flip(host)?.disabled).toBe(true);
    await act(async () => flip(host)?.click());
    expect(journal.filter((entry) => entry.startsWith('open:'))).toHaveLength(2);
  });

  test('l’autre optique refusée : le viseur le dit, et le micro gardé de l’ancien flux est relâché', async () => {
    const { engine, journal } = switchingEngine({ fail: ['user'] });
    const host = await mounter.mount(camera(engine));
    await settle();
    await act(async () => flip(host)?.click());
    await settle();
    expect(host.querySelector('[data-story-camera-unavailable]')).not.toBeNull();
    expect(journal).toContain('release:#0');
  });

  test('quitter pendant la bascule relâche l’ancien flux, puis le nouveau dès qu’il arrive', async () => {
    const { engine, journal, holdNext, resolveAll } = switchingEngine();
    const closed: string[] = [];
    const host = await mounter.mount(camera(engine, { closed }));
    await settle();
    holdNext();
    await act(async () => flip(host)?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-camera-close]')?.click());
    expect(closed).toEqual(['closed']);
    expect(journal).toContain('release:#0');
    resolveAll();
    await settle();
    expect(journal).toContain('release:#1');
  });

  test('basculée puis quittée : seul le flux en cours est relâché, une fois', async () => {
    const { engine, journal } = switchingEngine();
    const host = await mounter.mount(camera(engine));
    await settle();
    await act(async () => flip(host)?.click());
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-camera-close]')?.click());
    expect(journal.filter((entry) => entry.startsWith('release'))).toEqual(['release:#1']);
  });
});

describe('StudioCamera — le flux demandé dès l’ouverture (#10307)', () => {
  test('un flux déjà demandé par l’hôte est repris : la caméra n’en redemande pas', async () => {
    const { engine, journal } = switchingEngine();
    const early = new MediaStream();
    let taken = 0;
    const host = await mounter.mount(
      camera(engine, {
        preopened: () => {
          taken += 1;
          return taken === 1 ? Promise.resolve({ ok: true, stream: early, torch: false, zoom: { mode: 'preview', min: 1, max: 1, step: 0 } }) : null;
        },
      }),
    );
    await settle();
    expect(journal).toEqual([]);
    expect(preview(host)?.srcObject).toBe(early);
    expect(root(host)?.getAttribute('data-story-camera')).toBe('live');
  });
});

describe('StudioCamera — le liseré de l’aperçu (#10309)', () => {
  const edge = (host: ParentNode) => host.querySelector<HTMLElement>('[data-story-camera-edge]');
  const windowOf = (host: ParentNode) => host.querySelector<HTMLElement>('[data-story-camera-window]');
  const px = (value: string | undefined) => Number.parseFloat(value ?? 'NaN');

  test('il entoure l’aperçu à l’EXTÉRIEUR, aux coins arrondis, sans recouvrir le flux', async () => {
    const { engine } = switchingEngine();
    const host = await mounter.mount(camera(engine));
    await settle();
    const ring = edge(host);
    const view = windowOf(host);
    expect(ring?.getAttribute('data-story-camera-edge')).toBe('idle');
    expect(ring?.getAttribute('aria-hidden')).toBe('true');
    expect(px(ring?.style.top)).toBeLessThan(px(view?.style.top));
    expect(px(ring?.style.borderRadius)).toBeGreaterThan(px(view?.style.borderRadius));
    expect(px(view?.style.borderRadius)).toBeGreaterThan(0);
    expect(px(view?.style.top) - px(ring?.style.top)).toBeGreaterThan(px(ring?.style.borderWidth));
  });

  test('pendant la prise, il passe au ROUGE et pulse en fondu — sauf si l’appareil demande moins d’animations', async () => {
    const { engine } = switchingEngine();
    const host = await mounter.mount(camera(engine));
    await settle();
    expect(edge(host)?.className).not.toContain('animate-');
    const shutter = host.querySelector<HTMLButtonElement>('[data-story-camera-shutter]');
    await act(async () => {
      shutter?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    await settle();
    const ring = edge(host);
    expect(ring?.getAttribute('data-story-camera-edge')).toBe('recording');
    expect(ring?.style.borderColor).toBe('var(--color-error)');
    expect(ring?.className).toContain('motion-safe:animate-pulse');
  });
});
