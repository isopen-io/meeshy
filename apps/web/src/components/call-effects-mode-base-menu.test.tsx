import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { CAPTURE_HOLD_MS } from '@/lib/calls/call-capture-gesture';
import type { ClipEnv } from '@/lib/calls/call-capture-live';
import type { CaptureFile } from '@/lib/calls/call-capture-save';
import { setEffectLayers } from '@/lib/calls/call-effect-layers-store';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallEffectsMode, type FrameGrab } from './call-effects-mode';

/**
 * C1 PARTOUT, EN EFFETS (directive porteur du 2026-11-14 sur #16979 et #17962, #18186) — choisir un look,
 * une déformation ou une couleur l'applique aussitôt, referme le carrousel qu'on avait ouvert, et la barre
 * revient à son menu de base : les puces Visage · Couleur · Cadres sur `‹ · Réglages · (+)`. Une puce ou (+)
 * rouvre le carrousel d'un genre. Seul le panneau Luminosité · Flou du fond reste ouvert pendant le réglage ;
 * ‹ le referme et rend la barre de base, un second ‹ quitte (#17947).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const later = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

const GONE_MS = 260;

const clipEnv = (): ClipEnv => ({
  isTypeSupported: (mime) => mime === 'video/webm',
  record: (_stream, _mime, push, end) => ({ stop: () => queueMicrotask(() => (push(new Blob(['clip'])), end())) }),
  mixAudio: () => ({ track: null, close: () => undefined }),
  createStream: (tracks) => ({ getTracks: () => tracks }) as unknown as MediaStream,
  now: () => new Date(2026, 10, 14, 9, 0, 0),
});

describe('CallEffectsMode — après un choix, le menu de base', () => {
  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    await loadCallControlsCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => setEffectLayers([]));

  afterEach(() => {
    setEffectLayers([]);
    videoEffectsStore.setState({ effects: NO_EFFECTS });
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (options: { readonly effects?: VideoEffects; readonly color?: boolean; readonly blur?: boolean; readonly frames?: boolean } = {}) => {
    videoEffectsStore.setState({ effects: options.effects ?? NO_EFFECTS });
    const applied: Array<Partial<VideoEffects>> = [];
    const exits: string[] = [];
    const opened: string[] = [];
    const saved: Array<readonly CaptureFile[]> = [];
    const grabbed: string[] = [];
    const filmed: string[] = [];
    const grab: FrameGrab = {
      still: async (_video, style) => (grabbed.push(style), { blob: new Blob(['png']), fileName: `meeshy-appel-${style}.png` }),
      film: () => (filmed.push('film'), { track: { kind: 'video' } as MediaStreamTrack, release: () => undefined }),
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsMode
          language="fr"
          colorAvailable={options.color ?? true}
          blurAvailable={options.blur ?? true}
          preview={<video data-testid="self-preview" />}
          selfVideo={() => host.querySelector<HTMLVideoElement>('[data-testid="self-preview"]')}
          onExit={() => void exits.push('exit')}
          grab={grab}
          clipEnv={clipEnv}
          audio={() => []}
          save={async (files) => (saved.push(files), { saved: files.length, failed: 0, cancelled: 0 })}
          {...(options.frames === true ? { onOpenFrames: () => void opened.push('frames') } : {})}
          apply={(patch) => {
            applied.push(patch);
            videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }));
          }}
        />,
      ),
    );
    const find = (selector: string) => host.querySelector<HTMLElement>(selector);
    const press = async (selector: string) => {
      await act(async () => find(selector)?.click());
      await act(async () => {});
    };
    const hold = async (selector: string) => {
      await act(async () => void find(selector)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true, pointerId: 1 })));
      await later(CAPTURE_HOLD_MS + 60);
      await act(async () => void find(selector)?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerId: 1 })));
    };
    const escape = () => act(() => void find('[data-call-mode="effects"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    const carousel = () => find('[data-call-mode-carousel]');
    const atBase = () => find('[data-call-mode-carousel]') === null && find('[data-call-effects-settings]') === null && find('[data-call-effect-layers]') === null && find('[data-call-mode-bar] [data-call-effects-categories]') !== null && find('[data-call-effects-category][aria-pressed="true"]') === null && find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed') === 'false';
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, press, hold, escape, carousel, atBase, applied, exits, opened, saved, grabbed, filmed, done };
  };

  test('l’entrée du mode ouvre le carrousel du genre demandé', () => {
    const view = mount();
    expect(view.carousel()).not.toBeNull();
    expect(view.find('[data-call-effects-category="face"]')?.getAttribute('aria-pressed')).toBe('true');
    view.done();
  });

  test('toucher une déformation l’applique, referme le carrousel et rend `‹ · Réglages · (+)` sous ses puces', async () => {
    const view = mount();
    await view.press('[data-carousel-item="toad"]');
    expect(view.applied).toEqual([{ faceEffect: 'toad' }]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    expect(view.exits).toEqual([]);
    view.done();
  });

  test('la puce « Couleur », touchée sur le menu de base, rouvre le carrousel des couleurs ; une couleur choisie le referme', async () => {
    const view = mount();
    await view.press('[data-carousel-item="toad"]');
    await later(GONE_MS);
    await view.press('[data-call-effects-category="color"]');
    expect(view.find('[data-call-mode-carousel] [data-carousel-item="golden"]')).not.toBeNull();
    await view.press('[data-carousel-item="golden"]');
    expect(view.applied).toEqual([{ faceEffect: 'toad' }, { preset: 'golden' }]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    view.done();
  });

  test('la puce du genre courant rouvre son carrousel, sur le choix appliqué', async () => {
    const view = mount();
    await view.press('[data-carousel-item="angel"]');
    await later(GONE_MS);
    await view.press('[data-call-effects-category="face"]');
    expect(view.find('[data-call-mode-carousel] [aria-checked="true"]')?.getAttribute('data-carousel-item')).toBe('angel');
    view.done();
  });

  test('(+) sur le menu de base ouvre le carrousel d’un genre absent ; le look choisi s’empile et rend le menu de base', async () => {
    const view = mount();
    await view.press('[data-carousel-item="toad"]');
    await later(GONE_MS);
    await view.press('[data-call-effects-add-look]');
    expect(view.find('[data-call-effects-category="color"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.carousel()).not.toBeNull();
    await view.press('[data-carousel-item="sky"]');
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    await view.hold('[data-call-effects-add-look]');
    expect([...document.querySelectorAll('[data-call-effect-layer]')].map((entry) => entry.getAttribute('data-call-effect-layer'))).toEqual(['color', 'face']);
    view.done();
  });

  test('retirer une déformation depuis la liste de l’appui long se fait sans « Valider » et rend le menu de base', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'demon' } });
    await view.hold('[data-call-effects-add-look]');
    await view.press('[data-call-effect-layer-undo="face"]');
    expect(view.applied).toEqual([{ faceEffect: 'none' }]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    expect(view.find('[data-call-effects-validate]')).toBeNull();
    view.done();
  });

  test('un choix refusé (trois couches) n’est pas un choix : le carrousel reste, et le refus est dit', async () => {
    setEffectLayers([{ genre: 'voice', choice: 'deep' }, { genre: 'landscape', choice: 'beach' }]);
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'toad' } });
    await view.press('[data-call-effects-category="color"]');
    await view.press('[data-carousel-item="golden"]');
    await later(GONE_MS);
    expect(view.applied).toEqual([]);
    expect(view.carousel()).not.toBeNull();
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Trois effets au plus : retirez-en un pour en ajouter');
    view.done();
  });

  test('rien ne régresse : deux tapes sur le look choisi prennent la photo, et le carrousel reste ouvert', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'angel' } });
    await view.press('[data-carousel-item="angel"]');
    await view.press('[data-carousel-item="angel"]');
    await act(async () => {});
    expect(view.grabbed).toEqual(['angel']);
    await later(GONE_MS);
    expect(view.carousel()).not.toBeNull();
    view.done();
  });

  test('rien ne régresse : l’appui long sur le look choisi le filme, et le carrousel reste ouvert', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'angel' } });
    await view.hold('[data-carousel-item="angel"]');
    expect(view.filmed).toEqual(['film']);
    expect(view.find('[data-call-record-stop]')).not.toBeNull();
    await later(GONE_MS);
    expect(view.carousel()).not.toBeNull();
    await view.press('[data-call-record-stop]');
    await act(async () => {});
    view.done();
  });

  test('au clavier, les flèches parcourent sans appliquer ni refermer ; Entrée sur le look atteint l’applique et rend le menu de base', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'angel' } });
    const angel = view.find('[data-carousel-item="angel"]') as HTMLElement;
    act(() => angel.focus());
    act(() => void angel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(view.applied).toEqual([]);
    expect(document.activeElement?.getAttribute('data-carousel-item')).toBe('demon');
    await later(GONE_MS);
    expect(view.carousel()).not.toBeNull();
    await view.press('[data-carousel-item="demon"]');
    expect(view.applied).toEqual([{ faceEffect: 'demon' }]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    view.done();
  });

  test('Entrée sur le look appliqué prend toujours la photo, sans refermer', async () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'angel' } });
    const angel = view.find('[data-carousel-item="angel"]') as HTMLElement;
    await act(async () => void angel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await act(async () => {});
    expect(view.grabbed).toEqual(['angel']);
    expect(view.carousel()).not.toBeNull();
    view.done();
  });

  test('retoucher le genre ouvert referme son carrousel ; sur le menu de base, aucune puce n’est pressée', async () => {
    const view = mount();
    expect(view.find('[data-call-effects-category="face"]')?.getAttribute('aria-pressed')).toBe('true');
    await view.press('[data-call-effects-category="face"]');
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    expect(view.applied).toEqual([]);
    view.done();
  });

  test('après un choix, le focus rejoint la puce du genre, qui rouvre le carrousel', async () => {
    const view = mount();
    const toad = view.find('[data-carousel-item="toad"]') as HTMLElement;
    act(() => toad.focus());
    await view.press('[data-carousel-item="toad"]');
    await later(GONE_MS);
    expect(document.activeElement?.getAttribute('data-call-effects-category')).toBe('face');
    view.done();
  });

  test('#17947 — ‹ referme le panneau Luminosité · Flou du fond et rend la barre de base ; un second ‹ quitte le mode', async () => {
    const view = mount();
    await view.press('[data-call-effects-settings-toggle]');
    await view.press('[data-call-effects-blur]');
    expect(view.find('[data-call-effects-settings]')).not.toBeNull();
    await view.press('[data-call-mode-quit]');
    expect(view.exits).toEqual([]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    await view.press('[data-call-mode-quit]');
    expect(view.exits).toEqual(['exit']);
    view.done();
  });

  test('‹ du panneau change de nom : « Fermer les réglages », puis « Retour à l’appel »', async () => {
    const view = mount();
    await view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-mode-quit]')?.getAttribute('aria-label')).toBe('Fermer les réglages');
    await view.press('[data-call-mode-quit]');
    expect(view.find('[data-call-mode-quit]')?.getAttribute('aria-label')).toBe('Retour à l’appel');
    view.done();
  });

  test('Échap referme le panneau d’abord, puis quitte le mode', async () => {
    const view = mount();
    await view.press('[data-call-effects-settings-toggle]');
    view.escape();
    expect(view.exits).toEqual([]);
    await later(GONE_MS);
    expect(view.atBase()).toBe(true);
    view.escape();
    expect(view.exits).toEqual(['exit']);
    view.done();
  });

  test('sur le menu de base, ‹ quitte en gardant tout ce qui est appliqué', async () => {
    const view = mount();
    await view.press('[data-carousel-item="volcano"]');
    await later(GONE_MS);
    await view.press('[data-call-mode-quit]');
    expect(view.exits).toEqual(['exit']);
    expect(view.applied).toEqual([{ faceEffect: 'volcano' }]);
    view.done();
  });

  test('« Cadres » ouvre le Montage, sur le menu de base comme avec le carrousel', async () => {
    const view = mount({ frames: true });
    await view.press('[data-carousel-item="toad"]');
    await later(GONE_MS);
    await view.press('[data-call-effects-category="frames"]');
    expect(view.opened).toEqual(['frames']);
    view.done();
  });
});
