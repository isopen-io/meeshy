import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';

import { Quote } from './message-blocks';

/**
 * #8233 (jumelle web de #8230, PR iOS #8240) — UNE CITATION D'AUDIO OU DE
 * VIDÉO MONTRE SON APERÇU ET S'OUVRE.
 *
 * Deux zones, un effet chacune : l'APERÇU MÉDIA ouvre le média (la visionneuse
 * pour une image ou une vidéo, la lecture pour un vocal), le RESTE de la
 * citation saute au message cité. Un média protégé n'a ni aperçu ni zone :
 * tout le toucher reste « aller au message ».
 */

const QUOTED: Message = {
  id: 'm-quoted',
  conversationId: 'c-a',
  senderId: 'u-amina',
  content: '',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 0,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  translations: [],
  createdAt: new Date('2026-09-27T09:00:00.000Z'),
  timestamp: new Date('2026-09-27T09:00:00.000Z'),
} as Message;

const piece = (partial: Partial<Attachment>): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-1',
    messageId: 'm-quoted',
    fileName: 'piece.bin',
    originalName: 'piece.bin',
    mimeType: 'application/octet-stream',
    fileSize: 2048,
    fileUrl: 'https://cdn.meeshy.me/piece.bin',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-27T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const VIDEO_SANS_VIGNETTE = piece({
  id: 'a-video',
  mimeType: 'video/mp4',
  fileUrl: 'https://cdn.meeshy.me/sortie.mp4',
  width: 1080,
  height: 1920,
  duration: 42_000,
});

const VOCAL = piece({ id: 'a-vocal', mimeType: 'audio/mp4', fileUrl: 'https://cdn.meeshy.me/note.m4a', duration: 12_000 });

const DOCUMENT = piece({ id: 'a-doc', mimeType: 'application/pdf', fileUrl: 'https://cdn.meeshy.me/contrat.pdf' });

