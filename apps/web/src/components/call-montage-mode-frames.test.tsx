import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CaptureEnv, CaptureFile } from '@/lib/calls/call-capture';
import type { ClipEnv } from '@/lib/calls/call-capture-live';
import { montageCircle, type MontageCall } from '@/lib/calls/call-montage-circle';
import type { CallMember } from '@/lib/calls/call-store';
import { inked, recorder } from '@/lib/calls/frames/frame-recorder.test-support';
import type { FrameStudioModule } from '@/components/use-montage-frames';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { loadFrameUsageCatalog } from '@/lib/i18n-frame-usage-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallMontageMode } from './call-montage-mode';

/**
 * LES CADRES DANS LE MODE MONTAGE (#8742, #8743, spec § 3) — en haut, les
 * puces d'ambiance : « Classiques » d'abord et par défaut, puis les
 * ambiances qui ont un cadre pour le nombre de personnes de l'appel (moi
 * compris). Toucher une puce change le carrousel dans la même image ; une
 * arrivée ou un départ réconcilie le cadre choisi, et retombe sur les
 * classiques quand plus rien ne le sert. Les vignettes ne se rendent que
 * pour la fenêtre visible (± 3) ; deux tapes sur le cadre choisi le
 * photographient, composé par le peintre des cadres.
 */

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const callOf = (...members: readonly CallMember[]): MontageCall => ({ conversationId: 'c1', isGroup: members.length > 1, title: 'Les Copains', members: Object.fromEntries(members.map((entry) => [entry.userId, entry])) });

const circleOf = (call: MontageCall) => montageCircle({ call, viewer: { id: 'u-me', handle: 'moi', displayName: 'Sam' }, conversation: undefined, date: '29 sept. 2026' });

const clipEnv = (): ClipEnv => ({
  isTypeSupported: (mime) => mime === 'video/webm',
  record: (_stream, _mime, push, end) => ({ stop: () => queueMicrotask(() => (push(new Blob(['clip'])), end())) }),
  mixAudio: () => ({ track: null, close: () => undefined }),
  createStream: (tracks) => ({ getTracks: () => tracks }) as unknown as MediaStream,
  now: () => new Date(2026, 8, 29, 18, 4, 9),
});

const stage = (): Element => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 400, height: 800, x: 0, y: 0, right: 400, bottom: 800 }) });
  return element;
};

