import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallCaption } from '@/lib/calls/call-captions';
import type { ClipEnv } from '@/lib/calls/call-capture-live';
import type { CaptureFile } from '@/lib/calls/call-capture-save';
import { NO_EFFECTS, videoEffectsStore, type VideoEffects } from '@/lib/calls/video-effects';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';

import type { EffectsCompanion } from './call-effects-companions';
import { CallEffectsMode, type FrameGrab } from './call-effects-mode';

/**
 * LE MODE EFFETS (#8578) — l'écran se libère : ma vidéo en plein écran, un
 * seul carrousel en bas, la catégorie « Visage · Couleur » au-dessus, et la
 * barre ✕ · Réglages · Valider. Chaque choix part aussitôt ; ✕ rend les effets
 * d'avant, Valider les garde. Plus de déclencheur (#8625) : deux tapes sur
 * l'effet choisi capturent mon image, un appui long la filme.
 */

describe('CallEffectsMode', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const companion = (id: string): EffectsCompanion => ({
    id,
    name: id,
    color: '#123456',
    render: () => <video data-testid={`peer-${id}`} />,
  });

  const saying = (speakerId: string): CallCaption => ({ id: `${speakerId}-1`, speakerId, speakerName: speakerId, original: '…', translated: null, pair: null, isFinal: false, at: 1, mine: false });

  const mount = (options: { readonly color?: boolean; readonly blur?: boolean; readonly effects?: VideoEffects; readonly companions?: readonly EffectsCompanion[]; readonly captions?: readonly CallCaption[] } = {}) => {
    videoEffectsStore.setState({ effects: options.effects ?? NO_EFFECTS });
    const applied: Array<Partial<VideoEffects>> = [];
    const exits: string[] = [];
    const saved: Array<readonly CaptureFile[]> = [];
    const grabbed: string[] = [];
    const released: string[] = [];
    const grab: FrameGrab = {
      still: async (video, style) => (grabbed.push(`${video.getAttribute('data-testid')}:${style}`), { blob: new Blob(['png']), fileName: `meeshy-appel-${style}.png` }),
      film: () => ({ track: { kind: 'video' } as MediaStreamTrack, release: () => void released.push('video') }),
    };
    const clipEnv = (): ClipEnv => ({
      isTypeSupported: (mime) => mime === 'video/webm',
      record: (_stream, _mime, push, end) => ({ stop: () => queueMicrotask(() => (push(new Blob(['clip'])), end())) }),
      mixAudio: () => ({ track: null, close: () => undefined }),
      createStream: (tracks) => ({ getTracks: () => tracks }) as unknown as MediaStream,
      now: () => new Date(2026, 8, 29, 18, 4, 9),
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <CallEffectsMode
          language="fr"
          colorAvailable={options.color ?? true}
          blurAvailable={options.blur ?? false}
          preview={
            <>
              <video data-testid="decoy" />
              <video data-testid="self-preview" />
            </>
          }
          selfVideo={() => host.querySelector<HTMLVideoElement>('[data-testid="self-preview"]')}
          companions={options.companions ?? []}
          captions={options.captions ?? []}
          quitGlyph={null}
          onExit={() => void exits.push('exit')}
          grab={grab}
          clipEnv={clipEnv}
          save={async (files) => (saved.push(files), { saved: files.length, failed: 0, cancelled: 0 })}
          apply={(patch) => {
            applied.push(patch);
            videoEffectsStore.setState((state) => ({ effects: { ...state.effects, ...patch } }));
          }}
        />,
      ),
    );
    const find = (selector: string) => host.querySelector(selector);
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const settle = async (selector: string) => {
      await act(async () => (find(selector) as HTMLElement | null)?.click());
      await act(async () => {});
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, find, all, press, settle, applied, exits, saved, grabbed, released, done };
  };

  test('une région nommée, ma vidéo en plein écran derrière, un seul carrousel', () => {
    const view = mount();
    const region = view.find('[data-call-mode="effects"]');
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Effets de ma vidéo');
    expect(view.find('[data-call-mode-preview="effects"] [data-testid="self-preview"]')).not.toBeNull();
    expect(view.find('[data-call-mode-preview="effects"]')?.className).toContain('fixed inset-0');
    expect(view.all('[data-call-mode-carousel]')).toHaveLength(1);
    view.done();
  });

  test('« Visage » d’abord : les six effets, « Aucun » coché ; « Couleur » montre les cinq préréglages', () => {
    const view = mount();
    const categories = view.all('[data-call-effects-category]');
    expect(categories.map((button) => button.textContent)).toEqual(['Visage', 'Couleur']);
    expect(categories.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(view.all('[data-carousel-item]').map((item) => item.getAttribute('data-carousel-item'))).toEqual(['none', 'smoothing', 'toad', 'angel', 'demon', 'volcano']);
    expect(view.find('[aria-checked="true"]')?.getAttribute('data-carousel-item')).toBe('none');
    view.press('[data-call-effects-category="color"]');
    expect(view.all('[data-carousel-item]').map((item) => item.getAttribute('data-carousel-item'))).toEqual(['natural', 'warm', 'cool', 'vivid', 'muted']);
    view.done();
  });

  test('toucher un effet l’applique aussitôt et le coche', () => {
    const view = mount();
    view.press('[data-carousel-item="volcano"]');
    expect(view.applied).toEqual([{ faceEffect: 'volcano' }]);
    expect(view.find('[data-carousel-item="volcano"]')?.getAttribute('aria-checked')).toBe('true');
    expect(view.find('[data-call-mode-selected]')?.textContent).toBe('Éruption');
    view.done();
  });

  test('→ passe au voisin ; au bout, rien ne boucle', () => {
    const view = mount({ effects: { ...NO_EFFECTS, faceEffect: 'volcano' } });
    const last = view.find('[data-carousel-item="volcano"]') as HTMLElement;
    act(() => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(view.applied).toEqual([]);
    act(() => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(view.applied).toEqual([{ faceEffect: 'demon' }]);
    view.done();
  });

  test('« Réglages » remplace le carrousel par la luminosité et le flou ; le retoucher rend le carrousel', () => {
    const view = mount({ blur: true });
    expect(view.find('[data-call-effects-settings]')).toBeNull();
    view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-effects-settings-toggle]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.find('[data-call-mode-carousel]')).toBeNull();
    const slider = view.find('input[type="range"]') as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(['-50', '50', '5']);
    act(() => {
      slider.value = '20';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    view.press('[data-call-effects-blur]');
    expect(view.applied).toEqual([{ brightness: 0.2 }, { blur: true }]);
    view.press('[data-call-effects-settings-toggle]');
    expect(view.find('[data-call-mode-carousel]')).not.toBeNull();
    view.done();
  });

  test('sans traitement d’images, seul le flou reste — et ni carrousel ni bouton Réglages', () => {
    const view = mount({ color: false, blur: true });
    expect(view.find('[data-call-mode-carousel]')).toBeNull();
    expect(view.find('[data-call-effects-settings-toggle]')).toBeNull();
    expect(view.find('input[type="range"]')).toBeNull();
    expect(view.find('[data-call-effects-blur]')).not.toBeNull();
    view.done();
  });

  test('Valider garde l’effet et quitte le mode', () => {
    const view = mount();
    view.press('[data-carousel-item="angel"]');
    view.press('[data-call-effects-validate]');
    expect(view.exits).toEqual(['exit']);
    expect(view.applied).toEqual([{ faceEffect: 'angel' }]);
    view.done();
  });

  test('✕ rend les effets d’avant le mode, puis quitte ; Échap aussi, sans réduire l’appel', () => {
    const before: VideoEffects = { ...NO_EFFECTS, preset: 'cool' };
    const view = mount({ effects: before });
    view.press('[data-carousel-item="toad"]');
    view.press('[data-call-mode-quit]');
    expect(view.applied.at(-1)).toEqual(before);
    expect(view.exits).toEqual(['exit']);
    const reached: string[] = [];
    const onWindow = () => void reached.push('window');
    window.addEventListener('keydown', onWindow);
    act(() => view.find('[data-call-mode="effects"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    window.removeEventListener('keydown', onWindow);
    expect(view.exits).toEqual(['exit', 'exit']);
    expect(reached).toEqual([]);
    view.done();
  });

  test('la barre : Quitter, Réglages, Valider — plus de déclencheur ; toutes les cibles font au moins 44 px (#8625)', () => {
    const view = mount({ blur: true });
    const bar = view.find('[data-call-mode-bar]');
    expect(bar?.querySelector('[data-call-mode-quit]')?.getAttribute('aria-label')).toBe('Quitter sans garder ces changements');
    expect(bar?.querySelector('[data-call-effects-validate]')?.className).not.toContain('size-[72px]');
    expect(view.find('[data-call-capture-shoot]')).toBeNull();
    const small = view.all('[data-call-mode="effects"] button').filter((button) => !/min-h-11|size-12|size-\[72px\]|sr-only/.test(button.className) && (button as HTMLElement).style.height !== '64px');
    expect(small).toEqual([]);
    view.done();
  });

  test('deux tapes sur l’effet choisi capturent MON image, avec son effet (#8625)', async () => {
    const view = mount();
    await view.settle('[data-carousel-item="angel"]');
    expect(view.saved).toEqual([]);
    await view.settle('[data-carousel-item="angel"]');
    await view.settle('[data-carousel-item="angel"]');
    expect(view.grabbed).toEqual(['self-preview:angel']);
    expect(view.saved.map((files) => files.map((file) => file.fileName))).toEqual([['meeshy-appel-angel.png']]);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Capture enregistrée');
    expect(view.exits).toEqual([]);
    view.done();
  });

  test('filmer mon image : stop, au centre, enregistre UNE vidéo et rend la piste (#8625)', async () => {
    const view = mount();
    await view.settle('[data-call-record-key]');
    expect(view.find('[data-call-recording] [data-call-record-stop]')).not.toBeNull();
    await view.settle('[data-call-record-stop]');
    await act(async () => {});
    expect(view.saved.map((files) => files.map((file) => [file.fileName, file.mimeType]))).toEqual([[['meeshy-appel-none-20260929-180409.webm', 'video/webm']]]);
    expect(view.released).toEqual(['video']);
    view.done();
  });
  test('les autres restent visibles : un bloc nommé, en haut, HORS de l’aperçu capturé, qu’on touche (#8737)', () => {
    const view = mount({ companions: [companion('amina')] });
    const block = view.find('[data-call-effects-companions]');
    expect(block?.getAttribute('role')).toBe('group');
    expect(block?.getAttribute('aria-label')).toBe('Participants à l’appel');
    expect(block?.closest('[data-call-mode-preview]')).toBeNull();
    expect(view.find('[data-call-mode-preview] [data-testid="peer-amina"]')).toBeNull();
    expect(view.find('[data-call-effects-companion="amina"] [data-testid="peer-amina"]')).not.toBeNull();
    expect(view.find('[data-testid="peer-amina"]')?.closest('[aria-hidden="true"]')).toBeNull();
    expect(block?.className).toContain('pointer-events-auto');
    expect((block?.closest('[data-call-effects-companions-band]') as HTMLElement | null)?.style.top).toContain('safe-area-inset-top');
    view.done();
  });

  test('seul dans l’appel, aucun bloc', () => {
    const view = mount();
    expect(view.find('[data-call-effects-companions]')).toBeNull();
    view.done();
  });

  test('en groupe : trois vignettes dans l’ordre d’arrivée, le reste en « +N » nommé ; l’orateur hors cadre prend la dernière place (#8737)', () => {
    const view = mount({ companions: ['a', 'b', 'c', 'd', 'e'].map(companion), captions: [saying('e')] });
    expect(view.all('[data-call-effects-companion]').map((tile) => tile.getAttribute('data-call-effects-companion'))).toEqual(['a', 'b', 'e']);
    const chip = view.find('[data-call-effects-companions-more]');
    expect(chip?.textContent).toBe('+2');
    expect(chip?.getAttribute('aria-label')).toBe('2 autres participants');
    const speaker = view.find('[data-call-effects-companion="e"]') as HTMLElement;
    expect(speaker.hasAttribute('data-call-effects-companion-speaking')).toBe(true);
    expect(speaker.style.borderWidth).toBe('4px');
    expect((view.find('[data-call-effects-companion="a"]') as HTMLElement).style.borderWidth).toBe('2px');
    view.done();
  });

  test('glissé, le bloc suit le doigt puis rejoint le coin du haut le plus proche ; « Changer de côté » le fait au clavier (#8737)', () => {
    const view = mount({ companions: [companion('amina')] });
    const block = view.find('[data-call-effects-companions]') as HTMLElement;
    expect(block.getAttribute('data-call-effects-companions-corner')).toBe('top-trailing');
    const pointer = (type: string, clientX: number, clientY = 40) => act(() => void block.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY, button: 0, pointerType: 'touch' })));
    pointer('pointerdown', 900);
    pointer('pointermove', 700, 60);
    expect(block.style.transform).toBe('translate(-200px, 20px)');
    expect(block.className).not.toContain('transition-');
    pointer('pointerup', 700, 60);
    expect(block.getAttribute('data-call-effects-companions-corner')).toBe('top-trailing');
    expect(block.style.transform).toBe('');
    pointer('pointerdown', 900);
    pointer('pointermove', 100);
    pointer('pointerup', 100);
    expect(block.getAttribute('data-call-effects-companions-corner')).toBe('top-leading');
    expect(block.className).toContain('motion-reduce:transition-none');
    view.press('[data-call-effects-companions-move]');
    expect(block.getAttribute('data-call-effects-companions-corner')).toBe('top-trailing');
    expect(view.find('[data-call-effects-companions-move]')?.textContent).toBe('Changer de côté');
    view.done();
  });

  test('la capture reste MON image : ni une vignette d’un autre, ni une vidéo voisine de l’aperçu (#8737)', async () => {
    const view = mount({ companions: [companion('amina')] });
    await view.settle('[data-carousel-item="angel"]');
    await view.settle('[data-carousel-item="angel"]');
    await view.settle('[data-carousel-item="angel"]');
    expect(view.grabbed).toEqual(['self-preview:angel']);
    view.done();
  });
});