const quoting = (attachments: readonly Attachment[], partial: Partial<Message> = {}): Message =>
  ({ ...QUOTED, ...partial, attachments: [...attachments] }) as Message;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('Quote — l’aperçu média d’une citation s’ouvre, le reste saute au message (#8233)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (quote: Message, onJump: () => void = () => {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Quote quote={quote} isMine={false} languages={['fr']} onJump={onJump} />);
    });
    return container;
  };

  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 50 && !predicate(); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  };

  test('une vidéo SANS vignette montre sa première image, tirée du fichier, muette et sans préchargement complet', () => {
    const host = mount(quoting([VIDEO_SANS_VIGNETTE]));
    const still = host.querySelector<HTMLVideoElement>('[data-quote-frame] video[data-quote-still]');
    expect(still).not.toBeNull();
    expect(still?.getAttribute('src')).toContain('sortie.mp4');
    expect(still?.getAttribute('preload')).toBe('metadata');
    expect(still?.muted).toBe(true);
  });

  test('le poster d’une vidéo suit le rapport d’aspect de la vidéo et porte le badge de lecture', () => {
    const host = mount(quoting([VIDEO_SANS_VIGNETTE]));
    const frame = host.querySelector<HTMLElement>('[data-quote-frame]');
    expect(frame?.getAttribute('data-quote-frame-measured')).toBe('true');
    expect(Number.parseFloat(frame?.style.height ?? '0')).toBeGreaterThan(Number.parseFloat(frame?.style.width ?? '0'));
    expect(frame?.querySelector('svg')).not.toBeNull();
  });

  test('l’aperçu vidéo est une zone À PART du bouton « aller au message » — jamais un bouton dans un bouton', () => {
    const host = mount(quoting([VIDEO_SANS_VIGNETTE]));
    const zone = host.querySelector<HTMLButtonElement>('button[data-quote-open="video"]');
    expect(zone).not.toBeNull();
    expect(zone?.getAttribute('aria-label')).toBe('Ouvrir en plein écran');
    expect(zone?.parentElement?.closest('button')).toBeNull();
    expect(host.querySelector('button[aria-label^="Aller au message"] [data-quote-frame]')).toBeNull();
  });

  test('toucher l’aperçu vidéo ouvre la visionneuse plein écran, sans sauter au message', async () => {
    let jumps = 0;
    const host = mount(quoting([VIDEO_SANS_VIGNETTE]), () => {
      jumps += 1;
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[data-quote-open="video"]')?.click();
    });
    await waitFor(() => document.querySelector('[role="dialog"]') !== null);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"] video')?.getAttribute('src')).toContain('sortie.mp4');
    expect(jumps).toBe(0);
  });

  test('dans le fil, l’aperçu ouvre la visionneuse de la conversation, avec ses actions — la pièce vient de la citation', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ThreadMediaContext.Provider value={{ viewerId: 'u-viewer', onReplyToMedia: () => {} }}>
            <Quote quote={quoting([VIDEO_SANS_VIGNETTE])} isMine={false} languages={['fr']} onJump={() => {}} />
          </ThreadMediaContext.Provider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[data-quote-open="video"]')?.click();
    });
    await waitFor(() => document.querySelector('[role="dialog"] [data-viewer-action="reply"]') !== null);
    expect(document.querySelector('[role="dialog"] video')?.getAttribute('src')).toContain('sortie.mp4');
    expect(document.querySelector('[role="dialog"] [data-viewer-action="reply"]')).not.toBeNull();
  });

  test('toucher le RESTE de la citation saute au message, sans rien ouvrir', async () => {
    let jumps = 0;
    const host = mount(quoting([VIDEO_SANS_VIGNETTE]), () => {
      jumps += 1;
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label^="Aller au message"]')?.click();
    });
    expect(jumps).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('un vocal cité montre un aperçu compact : lecture, onde figée, durée', () => {
    const host = mount(quoting([VOCAL]));
    const zone = host.querySelector<HTMLButtonElement>('button[data-quote-open="audio"]');
    expect(zone).not.toBeNull();
    expect(zone?.getAttribute('aria-label')).toBe('Lire l’audio');
    expect(zone?.querySelectorAll('[data-quote-wave] > span').length).toBeGreaterThan(0);
    expect(zone?.textContent).toContain('0:12');
    expect(zone?.parentElement?.closest('button')).toBeNull();
  });

  test('toucher l’aperçu d’un vocal le lit depuis la citation, sans sauter au message', async () => {
    let jumps = 0;
    const host = mount(quoting([VOCAL]), () => {
      jumps += 1;
    });
    const audio = host.querySelector<HTMLAudioElement>('audio[data-quote-audio]');
    expect(audio?.getAttribute('src')).toContain('note.m4a');
    let plays = 0;
    audio!.play = () => {
      plays += 1;
      audio!.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[data-quote-open="audio"]')?.click();
      await Promise.resolve();
    });
    expect(plays).toBe(1);
    expect(jumps).toBe(0);
    expect(host.querySelector('button[data-quote-open="audio"]')?.getAttribute('aria-label')).toBe('Pause');
  });

  test('un document cité n’a aucune zone média', () => {
    const host = mount(quoting([DOCUMENT]));
    expect(host.querySelector('[data-quote-open]')).toBeNull();
  });

  test('une vidéo PROTÉGÉE (message à vue unique) n’a ni aperçu, ni fichier, ni zone média', () => {
    const host = mount(quoting([VIDEO_SANS_VIGNETTE], { content: '👁️ 🎬', isViewOnce: true }));
    expect(host.querySelector('[data-quote-open]')).toBeNull();
    expect(host.querySelector('video')).toBeNull();
    expect(host.innerHTML).not.toContain('sortie.mp4');
  });

  test('un vocal FLOUTÉ au niveau de la pièce n’a ni aperçu, ni fichier, ni zone média', () => {
    const host = mount(quoting([piece({ ...VOCAL, isBlurred: true } as Partial<Attachment>)], { content: 'Écoute' }));
    expect(host.querySelector('[data-quote-open]')).toBeNull();
    expect(host.querySelector('audio')).toBeNull();
    expect(host.innerHTML).not.toContain('note.m4a');
  });
});
