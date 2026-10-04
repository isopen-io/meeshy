import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { mediaHubPath } from '@/lib/api/conversation-media-hub';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { dropCarriedAudio } from '@/lib/view/audio-carry';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Attachments } from './attachment-blocks';
import MediaViewer from './media-viewer';

/**
 * #8333 — UN VOCAL S'OUVRE EN PLEIN ÉCRAN, COMME SUR iOS (`AudioFullscreenView`).
 *
 * La visionneuse ne savait peindre que l'image, la vidéo et la scène : une
 * pièce audio y tombait sur la page IMAGE. Elle a désormais sa page audio —
 * lecture, position, durée, transcription servie au Prisme du lecteur, piste
 * élue par la langue du texte servi, exploration des langues — et le
 * balayage passe d'un vocal de la conversation à l'autre.
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
const dialog = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[data-media-viewer]');

async function openViewer(items: readonly Attachment[], onClose: () => void = () => {}): Promise<void> {
  mount(<MediaViewer items={items} startIndex={0} onClose={onClose} languages={['fr']} fallbackLanguage="en" />);
  await until(() => page(items[0]?.id) !== null);
}

describe('MediaViewer — la page audio (#8333)', () => {
  test('une pièce audio s’ouvre sur une page audio, jamais sur la page image', async () => {
    await openViewer([voice()]);

    expect(page()).not.toBeNull();
    expect(dialog()?.querySelector('img')).toBeNull();
    expect(dialog()?.querySelector('[data-filmstrip]')).toBeNull();
  });

  test('la transcription est servie au Prisme du lecteur, et la piste suit la langue du texte servi', async () => {
    await openViewer([voice()]);

    const transcript = page()?.querySelector<HTMLElement>('[data-viewer-audio-transcript]');
    const track = page()?.querySelector<HTMLAudioElement>('audio[data-viewer-audio-track]');
    expect(transcript?.textContent).toBe('Bonjour équipe');
    expect(transcript?.getAttribute('lang')).toBe('fr');
    expect(track?.getAttribute('data-viewer-audio-track')).toBe('fr');
    expect(track?.getAttribute('src')).toContain('voice-fr.m4a');
  });

  test('explorer l’original change le texte ET la piste, d’une seule descente', async () => {
    await openViewer([voice()]);

    const original = page()?.querySelector<HTMLButtonElement>('[data-viewer-audio-language="en"]');
    expect(original?.getAttribute('aria-pressed')).toBe('false');
    act(() => original?.click());

    const transcript = page()?.querySelector<HTMLElement>('[data-viewer-audio-transcript]');
    const track = page()?.querySelector<HTMLAudioElement>('audio[data-viewer-audio-track]');
    expect(transcript?.textContent).toBe('Hello team');
    expect(transcript?.getAttribute('lang')).toBe('en');
    expect(track?.getAttribute('src')).toContain('voice-en.m4a');
    expect(page()?.querySelector('[data-viewer-audio-language="en"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('lecture et pause disent leur état ; la durée se lit avant tout chargement', async () => {
    await openViewer([voice()]);

    const play = page()?.querySelector<HTMLButtonElement>('[data-viewer-audio-play]');
    const track = page()?.querySelector<HTMLAudioElement>('audio[data-viewer-audio-track]');
    act(() => {
      track?.dispatchEvent(new Event('pause'));
    });
    expect(play?.getAttribute('aria-label')).toBe('Lire l’audio');
    act(() => {
      track?.dispatchEvent(new Event('play'));
    });
    expect(page()?.querySelector('[data-viewer-audio-play]')?.getAttribute('aria-label')).toBe('Mettre en pause');
    expect(page()?.querySelector('[data-viewer-audio-duration]')?.textContent).toBe('0:12');
    expect(page()?.querySelector('[role="slider"]')).not.toBeNull();
  });

  test('le balayage passe au vocal suivant, et la page dit où l’on en est', async () => {
    await openViewer([voice(), voice({ id: 'a-voice-2', fileUrl: 'https://cdn.meeshy.me/second.m4a' })]);

    expect(page()?.querySelector('[data-viewer-audio-counter]')?.textContent).toBe('1 / 2');
    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await until(() => dialog()?.getAttribute('data-viewer-attachment') === 'a-voice-2');

    expect(dialog()?.getAttribute('data-viewer-attachment')).toBe('a-voice-2');
    expect(page('a-voice-2')?.querySelector('[data-viewer-audio-counter]')?.textContent).toBe('2 / 2');
  });

  test('Échap ferme le lecteur', async () => {
    let closed = 0;
    await openViewer([voice()], () => {
      closed += 1;
    });

    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(closed).toBe(1);
  });

  test('le lecteur est un dialogue modal : le fil derrière lui est inerte', async () => {
    await openViewer([voice()]);

    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(true);
  });

  test('une pièce protégée garde son substitut : ni piste ni transcription', async () => {
    mount(<MediaViewer items={[voice({ isViewOnce: true })]} startIndex={0} onClose={() => {}} languages={['fr']} fallbackLanguage="en" />);
    await settle();

    expect(dialog()?.querySelector('[data-protected-attachment]')).not.toBeNull();
    expect(dialog()?.querySelector('audio')).toBeNull();
    expect(dialog()?.textContent).not.toContain('Bonjour');
  });
});

describe('La bulle d’un vocal ouvre le lecteur plein écran (#8333)', () => {
  test('l’appui d’agrandissement ouvre la page audio de ce vocal', async () => {
    mount(<Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="en" mediaFrame="box" />);

    const expand = container.querySelector<HTMLButtonElement>('[data-voice-expand]');
    expect(expand?.getAttribute('aria-label')).toBe('Ouvrir en plein écran');
    act(() => expand?.click());
    await until(() => page() !== null);

    expect(page()).not.toBeNull();
  });

  test('la lecture en cours passe au plein écran à la même seconde, et la bulle se tait', async () => {
    mount(<Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="en" mediaFrame="box" />);
    const bubbleAudio = container.querySelector<HTMLAudioElement>('audio');
    let bubblePaused = 0;
    if (bubbleAudio !== null) {
      bubbleAudio.pause = () => {
        bubblePaused += 1;
      };
      bubbleAudio.currentTime = 5;
    }
    act(() => {
      bubbleAudio?.dispatchEvent(new Event('play'));
    });

    act(() => container.querySelector<HTMLButtonElement>('[data-voice-expand]')?.click());
    await until(() => page() !== null);

    expect(bubblePaused).toBeGreaterThan(0);
    expect(page()?.querySelector<HTMLAudioElement>('audio')?.currentTime).toBe(5);
  });
});

const CONVERSATION = 'c1';
const hex = (n: number): string => n.toString(16).padStart(24, '0');

const wireVoice = (messageId: string, id: string) => ({
  ...voice({ id, messageId, fileUrl: `/uploads/${id}.m4a` }),
  translations: {},
});

const wireMessage = (id: string, minute: number, pieces: readonly string[]) => ({
  id,
  conversationId: CONVERSATION,
  senderId: 'u-nour',
  sender: { id: 'p-nour', displayName: 'Nour Haddad' },
  content: '',
  originalLanguage: 'en',
  messageType: 'audio',
  createdAt: `2026-09-20T10:0${minute}:00.000Z`,
  updatedAt: `2026-09-20T10:0${minute}:00.000Z`,
  translations: [],
  attachments: pieces.map((piece) => wireVoice(id, piece)),
});

describe('Dans le fil, on balaie entre les vocaux de la conversation (#8333)', () => {
  test('la liste est celle de l’index audio de la conversation, ouverte sur le vocal touché', async () => {
    const [M1, M2, M3] = [hex(1), hex(2), hex(3)];
    const [A1, A2, A3] = [hex(11), hex(12), hex(13)];
    const index = [wireMessage(M3, 3, [A3]), wireMessage(M2, 2, [A2]), wireMessage(M1, 1, [A1])];
    const opened = { ...wireMessage(M2, 2, [A2]), createdAt: new Date('2026-09-20T10:02:00.000Z') } as unknown as Message;
    const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) => {
      if (req.path === mediaHubPath({ conversationId: CONVERSATION, kind: 'audio', term: null, before: undefined })) {
        return { ok: true, data: index, cursorPagination: { hasMore: false, nextCursor: null, limit: 30 } } as ApiResult<unknown>;
      }
      return { ok: false, status: 404, error: 'non prévu' };
    }) as HttpTransport['request'];
    const deps: ConversationsDeps = { source: 'gateway', transport };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mount(
      <QueryClientProvider client={client}>
        <ThreadMediaContext.Provider value={{ viewerId: 'u-me', onReplyToMedia: () => {} }}>
          <Attachments
            attachments={opened.attachments as readonly Attachment[]}
            message={opened}
            languages={['fr']}
            fallbackLanguage="en"
            mediaFrame="tiles"
            deps={deps}
          />
        </ThreadMediaContext.Provider>
      </QueryClientProvider>,
    );
    act(() => container.querySelector<HTMLButtonElement>('[data-voice-expand]')?.click());
    await until(() => page(A2)?.querySelector('[data-viewer-audio-counter]')?.textContent === '2 / 3');

    expect(dialog()?.getAttribute('data-viewer-attachment')).toBe(A2);
    expect(page(A2)?.querySelector('[data-viewer-audio-counter]')?.textContent).toBe('2 / 3');
    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    await until(() => dialog()?.getAttribute('data-viewer-attachment') === A1);
    expect(dialog()?.getAttribute('data-viewer-attachment')).toBe(A1);
  });
});
