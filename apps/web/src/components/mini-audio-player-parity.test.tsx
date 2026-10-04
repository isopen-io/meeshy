import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { audioCarryStore, carryAudio, concealsMiniPlayer, dropCarriedAudio, publishCarriedPlayback, type CarriedAudio } from '@/lib/view/audio-carry';
import type { MediaCarrier } from '@/lib/view/media';
import { createMediaCoordinator } from '@/lib/view/media-coordinator';
import { takeVideoHandoff } from '@/lib/view/video-handoff';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Attachments } from './attachment-blocks';
import MediaViewer from './media-viewer';
import MiniAudioPlayerHost, { MiniAudioPlayer } from './mini-audio-player';

/**
 * #9279 — LE MINI-LECTEUR REJOINT iOS (`MiniAudioPlayerBar`) : le toucher
 * rouvre le plein écran à la même seconde, il s'efface dans la conversation du
 * vocal où la bulle reprend la main, et il ne double jamais le son.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;
type Calls = { play: number; pause: number };
let calls: Calls;
let restore: () => void;

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
  restore();
  dropCarriedAudio();
  takeVideoHandoff('a-voice');
});

function stubMediaPrototype(): void {
  const proto = HTMLMediaElement.prototype;
  const original = { play: proto.play, pause: proto.pause };
  calls = { play: 0, pause: 0 };
  proto.play = function play(this: HTMLMediaElement) {
    calls.play += 1;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    calls.pause += 1;
    this.dispatchEvent(new Event('pause'));
  };
  restore = () => {
    proto.play = original.play;
    proto.pause = original.pause;
  };
}

const voice: Attachment = {
  ...attachmentDefaults,
  id: 'a-voice',
  messageId: 'm-voice',
  fileName: 'note.wav',
  originalName: 'note.wav',
  mimeType: 'audio/wav',
  fileUrl: 'https://cdn.meeshy.me/original.wav',
  uploadedBy: 'u-kwame',
  createdAt: '2026-10-04T09:00:00.000Z',
  duration: 8_000,
} as Attachment;

const carrier: MediaCarrier = { caption: null, sender: { displayName: 'Kwame Mensah', avatarUrl: null }, sentAt: '2026-10-04T09:00:00.000Z' };

const carried = (partial: Partial<CarriedAudio> = {}): CarriedAudio => ({
  attachment: voice,
  trackUrl: 'https://cdn.meeshy.me/original.wav',
  trackLanguage: 'fr',
  positionMs: 3_500,
  rate: 1,
  title: 'Kwame Mensah',
  conversationId: 'c-medias',
  languages: ['fr'],
  fallbackLanguage: 'fr',
  carrier,
  ...partial,
});

function mount(node: Parameters<Root['render']>[0]): void {
  stubMediaPrototype();
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await settle();
};

const bar = (): HTMLElement | null => container.querySelector<HTMLElement>('[data-mini-audio-player]');
const viewerTrack = (): HTMLAudioElement | null => document.body.querySelector<HTMLAudioElement>('[data-media-viewer] [data-viewer-audio="a-voice"] audio');

describe('Le toucher rouvre le plein écran à la même seconde (#9279)', () => {
  test('toucher le corps du lecteur confie sa seconde à la page audio et demande l’ouverture', async () => {
    let opened = 0;
    mount(
      <MiniAudioPlayer
        carried={carried()}
        onClose={() => {}}
        onOpen={() => {
          opened += 1;
        }}
        coordinator={createMediaCoordinator()}
      />,
    );
    await act(async () => {});

    const open = container.querySelector<HTMLButtonElement>('[data-mini-audio-open]');
    expect(open?.getAttribute('aria-label')).toBe('Kwame Mensah — Ouvrir en plein écran');
    act(() => open?.click());

    expect(opened).toBe(1);
    expect(takeVideoHandoff('a-voice')).toBe(3_500);
  });

  test('une lecture vivante passe à la seconde près, même sous la première seconde', async () => {
    mount(<MiniAudioPlayer carried={carried({ positionMs: 600 })} onClose={() => {}} coordinator={createMediaCoordinator()} />);
    await act(async () => {});

    expect(container.querySelector<HTMLAudioElement>('audio')?.currentTime).toBe(0.6);
  });

  test('la page audio reprend la seconde confiée, même sous la première seconde', async () => {
    mount(<MiniAudioPlayerHost />);
    act(() => carryAudio(carried({ positionMs: 0 })));
    await act(async () => {});
    const mini = container.querySelector<HTMLAudioElement>('[data-mini-audio-player] audio');
    if (mini !== null) mini.currentTime = 0.7;

    act(() => container.querySelector<HTMLButtonElement>('[data-mini-audio-open]')?.click());
    await until(() => viewerTrack() !== null);

    expect(viewerTrack()?.currentTime).toBe(0.7);
  });

  test('lecture/pause et fermer ne rouvrent rien', async () => {
    let opened = 0;
    mount(
      <MiniAudioPlayer
        carried={carried()}
        onClose={() => {}}
        onOpen={() => {
          opened += 1;
        }}
        coordinator={createMediaCoordinator()}
      />,
    );
    await act(async () => {});

    act(() => container.querySelector<HTMLButtonElement>('[data-mini-audio-toggle]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-mini-audio-close]')?.click());

    expect(opened).toBe(0);
  });

  test('l’hôte rouvre la page audio du même vocal, qui reprend à la même seconde et joue ; la refermer en lecture rend le mini-lecteur', async () => {
    mount(<MiniAudioPlayerHost />);
    act(() => carryAudio(carried()));
    await act(async () => {});
    const serial = audioCarryStore.getState().serial;

    act(() => container.querySelector<HTMLButtonElement>('[data-mini-audio-open]')?.click());
    await until(() => viewerTrack() !== null);

    expect(bar()).toBeNull();
    expect(viewerTrack()?.currentTime).toBe(3.5);
    expect(document.body.querySelector('[data-media-viewer] [data-viewer-audio="a-voice"]')?.getAttribute('data-viewer-audio-status')).toBe('playing');

    const element = viewerTrack();
    if (element !== null) element.currentTime = 5.25;
    act(() => {
      document.body.querySelector('[data-media-viewer]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await until(() => bar() !== null);

    expect(document.body.querySelector('[data-media-viewer]')).toBeNull();
    expect(audioCarryStore.getState().serial).toBe(serial + 1);
    expect(audioCarryStore.getState().carried?.positionMs).toBe(5_250);
    expect(audioCarryStore.getState().carried?.conversationId).toBe('c-medias');
    expect(bar()?.getAttribute('data-mini-audio-player')).toBe('a-voice');
  });
});

describe('Dans la conversation du vocal, le mini-lecteur s’efface (#9279)', () => {
  test('la loi : effacé dans SA conversation, visible ailleurs et hors conversation', () => {
    expect(concealsMiniPlayer({ carried: carried(), openConversationId: 'c-medias' })).toBe(true);
    expect(concealsMiniPlayer({ carried: carried(), openConversationId: 'c-kwame' })).toBe(false);
    expect(concealsMiniPlayer({ carried: carried(), openConversationId: null })).toBe(false);
    expect(concealsMiniPlayer({ carried: carried({ conversationId: null }), openConversationId: 'c-medias' })).toBe(false);
  });

  test('effacé, il ne montre rien mais la lecture continue', async () => {
    mount(<MiniAudioPlayer carried={carried()} concealed onClose={() => {}} coordinator={createMediaCoordinator()} />);
    await act(async () => {});

    const holder = container.querySelector<HTMLElement>('[data-mini-audio-concealed]');
    expect(holder?.hidden).toBe(true);
    expect(calls.play).toBe(1);
    expect(calls.pause).toBe(0);
    expect(bar()?.getAttribute('data-mini-audio-status')).toBe('playing');
  });

  test('il publie sa lecture, que sa télécommande commande, et la retire en partant', async () => {
    mount(<MiniAudioPlayer carried={carried()} onClose={() => {}} coordinator={createMediaCoordinator()} />);
    await act(async () => {});

    const live = audioCarryStore.getState().live;
    expect(live?.attachmentId).toBe('a-voice');
    expect(live?.status).toBe('playing');
    act(() => live?.toggle());
    expect(calls.pause).toBe(1);
    expect(audioCarryStore.getState().live?.status).toBe('paused');

    act(() => root.render(null));
    expect(audioCarryStore.getState().live).toBeNull();
  });
});

describe('La bulle du vocal reprend la main (#9279)', () => {
  const bubbleToggle = (): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('[data-attachment="a-voice"] button');

  test('la bulle reflète la lecture du mini-lecteur et la commande, sans ouvrir un second son', async () => {
    mount(<Attachments attachments={[voice]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    expect(bubbleToggle()?.getAttribute('aria-label')).toBe("Lire l'audio");

    let toggled = 0;
    act(() =>
      publishCarriedPlayback({
        attachmentId: 'a-voice',
        status: 'playing',
        progress: 0.5,
        position: 4,
        duration: 8,
        rate: 1,
        element: null,
        toggle: () => {
          toggled += 1;
        },
        seek: () => {},
        setRate: () => {},
      }),
    );

    expect(bubbleToggle()?.getAttribute('aria-label')).toBe('Mettre en pause');
    act(() => bubbleToggle()?.click());
    expect(toggled).toBe(1);
    expect(calls.play).toBe(0);

    act(() => dropCarriedAudio());
    expect(bubbleToggle()?.getAttribute('aria-label')).toBe("Lire l'audio");
  });

  test('une autre bulle garde sa propre lecture', async () => {
    mount(<Attachments attachments={[voice]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    act(() =>
      publishCarriedPlayback({
        attachmentId: 'a-other',
        status: 'playing',
        progress: 0.5,
        position: 4,
        duration: 8,
        rate: 1,
        element: null,
        toggle: () => {},
        seek: () => {},
        setRate: () => {},
      }),
    );

    expect(bubbleToggle()?.getAttribute('aria-label')).toBe("Lire l'audio");
  });
});

describe('La reprise emporte sa conversation et de quoi rouvrir (#9279)', () => {
  test('fermer la visionneuse pendant la lecture confie la conversation, le prisme et le porteur', async () => {
    mount(
      <MediaViewer items={[voice]} startIndex={0} onClose={() => act(() => root.render(null))} languages={['en', 'fr']} fallbackLanguage="fr" carrier={carrier} conversationId="c-medias" />,
    );
    await until(() => viewerTrack() !== null);
    act(() => {
      viewerTrack()?.dispatchEvent(new Event('play'));
    });
    act(() => {
      document.body.querySelector('[data-media-viewer]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await until(() => audioCarryStore.getState().carried !== null);

    const confided = audioCarryStore.getState().carried;
    expect(confided?.conversationId).toBe('c-medias');
    expect(confided?.languages).toEqual(['en', 'fr']);
    expect(confided?.fallbackLanguage).toBe('fr');
    expect(confided?.carrier?.sender?.displayName).toBe('Kwame Mensah');
  });
});
