import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults, message } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { RecentMediaScopeContext, type RecentMediaScope } from '@/lib/media/recent-media-scope';
import { CARDED_STAGE } from '@/lib/view/media-stage';
import { ThreadMediaContext, type ThreadMediaContextValue } from '@/lib/view/thread-media-context';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { Attachments } from './attachment-blocks';
import ViewerVideoPage from './viewer-video-page';

/**
 * #12052 — LA VIDÉO ET LE VOCAL D'UN MESSAGE SE RELISENT HORS LIGNE, JAMAIS
 * S'ILS SONT PROTÉGÉS. La garde du seau « récents » (#11326) n'est sollicitée
 * qu'au premier `playing`, et seulement quand la surface qui connaît le
 * message le déclare standard, en clair.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  };
  HTMLMediaElement.prototype.load = function load() {};
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const CLIP_URL = 'https://gate.meeshy.me/api/v1/attachments/file/clip.mp4';
const VOICE_URL = 'https://gate.meeshy.me/api/v1/attachments/file/voice.m4a';

const clip = (partial: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id: 'a-clip',
  messageId: 'm-1',
  fileName: 'clip.mp4',
  originalName: 'clip.mp4',
  mimeType: 'video/mp4',
  fileSize: 4096,
  fileUrl: CLIP_URL,
  duration: 12_000,
  width: 1280,
  height: 720,
  uploadedBy: 'u-amina',
  createdAt: '2026-10-23T09:00:00.000Z',
  ...partial,
});

const voice = (): Attachment => ({ ...clip({ id: 'a-voice', fileName: 'voice.m4a', originalName: 'voice.m4a', mimeType: 'audio/mp4', fileUrl: VOICE_URL }) });

const sent = (partial: Partial<Message> = {}): Message =>
  message({
    ...partial,
    id: partial.id ?? 'm-1',
    senderId: 'u-amina',
    content: '',
    originalLanguage: 'fr',
    translations: partial.translations ?? [],
    createdAt: new Date('2026-10-23T09:00:00.000Z'),
  });

type Seen = { readonly src: string; readonly protection: string };

function mount(node: (scope: RecentMediaScope) => ReactElement, seen: Seen[]): HTMLElement {
  const scope: RecentMediaScope = {
    protectionOf: () => 'protected',
    remember: async (media) => void seen.push(media),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<RecentMediaScopeContext.Provider value={scope}>{node(scope)}</RecentMediaScopeContext.Provider>));
  return container;
}

const play = async (element: Element | null) => {
  await act(async () => {
    element?.dispatchEvent(new Event('playing'));
    await Promise.resolve();
  });
};

const THREAD: ThreadMediaContextValue = { viewerId: 'u-lea', onReplyToMedia: () => {}, conversationEncryptionMode: null };

const bubble = (msg: Message, thread: ThreadMediaContextValue = THREAD) => () => (
  <ThreadMediaContext.Provider value={thread}>
    <Attachments attachments={msg.attachments ?? []} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" message={msg} />
  </ThreadMediaContext.Provider>
);

describe('la vidéo d’un message (`VideoTile`)', () => {
  test('un message standard sollicite la garde au premier `playing`, une fois', async () => {
    const seen: Seen[] = [];
    const host = mount(bubble(sent({ attachments: [clip()] })), seen);
    await play(host.querySelector('video'));
    await play(host.querySelector('video'));
    expect(seen).toEqual([{ src: CLIP_URL, protection: 'none' }]);
  });

  test('éphémère, vue unique, flouté, chiffré, conversation chiffrée : la garde n’est jamais sollicitée', async () => {
    const cases = [
      sent({ ephemeralDuration: 30, attachments: [clip()] }),
      sent({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ, attachments: [clip()] }),
      sent({ isViewOnce: true, attachments: [clip()] }),
      sent({ isBlurred: true, attachments: [clip()] }),
      sent({ attachments: [clip({ isBlurred: true })] }),
      sent({ isEncrypted: true, attachments: [clip()] }),
    ];
    const rendered = [...cases.map((msg) => bubble(msg)), bubble(sent({ attachments: [clip()] }), { ...THREAD, conversationEncryptionMode: 'e2ee' })];
    for (const node of rendered) {
      const seen: Seen[] = [];
      const host = mount(node, seen);
      await play(host.querySelector('video'));
      expect(seen).toEqual([]);
      act(() => root.unmount());
      container.remove();
    }
    container = document.createElement('div');
    root = createRoot(container);
  });

  test('hors d’une surface qui connaît le message, rien n’est demandé', async () => {
    const seen: Seen[] = [];
    const host = mount(() => <Attachments attachments={[clip()]} languages={['fr']} fallbackLanguage="fr" mediaFrame="tiles" />, seen);
    await play(host.querySelector('video'));
    expect(seen).toEqual([]);
  });
});

describe('le vocal d’un message', () => {
  test('un message standard sollicite la garde avec la piste qu’on entend', async () => {
    const seen: Seen[] = [];
    const host = mount(bubble(sent({ attachments: [voice()] })), seen);
    await play(host.querySelector('audio'));
    expect(seen).toEqual([{ src: VOICE_URL, protection: 'none' }]);
  });

  test('un vocal éphémère ne la sollicite jamais', async () => {
    const seen: Seen[] = [];
    const host = mount(bubble(sent({ ephemeralDuration: 30, attachments: [voice()] })), seen);
    await play(host.querySelector('audio'));
    expect(seen).toEqual([]);
  });
});

describe('la visionneuse plein écran', () => {
  const page = (isActive: boolean) => () => (
    <ViewerVideoPage attachment={clip()} isActive={isActive} presentation={CARDED_STAGE} onToggleRef={() => {}} slots={{ transport: null, rail: null, info: null }} showsFacts={false} language="fr" />
  );

  test('la page visible d’une pièce que la surface déclare standard sollicite la garde', async () => {
    const seen: Seen[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const scope: RecentMediaScope = { protectionOf: (id) => (id === 'a-clip' ? 'none' : 'protected'), remember: async (media) => void seen.push(media) };
    act(() => root.render(<RecentMediaScopeContext.Provider value={scope}>{page(true)()}</RecentMediaScopeContext.Provider>));
    await play(container.querySelector('video'));
    expect(seen).toEqual([{ src: CLIP_URL, protection: 'none' }]);
  });

  test('une page voisine, non visible, n’est jamais « vue »', async () => {
    const seen: Seen[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const scope: RecentMediaScope = { protectionOf: () => 'none', remember: async (media) => void seen.push(media) };
    act(() => root.render(<RecentMediaScopeContext.Provider value={scope}>{page(false)()}</RecentMediaScopeContext.Provider>));
    await play(container.querySelector('video'));
    expect(seen).toEqual([]);
  });
});
