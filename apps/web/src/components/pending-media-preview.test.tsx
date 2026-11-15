import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { pendingAttachmentOf } from '@/lib/send/attachments';
import type { ComposeProtection } from '@/lib/send/compose-protection';
import { localMessageOf } from '@/lib/send/local-message';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';

/**
 * LA BULLE D'UN ENVOI EN ATTENTE MONTRE DÉJÀ SON MÉDIA (#15111, jumelle web de
 * #15104) — rien n'est encore parti, le réseau peut être coupé : la bulle lit
 * les octets gardés sur l'appareil. Une photo se voit, une vidéo montre sa
 * première image et sa durée, un audio son lecteur et sa durée. Un média à vue
 * unique ou flouté ne montre rien en clair.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  document.body.replaceChildren();
});

const BIG = 42 * 1024 * 1024;
const fileOf = (name: string, type: string, size = 3): File => {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  if (size !== 3) Object.defineProperty(file, 'size', { value: size });
  return file;
};

const pendingMessage = (file: File, kind: 'image' | 'video' | 'audio', protection?: ComposeProtection) =>
  localMessageOf({
    clientMessageId: 'local-1',
    conversationId: 'c-1',
    viewerId: 'u-viewer',
    content: '',
    originalLanguage: 'fr',
    attachments: [pendingAttachmentOf(file)],
    messageType: kind,
    ...(protection === undefined ? {} : { protection }),
    now: new Date('2026-11-03T10:00:00.000Z'),
  });

const mountPending = (message: ReturnType<typeof pendingMessage>) =>
  mounter.mount(
    <Bubble
      place={{ message, head: true, tail: true, opensDay: null }}
      languages={['fr']}
      isGrouped={false}
      viewerId="u-viewer"
      localDelivery="pending"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

const announceDuration = async (element: HTMLMediaElement, seconds: number): Promise<void> => {
  Object.defineProperty(element, 'duration', { configurable: true, value: seconds });
  await act(async () => {
    element.dispatchEvent(new Event('loadedmetadata'));
  });
};

describe('la bulle en attente montre le média gardé sur l’appareil', () => {
  test('une photo : sa vignette locale', async () => {
    const host = await mountPending(pendingMessage(fileOf('p.jpg', 'image/jpeg'), 'image'));
    expect(host.querySelector('img[src^="blob:"]')).not.toBe(null);
  });

  test('une vidéo lourde : sa première image se charge depuis les octets locaux, et sa durée s’affiche', async () => {
    const host = await mountPending(pendingMessage(fileOf('v.mp4', 'video/mp4', BIG), 'video'));
    const video = host.querySelector<HTMLVideoElement>('video');
    expect(video?.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(video?.getAttribute('preload')).toBe('metadata');
    expect(video?.getAttribute('src')).toContain('#t=');

    await announceDuration(video!, 42);
    expect(host.textContent).toContain('0:42');
  });

  test('un audio choisi : son lecteur se charge depuis les octets locaux, et sa durée s’affiche', async () => {
    const host = await mountPending(pendingMessage(fileOf('a.mp3', 'audio/mpeg', BIG), 'audio'));
    const audio = host.querySelector<HTMLAudioElement>('audio');
    expect(audio?.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(audio?.getAttribute('preload')).toBe('metadata');
    expect(host.querySelector('[data-voice-play]')).not.toBe(null);

    await announceDuration(audio!, 75);
    expect(host.querySelector('[data-voice-time]')?.textContent).toBe('1:15');
  });
});

describe('un média protégé en attente ne montre rien en clair', () => {
  const protections: readonly (readonly [string, ComposeProtection])[] = [
    ['à vue unique', { viewOnce: true }],
    ['flouté', { blurred: true }],
  ];
  for (const [label, protection] of protections) {
    for (const [file, kind] of [
      [fileOf('p.jpg', 'image/jpeg'), 'image'],
      [fileOf('v.mp4', 'video/mp4'), 'video'],
    ] as const) {
      test(`${kind} ${label} : aucune source locale peinte`, async () => {
        const host = await mountPending(pendingMessage(file, kind, protection));
        expect(host.querySelector('img[src^="blob:"], video[src^="blob:"], video[poster^="blob:"]')).toBe(null);
      });
    }
  }
});