describe('CallMontageMode — les cadres', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const loaded: { module: FrameStudioModule | null } = { module: null };

  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    await loadFrameUsageCatalog('fr');
    loaded.module = await import('@/lib/calls/frames/frame-studio');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = async (call: MontageCall | undefined, options: { readonly frames?: boolean; readonly module?: FrameStudioModule; readonly clipEnv?: boolean; readonly shelf?: readonly string[] | null } = {}) => {
    const saved: Array<readonly CaptureFile[]> = [];
    const painted = recorder();
    const sizes: Array<{ width: number; height: number }> = [];
    const env: CaptureEnv = {
      canvas: (size) => {
        sizes.push(size);
        return { context: painted.context as CanvasRenderingContext2D, image: {} as CanvasImageSource };
      },
      photo: { surface: () => ({ paint: () => undefined, pixels: () => null, put: () => undefined, encode: async (mime) => new Blob(['jpeg'], { type: mime }) }) },
      detector: null,
      now: () => new Date(2026, 8, 29, 18, 4, 9),
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const shown = stage();
    const render = (next: MontageCall | undefined) =>
      root.render(
        <CallMontageMode
          language="fr"
          quitGlyph={null}
          onExit={() => undefined}
          stage={() => shown}
          env={env}
          save={async (files) => {
            saved.push(files);
            return { saved: files.length, failed: 0, cancelled: 0 };
          }}
          viewport={() => ({ width: 390, height: 844 })}
          {...(next === undefined ? {} : { call: next })}
          {...(options.frames === false ? {} : { loadFrames: async () => options.module ?? (loaded.module as FrameStudioModule) })}
          circleOf={circleOf}
          loadShelf={async () => options.shelf ?? null}
          {...(options.clipEnv === true ? { clipEnv } : {})}
        />,
      );
    await act(async () => render(call));
    await act(async () => {});
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const find = (selector: string) => host.querySelector(selector);
    const press = async (selector: string) => {
      await act(async () => (find(selector) as HTMLElement | null)?.click());
      await act(async () => {});
    };
    const chips = () => all('[data-call-frame-mood]').map((chip) => [chip.getAttribute('data-call-frame-mood'), chip.textContent, chip.getAttribute('aria-pressed')]);
    const items = () => all('[data-call-mode-carousel] [data-carousel-item]').map((item) => item.getAttribute('data-carousel-item') ?? '');
    const checked = () => find('[data-call-mode-carousel] [aria-checked="true"]')?.getAttribute('data-carousel-item') ?? null;
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, chips, items, checked, rerender: (next: MontageCall) => act(async () => render(next)), saved, sizes, painted, done };
  };

  const duo = callOf(member('u-awa', 'Awa'));
  const trio = callOf(member('u-awa', 'Awa'), member('u-karim', 'Karim'));

  test('« Classiques » d’abord et par défaut, puis les ambiances qui servent deux personnes ; le carrousel reste celui des montages', async () => {
    const view = await mount(duo);
    const moods = loaded.module?.createFrameStudio({ fonts: undefined }).moods(2) ?? [];
    expect(moods.length).toBeGreaterThan(1);
    expect(view.find('[data-call-frame-moods]')?.getAttribute('aria-label')).toBe('Ambiances');
    expect(view.chips()[0]).toEqual(['classics', 'Classiques', 'true']);
    expect(view.chips().slice(1).map(([id]) => id)).toEqual([...moods]);
    expect(view.chips().slice(1).every(([, , pressed]) => pressed === 'false')).toBe(true);
    expect(view.find('[data-call-frame-mood="jovial"]')?.textContent).toBe('Jovial');
    expect(view.items()).toHaveLength(13);
    expect(view.checked()).toBe('grid');
    view.done();
  });

  test('toucher une ambiance change le carrousel dans la même image : ses cadres de duo, le premier choisi et en aperçu', async () => {
    const view = await mount(duo);
    await view.press('[data-call-frame-mood="jovial"]');
    expect(view.find('[data-call-frame-mood="jovial"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.find('[data-call-frame-mood="classics"]')?.getAttribute('aria-pressed')).toBe('false');
    const ids = view.items();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('jovial.') && id.endsWith('.duo'))).toBe(true);
    expect(view.checked()).toBe(ids[0] ?? '');
    const preview = view.find('[data-call-capture-preview]');
    expect(preview?.getAttribute('data-call-capture-preview')).toBe(ids[0] ?? '');
    const first = view.find(`[data-carousel-item="${ids[0] ?? ''}"]`)?.getAttribute('aria-label') ?? '';
    expect(preview?.getAttribute('aria-label')).toBe(`Aperçu du cadre ${first}`);
    expect(view.find('[data-call-mode-carousel] [role="radiogroup"]')?.getAttribute('aria-label')).toBe('Choisir un cadre');
    view.done();
  });

  test('les vignettes ne se rendent que pour la fenêtre visible, ± 3 autour du cadre choisi', async () => {
    const module = loaded.module as FrameStudioModule;
    const base = module.createFrameStudio({ fonts: undefined }).frames.find((frame) => frame.mood === 'jovial' && frame.bucket === 'duo');
    if (base === undefined) throw new Error('aucun cadre jovial de duo');
    const many = Array.from({ length: 9 }, (_, index) => ({ ...base, id: `jovial.m${index}.duo`, motif: `jovial.m${index}`, name: `Motif ${index}` }));
    const view = await mount(duo, { module: { createFrameStudio: () => module.createFrameStudio({ frames: many, fonts: undefined }) } });
    await view.press('[data-call-frame-mood="jovial"]');
    const ids = view.items();
    expect(ids).toHaveLength(9);
    const rendered = () => view.all('[data-call-frame-thumb]').map((canvas) => canvas.getAttribute('data-call-frame-thumb'));
    expect(rendered()).toEqual(ids.slice(0, 4));
    expect(view.all('[data-call-frame-thumb-idle]')).toHaveLength(5);
    expect(view.all('[data-call-frame-thumb]').every((canvas) => [canvas.getAttribute('width'), canvas.getAttribute('height')].join('x') === '108x192')).toBe(true);
    await view.press(`[data-carousel-item="${ids[4] ?? ''}"]`);
    expect(rendered()).toEqual(ids.slice(1, 8));
    await view.press(`[data-carousel-item="${ids[8] ?? ''}"]`);
    expect(rendered()).toEqual(ids.slice(5));
    view.done();
  });

  test('la capture propose le cadre du direct ET le cadre de capture seule, et chaque vignette dit où elle sert (#10146)', async () => {
    const module = loaded.module as FrameStudioModule;
    const base = module.createFrameStudio({ fonts: undefined }).frames.find((frame) => frame.mood === 'jovial' && frame.bucket === 'duo');
    if (base === undefined) throw new Error('aucun cadre jovial de duo');
    const { surfaces: _ignored, ...plain } = base;
    const pair = [
      { ...plain, id: 'jovial.photo.duo', motif: 'jovial.photo', name: 'Photo', surfaces: ['capture' as const] },
      { ...plain, id: 'jovial.direct.duo', motif: 'jovial.direct', name: 'Direct', surfaces: ['capture' as const, 'live' as const] },
    ];
    const view = await mount(duo, { module: { createFrameStudio: (options) => module.createFrameStudio({ ...(options ?? {}), frames: pair, fonts: undefined }) } });
    await view.press('[data-call-frame-mood="jovial"]');
    expect(view.items()).toEqual(['jovial.photo.duo', 'jovial.direct.duo']);
    const detail = (id: string) => view.find(`[data-carousel-item="${id}"]`)?.getAttribute('title');
    expect(detail('jovial.photo.duo')).toBe('Capture photo et vidéo uniquement');
    expect(detail('jovial.direct.duo')).toBe('Utilisable : appels vidéo et captures');
    expect(view.find('[data-call-mode-detail]')?.textContent).toBe('Capture photo et vidéo uniquement');
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    expect(view.find('[data-call-mode-detail]')?.textContent).toBe('Utilisable : appels vidéo et captures');
    const described = view.find('[data-carousel-item="jovial.direct.duo"]')?.getAttribute('aria-describedby') ?? '';
    expect(described.split(' ').map((id) => view.find(`[id="${id}"]`)?.textContent)).toContain('Utilisable : appels vidéo et captures');
    view.done();
  });

  test('l’aperçu d’un cadre du direct se resserre entre les commandes du mode ; un cadre de capture seule et la photo partent pleins (#10481)', async () => {
    const module = loaded.module as FrameStudioModule;
    const base = module.createFrameStudio({ fonts: undefined }).frames.find((frame) => frame.mood === 'jovial' && frame.bucket === 'duo');
    if (base === undefined) throw new Error('aucun cadre jovial de duo');
    const { surfaces: _ignored, ...plain } = base;
    const pair = [
      { ...plain, id: 'jovial.photo.duo', motif: 'jovial.photo', name: 'Photo', surfaces: ['capture' as const] },
      { ...plain, id: 'jovial.direct.duo', motif: 'jovial.direct', name: 'Direct', surfaces: ['capture' as const, 'live' as const] },
    ];
    const drawn: Array<{ readonly id: string; readonly tier: string; readonly chrome: unknown }> = [];
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => recorder().context });
    const measured = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 600, width: 390, height: 48, x: 0, y: 600, right: 390, bottom: 648 }) });
    const spied: FrameStudioModule = {
      createFrameStudio: (options) => {
        const real = module.createFrameStudio({ ...(options ?? {}), frames: pair, fonts: undefined });
        return { ...real, draw: (context, frame, shot, tier) => (drawn.push({ id: frame.id, tier, chrome: shot.chrome }), real.draw(context, frame, shot, tier)) };
      },
    };
    const view = await mount(duo, { module: spied });
    const previews = (id: string) => drawn.filter((entry) => entry.id === id && entry.tier === 'preview');
    await view.press('[data-call-frame-mood="jovial"]');
    expect(previews('jovial.photo.duo').length).toBeGreaterThan(0);
    expect(previews('jovial.photo.duo').every((entry) => entry.chrome === undefined)).toBe(true);
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    expect(previews('jovial.direct.duo').at(-1)?.chrome).toEqual({ viewport: { width: 390, height: 844 }, top: 0, bottom: 844 - 600 });
    expect(drawn.filter((entry) => entry.tier === 'thumb').every((entry) => entry.chrome === undefined)).toBe(true);
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    await view.press('[data-carousel-item="jovial.direct.duo"]');
    const still = drawn.filter((entry) => entry.tier === 'still');
    expect(still.length).toBeGreaterThan(0);
    expect(still.every((entry) => entry.chrome === undefined)).toBe(true);
    view.done();
    if (original === undefined) delete (HTMLCanvasElement.prototype as { getContext?: unknown }).getContext;
    else Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
    if (measured === undefined) delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    else Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', measured);
  });

  test('les classiques ne portent aucun libellé d’usage', async () => {
    const view = await mount(duo);
    expect(view.find('[data-call-mode-detail]')).toBeNull();
    expect(view.find('[data-carousel-item="grid"]')?.getAttribute('title')).toBeNull();
    view.done();
  });

  test('« Classiques » rend les montages, et le montage qu’on avait', async () => {
    const view = await mount(duo);
    await view.press('[data-carousel-item="comic"]');
    await view.press('[data-call-frame-mood="jovial"]');
    await view.press('[data-call-frame-mood="classics"]');
    expect(view.items()).toHaveLength(13);
    expect(view.checked()).toBe('comic');
    view.done();
  });

  test('un troisième arrive : le cadre de duo passe à la variante de son motif, et aucun cadre de duo ne s’offre plus', async () => {
    const studio = loaded.module?.createFrameStudio({ fonts: undefined });
    const pair = studio?.frames.find((frame) => frame.bucket === 'duo' && (studio.reconcile(frame.id, 3)?.motif ?? '') === frame.motif);
    expect(pair).toBeDefined();
    if (pair === undefined) return;
    const view = await mount(duo);
    await view.press(`[data-call-frame-mood="${pair.mood}"]`);
    await view.press(`[data-carousel-item="${pair.id}"]`);
    expect(view.checked()).toBe(pair.id);
    await view.rerender(trio);
    await act(async () => {});
    expect(view.checked()).toBe(studio?.reconcile(pair.id, 3)?.id ?? '');
    expect(view.items().some((id) => id.endsWith('.duo'))).toBe(false);
    expect(view.find(`[data-call-frame-mood="${pair.mood}"]`)?.getAttribute('aria-pressed')).toBe('true');
    view.done();
  });

  test('l’autre s’en va : plus personne à encadrer, retour aux classiques', async () => {
    const view = await mount(duo);
    await view.press('[data-call-frame-mood="jovial"]');
    await view.rerender(callOf());
    await act(async () => {});
    expect(view.chips()).toEqual([['classics', 'Classiques', 'true']]);
    expect(view.items()).toHaveLength(13);
    expect(view.checked()).toBe('grid');
    view.done();
  });

  test('deux tapes sur le cadre choisi le photographient, composé à pleine résolution par le peintre des cadres', async () => {
    const view = await mount(duo);
    await view.press('[data-call-frame-mood="jovial"]');
    const id = view.checked() ?? '';
    await view.press(`[data-carousel-item="${id}"]`);
    await view.press(`[data-carousel-item="${id}"]`);
    expect(view.saved.map((files) => files.map((file) => file.fileName))).toEqual([[`meeshy-appel-cadre-${id.replaceAll('.', '-')}-20260929-180409.jpg`]]);
    expect(view.sizes).toEqual([{ width: 1080, height: 1920 }]);
    expect(inked(view.painted.log)).toBeGreaterThan(5);
    view.done();
  });

  test('pendant une vidéo, les puces s’effacent : rien ne couvre le stop, au centre, sur un petit écran', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'captureStream');
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getVideoTracks: () => [{ kind: 'video', stop: () => undefined }] }) });
    const view = await mount(duo, { clipEnv: true });
    expect(view.find('[data-call-frame-moods]')).not.toBeNull();
    await view.press('[data-call-record-key]');
    expect(view.find('[data-call-recording]')).not.toBeNull();
    expect(view.find('[data-call-frame-moods]')).toBeNull();
    await view.press('[data-call-record-stop]');
    await act(async () => {});
    expect(view.find('[data-call-frame-moods]')).not.toBeNull();
    view.done();
    if (original === undefined) delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
    else Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', original);
  });

  test('sans atelier chargé, « Classiques » seule', async () => {
    const view = await mount(duo, { frames: false });
    expect(view.chips()).toEqual([['classics', 'Classiques', 'true']]);
    view.done();
  });

  const forgetShelf = () => appQueryClient.removeQueries({ queryKey: packQueryKeys('capture-frame').installed });

  test('une ambiance RETIRÉE (#10169) n’a plus de puce ; les installées gardent la leur, dans l’ordre du catalogue', async () => {
    forgetShelf();
    const moods = loaded.module?.createFrameStudio({ fonts: undefined }).moods(2) ?? [];
    const kept = moods.filter((mood) => mood !== 'jovial');
    const view = await mount(duo, { shelf: kept });
    expect(view.chips().map(([id]) => id)).toEqual(['classics', ...kept]);
    expect(view.find('[data-call-frame-mood="jovial"]')).toBeNull();
    view.done();
  });

  test('une étagère INCONNUE (ancien serveur, invité, panne) ne cache aucune puce', async () => {
    forgetShelf();
    const moods = loaded.module?.createFrameStudio({ fonts: undefined }).moods(2) ?? [];
    const view = await mount(duo, { shelf: null });
    expect(view.chips().map(([id]) => id)).toEqual(['classics', ...moods]);
    view.done();
  });

  test('cache d’abord : la dernière étagère connue sert l’entrée suivante, et une réponse inconnue ne l’efface pas', async () => {
    forgetShelf();
    const first = await mount(duo, { shelf: ['signature'] });
    first.done();
    const offline = await mount(duo, { shelf: null });
    expect(offline.chips().map(([id]) => id)).toEqual(['classics', 'signature']);
    offline.done();
    forgetShelf();
  });
});
