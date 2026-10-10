import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { audioCarryStore, carryAudio, dropCarriedAudio, type CarriedAudio } from '@/lib/view/audio-carry';
import { createMediaCoordinator } from '@/lib/view/media-coordinator';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import MiniAudioPlayerHost, { MiniAudioPlayer } from './mini-audio-player';

/**
 * #9256 — FERMER LE PLEIN ÉCRAN N'ARRÊTE PAS LE VOCAL. iOS bascule sur le
 * mini-lecteur (`MiniAudioPlayerBar`) ; le web y confie la piste, sa position
 * et sa vitesse, et ce lecteur reprend là où la page s'est arrêtée.
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
});

/** `play`/`pause` bouchonnés sur le prototype AVANT le montage : la reprise est automatique. */
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
  mimeType: 'audio/wav',
  fileUrl: 'https://cdn.meeshy.me/original.wav',
  duration: 8_000,
} as Attachment;

const carried = (partial: Partial<CarriedAudio> = {}): CarriedAudio => ({
  attachment: voice,
  trackUrl: 'https://cdn.meeshy.me/fr.wav',
  trackLanguage: 'fr',
  positionMs: 3_500,
  rate: 1.5,
  title: 'Kwame Mensah',
  ...partial,
});

function mount(node: Parameters<Root['render']>[0]): void {
  stubMediaPrototype();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

const bar = (): HTMLElement | null => container.querySelector<HTMLElement>('[data-mini-audio-player]');
const audio = (): HTMLAudioElement | null => container.querySelector<HTMLAudioElement>('audio');

describe('MiniAudioPlayer (#9256)', () => {
  test('reprend la piste confiée, à la même position et à la même vitesse, et joue', async () => {
    mount(<MiniAudioPlayer carried={carried()} onClose={() => {}} coordinator={createMediaCoordinator()} />);
    await act(async () => {});

    expect(bar()?.getAttribute('data-mini-audio-player')).toBe('a-voice');
    expect(audio()?.getAttribute('src')).toBe('https://cdn.meeshy.me/fr.wav');
    expect(audio()?.getAttribute('data-mini-audio-track')).toBe('fr');
    expect(audio()?.currentTime).toBe(3.5);
    expect(audio()?.playbackRate).toBe(1.5);
    expect(calls.play).toBe(1);
    expect(bar()?.getAttribute('data-mini-audio-status')).toBe('playing');
    expect(bar()?.textContent).toContain('Kwame Mensah');
  });

  test('sans auteur connu, le lecteur dit ce qu’il joue : un message vocal', async () => {
    mount(<MiniAudioPlayer carried={carried({ title: null })} onClose={() => {}} coordinator={createMediaCoordinator()} />);
    await act(async () => {});

    expect(bar()?.textContent).toContain('Message vocal');
  });

  test('le bouton bascule lecture et pause, et dit son état', async () => {
    mount(<MiniAudioPlayer carried={carried()} onClose={() => {}} coordinator={createMediaCoordinator()} />);
    await act(async () => {});

    const toggle = container.querySelector<HTMLButtonElement>('[data-mini-audio-toggle]');
    expect(toggle?.getAttribute('aria-label')).toBe('Mettre en pause');
    act(() => toggle?.click());
    expect(calls.pause).toBe(1);
    expect(container.querySelector('[data-mini-audio-toggle]')?.getAttribute('aria-label')).toBe('Lire l’audio');
  });

  test('fermer le lecteur arrête la lecture', async () => {
    let closed = 0;
    mount(
      <MiniAudioPlayer
        carried={carried()}
        onClose={() => {
          closed += 1;
        }}
        coordinator={createMediaCoordinator()}
      />,
    );
    await act(async () => {});

    const close = container.querySelector<HTMLButtonElement>('[data-mini-audio-close]');
    expect(close?.getAttribute('aria-label')).toBe('Fermer le lecteur');
    act(() => close?.click());
    expect(closed).toBe(1);
    expect(calls.pause).toBe(1);
  });

  test('arrivé au bout, le lecteur se retire', async () => {
    let closed = 0;
    mount(
      <MiniAudioPlayer
        carried={carried()}
        onClose={() => {
          closed += 1;
        }}
        coordinator={createMediaCoordinator()}
      />,
    );
    await act(async () => {});

    act(() => {
      audio()?.dispatchEvent(new Event('ended'));
    });
    expect(closed).toBe(1);
  });

  test('un autre média qui joue met le mini-lecteur en pause, sans le retirer', async () => {
    const coordinator = createMediaCoordinator();
    mount(<MiniAudioPlayer carried={carried()} onClose={() => {}} coordinator={coordinator} />);
    await act(async () => {});

    act(() => coordinator.claim('a-voice', () => {}));

    expect(calls.pause).toBe(1);
    expect(bar()?.getAttribute('data-mini-audio-status')).toBe('paused');
  });
});

describe('MiniAudioPlayerHost (#9256)', () => {
  test('rien de confié, rien de monté ; une piste confiée monte le lecteur, la fermer le retire', async () => {
    mount(<MiniAudioPlayerHost />);
    expect(bar()).toBeNull();

    act(() => carryAudio(carried()));
    await act(async () => {});
    expect(bar()).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('[data-mini-audio-close]')?.click());
    expect(audioCarryStore.getState().carried).toBeNull();
    expect(bar()).toBeNull();
  });
});
