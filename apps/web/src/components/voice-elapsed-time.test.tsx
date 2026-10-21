import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID, MEDIA_VOICE_EN_WITNESS_ID } from '@/lib/api/fixtures-media';
import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';

import { Attachments } from './attachment-blocks';

/**
 * **UN VOCAL EN LECTURE AFFICHE LE TEMPS ÉCOULÉ** (#10625) — la bulle disait
 * toujours la durée TOTALE (« 0:12 »), même pendant la lecture : iOS montre
 * le temps qui passe (`AudioPlayerView.timeRow`). Au repos, la durée ; en
 * lecture, et en pause après lecture, la position courante.
 */

const voice = (): Attachment => {
  const attachment = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_VOICE_EN_WITNESS_ID)?.attachments?.[0];
  if (!attachment) throw new Error('témoin introuvable');
  return attachment;
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const counter = (): string | null | undefined => container.querySelector('[data-voice-time]')?.textContent;

describe('la bulle vocale compte le temps écoulé (#10625)', () => {
  test('au repos la durée, en lecture la position, en pause après lecture la position gardée', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    });
    expect(counter()).toBe('0:12');

    const audio = container.querySelector('audio')!;
    audio.play = () => {
      audio.dispatchEvent(new Event('play'));
      audio.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    audio.pause = () => {
      audio.dispatchEvent(new Event('pause'));
    };
    Object.defineProperty(audio, 'duration', { value: 12, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, configurable: true, writable: true });

    await act(async () => {
      (container.querySelector(`button[aria-label="${translate('fr', 'media.audio.play')}"]`) as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(counter()).toBe('0:00');

    await act(async () => {
      audio.currentTime = 7.4;
      audio.dispatchEvent(new Event('timeupdate'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(counter()).toBe('0:07');

    await act(async () => {
      (container.querySelector(`button[aria-label="${translate('fr', 'media.audio.pause')}"]`) as HTMLButtonElement).click();
    });
    expect(counter()).toBe('0:07');
  });
});
