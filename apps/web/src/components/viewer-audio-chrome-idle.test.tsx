import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { dropCarriedAudio } from '@/lib/view/audio-carry';
import { NO_MEDIA_OFFERS, type MediaViewerPage } from '@/lib/view/viewer-page-offers';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import MediaViewer from './media-viewer';

/** #10629 — le chrome de la visionneuse s'efface pendant l'écoute d'un vocal et revient au geste. */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  // Fermer la visionneuse EST une CONFIANCE (#9256, `useCarryOnClose`) : un
  // test qui démonte sans avoir explicitement refermé la page audio déclenche
  // la MÊME `carryAudio()` que la production, sur le magasin GLOBAL
  // (`audio-carry.ts`) — partagé par TOUT le process `bun test` (#9305).
  // Sans ce nettoyage, la pièce confiée ici survit au fichier et se pose,
  // au prochain test de la suite complète qui monte un `MiniAudioPlayerHost`
  // vivant, comme si ELLE l'avait reçue.
  act(() => root.unmount());
  container.remove();
  dropCarriedAudio();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await settle();
};

const voice = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-voice',
    messageId: 'm-voice',
    fileName: 'voice.m4a',
    originalName: 'voice.m4a',
    mimeType: 'audio/mp4',
    fileSize: 4096,
    fileUrl: 'https://cdn.meeshy.me/voice-en.m4a',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-23T09:00:00.000Z',
    duration: 12_000,
    transcription: { type: 'audio', transcribedText: 'Hello team', language: 'en', confidence: 0.9, source: 'whisper' },
    translations: {
      fr: { type: 'audio', transcription: 'Bonjour équipe', url: 'https://cdn.meeshy.me/voice-fr.m4a', createdAt: new Date() },
    },
    ...partial,
  }) as Attachment;

function mount(node: ReactNode): void {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

const page = (id = 'a-voice'): HTMLElement | null => document.body.querySelector<HTMLElement>(`[data-viewer-audio="${id}"]`);

const topBar = (): string | null | undefined => document.body.querySelector('[data-viewer-top-bar]')?.getAttribute('data-chrome-yields');

describe('MediaViewer — le chrome s’efface pendant l’écoute (#10629)', () => {
  test('en lecture le chrome cède, un geste le rend, la pause le rend', async () => {
    mount(<MediaViewer items={[voice()]} startIndex={0} onClose={() => {}} languages={['fr']} fallbackLanguage="en" />);
    await until(() => page() !== null);
    const track = page()?.querySelector<HTMLAudioElement>('audio[data-viewer-audio-track]');
    expect(topBar()).toBe('shown');
    act(() => {
      track?.dispatchEvent(new Event('play'));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3200));
    });
    expect(topBar()).toBe('hidden');
    await act(async () => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(topBar()).toBe('shown');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3200));
    });
    expect(topBar()).toBe('hidden');
    act(() => {
      track?.dispatchEvent(new Event('pause'));
    });
    expect(topBar()).toBe('shown');
  }, 12000);

  const dialog = (): HTMLElement => document.body.querySelector<HTMLElement>('[data-media-viewer]')!;
  const play = (): void => {
    act(() => {
      page()?.querySelector<HTMLAudioElement>('audio[data-viewer-audio-track]')?.dispatchEvent(new Event('play'));
    });
  };
  const idleFor = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3200));
    });
  /** Un clic de SOURIS (`detail: 1`) — `button.click()` vaut une activation au clavier (`detail: 0`). */
  const mouseClick = (element: Element | null): void => {
    act(() => {
      element?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
  };

  test('le focus tenu par la croix ne tombe pas dans le chrome inerte : il revient à la visionneuse, et Échap ferme toujours', async () => {
    const closed: number[] = [];
    mount(<MediaViewer items={[voice()]} startIndex={0} onClose={() => closed.push(1)} languages={['fr']} fallbackLanguage="en" />);
    await until(() => page() !== null);
    document.body.querySelector<HTMLButtonElement>('[data-viewer-top-bar] button')?.focus();
    play();
    await idleFor();
    expect(topBar()).toBe('hidden');
    expect(document.activeElement).toBe(dialog());
    act(() => {
      dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(closed).toEqual([1]);
  }, 8000);

  test('la rangée d’émojis ouverte tient le chrome à l’écran ; refermée, il s’efface de nouveau', async () => {
    const item = voice();
    const pageOf = (): MediaViewerPage => ({ attachment: item, messageId: '65f0a1b2c3d4e5f6a7b8c9d0', conversationId: 'c-a', offers: { ...NO_MEDIA_OFFERS, react: true } });
    mount(<MediaViewer items={[item]} startIndex={0} onClose={() => {}} languages={['fr']} fallbackLanguage="en" actionsAt={pageOf} />);
    await until(() => page() !== null && dialog().querySelector('[data-viewer-action="react"]') !== null);
    mouseClick(dialog().querySelector('[data-viewer-action="react"]'));
    expect(dialog().querySelector('[data-viewer-reactions]')).not.toBeNull();
    play();
    await idleFor();
    expect(topBar()).toBe('shown');
    expect(dialog().querySelector('[data-viewer-reactions]')).not.toBeNull();
    mouseClick(dialog().querySelector('[data-viewer-action="react"]'));
    expect(dialog().querySelector('[data-viewer-reactions]')).toBeNull();
    await idleFor();
    expect(topBar()).toBe('hidden');
  }, 12000);
});
