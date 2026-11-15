import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { dropCarriedAudio } from '@/lib/view/audio-carry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import MediaViewer from './media-viewer';

/**
 * #10701 — LES PAROLES D'UN VOCAL SE PARCOURENT AU CLAVIER.
 *
 * Les mots synchronisés se cliquaient (la lecture saute au mot) mais aucun ne
 * se focalisait : au clavier, on ne sautait que par le curseur et ±10 s.
 * Choix tranché : un FOCUS ITINÉRANT — un seul arrêt de tabulation dans les
 * paroles, les flèches passent de mot en mot, Entrée ou Espace y place la
 * lecture. Les mots restent du TEXTE (aucun rôle) : le lecteur d'écran lit le
 * paragraphe d'un seul tenant, et annonce le mot qui prend le focus.
 */

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
    transcription: {
      type: 'audio',
      transcribedText: 'Hello dear team',
      language: 'en',
      confidence: 0.9,
      source: 'whisper',
      segments: [
        { startMs: 0, endMs: 1_000, text: 'Hello' },
        { startMs: 1_000, endMs: 2_500, text: 'dear' },
        { startMs: 2_500, endMs: 4_000, text: 'team' },
      ],
    },
    translations: {},
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
const dialog = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[data-media-viewer]');
const words = (): HTMLElement[] => [...(page()?.querySelectorAll<HTMLElement>('[data-karaoke]') ?? [])];
const tabStops = (): string[] => words().filter((w) => w.tabIndex === 0).map((w) => w.textContent ?? '');
const press = (target: Element | null, key: string) =>
  act(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

async function openViewer(items: readonly Attachment[]): Promise<void> {
  mount(<MediaViewer items={items} startIndex={0} onClose={() => {}} languages={['en']} fallbackLanguage="en" />);
  await until(() => words().length > 0);
}

describe('Les paroles d’un vocal en plein écran se parcourent au clavier (#10701)', () => {
  test('un SEUL arrêt de tabulation dans les paroles, sur le premier mot quand rien ne joue', async () => {
    await openViewer([voice()]);

    expect(words().map((w) => w.textContent)).toEqual(['Hello', 'dear', 'team']);
    expect(tabStops()).toEqual(['Hello']);
    expect(words().every((w) => w.tabIndex === 0 || w.tabIndex === -1)).toBe(true);
  });

  test('les flèches passent de mot en mot, Début et Fin vont aux bornes, et l’arrêt de tabulation suit', async () => {
    await openViewer([voice()]);

    act(() => words()[0]?.focus());
    press(document.activeElement, 'ArrowRight');
    expect(document.activeElement?.textContent).toBe('dear');
    expect(tabStops()).toEqual(['dear']);

    press(document.activeElement, 'End');
    expect(document.activeElement?.textContent).toBe('team');
    press(document.activeElement, 'ArrowRight');
    expect(document.activeElement?.textContent).toBe('team');

    press(document.activeElement, 'Home');
    expect(document.activeElement?.textContent).toBe('Hello');
    press(document.activeElement, 'ArrowLeft');
    expect(document.activeElement?.textContent).toBe('Hello');
    expect(tabStops()).toEqual(['Hello']);
  });

  test('une flèche dans les paroles ne change PAS de vocal — elle reste dans le texte', async () => {
    await openViewer([voice(), voice({ id: 'a-voice-2', fileUrl: 'https://cdn.meeshy.me/second.m4a' })]);

    act(() => words()[0]?.focus());
    press(document.activeElement, 'ArrowRight');
    await settle();

    expect(dialog()?.getAttribute('data-viewer-attachment')).toBe('a-voice');
    expect(document.activeElement?.textContent).toBe('dear');
  });

  test('Entrée ou Espace sur un mot place la lecture à son début', async () => {
    await openViewer([voice()]);
    const track = page()?.querySelector<HTMLAudioElement>('audio');

    act(() => words()[2]?.focus());
    press(document.activeElement, 'Enter');
    expect(track?.currentTime).toBe(2.5);

    act(() => words()[1]?.focus());
    press(document.activeElement, ' ');
    expect(track?.currentTime).toBe(1);
  });

  test('au lecteur d’écran les mots restent du texte : le paragraphe se lit d’un seul tenant', async () => {
    await openViewer([voice()]);

    expect(words().some((w) => w.hasAttribute('role'))).toBe(false);
    expect(page()?.querySelector('[data-viewer-audio-transcript]')?.textContent).toBe('Hello dear team');
  });
});
