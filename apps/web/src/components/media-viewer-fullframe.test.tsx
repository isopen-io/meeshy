import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { dropCarriedAudio } from '@/lib/view/audio-carry';
import type { MediaCarrier } from '@/lib/view/media';

import MediaViewer from './media-viewer';

const photo = (id: string): Attachment =>
  ({
    id,
    messageId: `m-${id}`,
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 4096,
    fileUrl: `/uploads/${id}.jpg`,
    width: 800,
    height: 600,
    uploadedBy: 'u',
    isAnonymous: false,
    isViewOnce: false,
    isBlurred: false,
    createdAt: '2026-09-20T10:00:00.000Z',
  }) as unknown as Attachment;

const clip = (id: string): Attachment =>
  ({ ...photo(id), fileName: `${id}.mp4`, mimeType: 'video/mp4', fileUrl: `/uploads/${id}.mp4`, width: 1920, height: 1080, duration: 42_000 }) as unknown as Attachment;

const carrier: MediaCarrier = {
  sender: { displayName: 'Nour Haddad', avatarUrl: null },
  sentAt: '2026-09-20T10:13:00.000Z',
  caption: { text: 'Le port', language: 'fr', translated: false },
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;
let restorePlayback: () => void = () => {};
const playbackCalls: string[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  // Démonter la visionneuse sur un vocal qui joue (lecture simulée) le CONFIE
  // au mini-lecteur (#9256, `useCarryOnClose`) — sur le magasin GLOBAL du
  // process `bun test` (#9305). Sans ce nettoyage, le vocal confié survit au
  // fichier : le bandeau du haut (`top-band.test.tsx`) voit un audio jouer et
  // n'a plus de place pour la bannière du joueur.
  act(() => root.unmount());
  container.remove();
  dropCarriedAudio();
  restorePlayback();
  document.dir = '';
  playbackCalls.length = 0;
});

async function mount(items: readonly Attachment[]): Promise<HTMLElement> {
  const { play, pause } = HTMLMediaElement.prototype;
  HTMLMediaElement.prototype.play = function stubbedPlay(this: HTMLMediaElement) {
    playbackCalls.push('play');
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function stubbedPause(this: HTMLMediaElement) {
    playbackCalls.push('pause');
    this.dispatchEvent(new Event('pause'));
  };
  restorePlayback = () => {
    HTMLMediaElement.prototype.play = play;
    HTMLMediaElement.prototype.pause = pause;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MediaViewer items={items} startIndex={0} onClose={() => {}} languages={['fr']} fallbackLanguage="fr" carrier={carrier} />);
  });
  await act(async () => {
    await import('./viewer-video-page');
    await import('./media-transport');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return document.body.querySelector<HTMLElement>('[data-media-viewer]')!;
}

const frameOf = (dialog: HTMLElement): HTMLElement => dialog.querySelector<HTMLElement>('.media-viewer-track-frame')!;
const pointer = (type: string, x = 100, y = 100) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true });
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const topBar = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('[data-viewer-top-bar]')!;
const bottomBar = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('[data-viewer-bottom-bar]')!;

describe('MediaViewer — plein cadre bord à bord', () => {
  test('en carte, les barres occupent le flux ; en plein cadre, elles se superposent et la scène couvre tout le viewport', async () => {
    const dialog = await mount([clip('v'), photo('p')]);
    expect(topBar(dialog).className).toContain('relative');
    expect(bottomBar(dialog).className).toContain('relative');
    click(frameOf(dialog));
    expect(topBar(dialog).className).toContain('absolute');
    expect(bottomBar(dialog).className).toContain('absolute');
    expect(topBar(dialog).className).not.toContain('viewer-scrim');
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('hidden');
    click(frameOf(dialog));
    expect(topBar(dialog).className).toContain('relative');
  });

  test('un vocal ne change pas de disposition (ses commandes occupent la scène)', async () => {
    const audio = { ...photo('a'), mimeType: 'audio/mpeg', fileName: 'a.mp3', fileUrl: '/uploads/a.mp3' } as unknown as Attachment;
    const dialog = await mount([audio]);
    expect(topBar(dialog).className).toContain('relative');
  });

  test('la page vidéo garde le glissé vertical : touch-action none', async () => {
    const dialog = await mount([clip('v')]);
    const page = dialog.querySelector<HTMLElement>('[data-viewer-page] video')!.parentElement!;
    expect(page.style.touchAction).toBe('none');
  });

  test('la ligne d’informations de la vidéo ne bascule pas la scène', async () => {
    const dialog = await mount([clip('v')]);
    const meta = dialog.querySelector('[data-viewer-meta]')!;
    click(meta);
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('shown');
  });
});

describe('MediaViewer — appui long', () => {
  test('le clic qui suit un appui long ne rebascule pas le plein cadre', async () => {
    const dialog = await mount([photo('a'), photo('b')]);
    const frame = frameOf(dialog);
    act(() => void frame.dispatchEvent(pointer('pointerdown')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 560));
    });
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('hidden');
    act(() => void frame.dispatchEvent(pointer('pointerup')));
    click(frame);
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('hidden');
    click(frame);
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('shown');
  });

  test('un appui long TENU au-delà de la fenêtre avale encore le clic de son relâchement', async () => {
    const dialog = await mount([photo('a'), photo('b')]);
    const frame = frameOf(dialog);
    act(() => void frame.dispatchEvent(pointer('pointerdown')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
    });
    act(() => void frame.dispatchEvent(pointer('pointerup')));
    click(frame);
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('hidden');
  });

  test('un vrai tap après un appui long bascule bien (le nouvel appui oublie le précédent)', async () => {
    const dialog = await mount([photo('a'), photo('b')]);
    const frame = frameOf(dialog);
    act(() => void frame.dispatchEvent(pointer('pointerdown')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 560));
    });
    act(() => void frame.dispatchEvent(pointer('pointerup')));
    act(() => void frame.dispatchEvent(pointer('pointerdown')));
    act(() => void frame.dispatchEvent(pointer('pointerup')));
    click(frame);
    expect(topBar(dialog).getAttribute('data-chrome-yields')).toBe('shown');
  });
});

describe('MediaViewer — clavier', () => {
  const key = (dialog: HTMLElement, k: string) => act(() => void dialog.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));

  test('en RTL, Flèche gauche avance et Flèche droite recule, comme le glissé', async () => {
    document.dir = 'rtl';
    const dialog = await mount([photo('a'), photo('b')]);
    key(dialog, 'ArrowLeft');
    expect(dialog.getAttribute('data-viewer-index')).toBe('1');
    key(dialog, 'ArrowRight');
    expect(dialog.getAttribute('data-viewer-index')).toBe('0');
  });

  test('en LTR, Flèche droite avance', async () => {
    const dialog = await mount([photo('a'), photo('b')]);
    key(dialog, 'ArrowRight');
    expect(dialog.getAttribute('data-viewer-index')).toBe('1');
  });

  test('Espace sur le bouton central ne bascule pas la lecture deux fois', async () => {
    const dialog = await mount([clip('v')]);
    const button = dialog.querySelector<HTMLElement>('[data-viewer-center-toggle]')!;
    const before = playbackCalls.length;
    act(() => void button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })));
    expect(playbackCalls.length).toBe(before);
  });

  test('Espace sur un bouton du chrome (Fermer) lui laisse son activation : la lecture ne bascule pas', async () => {
    const dialog = await mount([clip('v')]);
    const close = topBar(dialog).querySelector<HTMLElement>('button')!;
    const before = playbackCalls.length;
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => void close.dispatchEvent(event));
    expect(playbackCalls.length).toBe(before);
    expect(event.defaultPrevented).toBe(false);
  });

  test('Espace sur la visionneuse elle-même bascule la lecture', async () => {
    const dialog = await mount([clip('v')]);
    const before = playbackCalls.length;
    key(dialog, ' ');
    expect(playbackCalls.length).toBe(before + 1);
  });
});
