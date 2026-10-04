import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { MEDIA_ON_DEMAND, MEDIA_UNTRANSCRIBED_VOICE_WITNESS_ID } from '@/lib/api/fixtures-media';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { audioCarryStore, dropCarriedAudio } from '@/lib/view/audio-carry';
import type { MediaCarrier } from '@/lib/view/media';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import MediaViewer from './media-viewer';

/**
 * #9256 — LE LECTEUR AUDIO PLEIN ÉCRAN REJOINT iOS (`AudioFullscreenView`) :
 * « Transcrire » quand la pièce n'a pas de transcription, « Traduire » depuis
 * le lecteur, et fermer pendant la lecture confie le vocal au mini-lecteur.
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

const bare = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-bare',
    messageId: 'm-bare',
    fileName: 'note.wav',
    originalName: 'note.wav',
    mimeType: 'audio/wav',
    fileSize: 4096,
    fileUrl: 'https://cdn.meeshy.me/note-fr.wav',
    uploadedBy: 'u-kwame',
    createdAt: '2026-10-04T09:00:00.000Z',
    duration: 8_000,
    ...partial,
  }) as Attachment;

const transcription = { type: 'audio', transcribedText: 'On se retrouve demain à neuf heures.', language: 'fr', confidence: 0.9, source: 'whisper' } as const;
const english = { type: 'audio', transcription: 'See you tomorrow at nine.', url: 'https://cdn.meeshy.me/note-en.wav', createdAt: '2026-10-04T09:01:00.000Z' } as const;

const gateway = (answer: (request: HttpRequest) => ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      return answer(request);
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { calls, deps };
};

const carrier: MediaCarrier = { caption: null, sender: { displayName: 'Kwame Mensah', avatarUrl: null }, sentAt: '2026-10-04T09:00:00.000Z' };

type HostHandle = { setItems: (items: readonly Attachment[]) => void; close: () => void };

/** L'hôte du fil : il tient la liste (que le temps réel enrichit) et ferme le lecteur comme `Attachments`. */
function mount({ items, deps, languages = ['fr'] }: { readonly items: readonly Attachment[]; readonly deps?: ConversationsDeps; readonly languages?: readonly string[] }): HostHandle {
  const handle: HostHandle = { setItems: () => {}, close: () => {} };
  function Host() {
    const [current, setCurrent] = useState(items);
    const [open, setOpen] = useState(true);
    handle.setItems = setCurrent;
    handle.close = () => setOpen(false);
    return open ? (
      <MediaViewer
        items={current}
        startIndex={0}
        onClose={() => setOpen(false)}
        languages={languages}
        fallbackLanguage="fr"
        carrier={carrier}
        {...(deps !== undefined ? { deps } : {})}
      />
    ) : null;
  }
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Host />));
  return handle;
}

const page = (id = 'a-bare'): HTMLElement | null => document.body.querySelector<HTMLElement>(`[data-viewer-audio="${id}"]`);
const transcribeButton = (): HTMLButtonElement | null => page()?.querySelector<HTMLButtonElement>('[data-viewer-audio-transcribe]') ?? null;
const transcript = (): HTMLElement | null => page()?.querySelector<HTMLElement>('[data-viewer-audio-transcript]') ?? null;
const track = (id = 'a-bare'): HTMLAudioElement | null => page(id)?.querySelector<HTMLAudioElement>('audio[data-viewer-audio-track]') ?? null;

describe('Transcrire à la demande (#9256)', () => {
  test('une pièce sans transcription offre « Transcrire » sous « Aucune transcription »', async () => {
    mount({ items: [bare()] });
    await until(() => page() !== null);

    expect(page()?.querySelector('[data-viewer-audio-transcript-empty]')?.textContent).toContain('Aucune transcription');
    expect(transcribeButton()?.textContent).toContain('Transcrire');
  });

  test('une transcription déjà faite côté serveur s’affiche aussitôt, servie au Prisme', async () => {
    const { calls, deps } = gateway(() => ({ ok: true, data: { status: 'completed', transcription: { text: transcription.transcribedText, language: 'fr', confidence: 0.9, source: 'whisper' } } }));
    mount({ items: [bare()], deps });
    await until(() => transcribeButton() !== null);

    act(() => transcribeButton()?.click());
    await until(() => transcript() !== null);

    expect(calls.map((call) => call.path)).toContain('/api/v1/attachments/a-bare/transcribe');
    expect(transcript()?.textContent).toBe(transcription.transcribedText);
    expect(transcript()?.getAttribute('lang')).toBe('fr');
    expect(transcribeButton()).toBeNull();
  });

  test('un travail mis en file dit qu’il est en cours, et le résultat du temps réel le remplace', async () => {
    const { deps } = gateway(() => ({ ok: true, data: { status: 'processing', transcription: null } }));
    const host = mount({ items: [bare()], deps });
    await until(() => transcribeButton() !== null);

    act(() => transcribeButton()?.click());
    await until(() => transcribeButton()?.getAttribute('aria-busy') === 'true');
    expect(transcribeButton()?.textContent).toContain('Transcription en cours');
    expect(transcribeButton()?.disabled).toBe(true);

    act(() => host.setItems([bare({ transcription })]));
    await until(() => transcript() !== null);
    expect(transcript()?.textContent).toBe(transcription.transcribedText);
  });

  test('un refus le dit, et « Transcrire » reste disponible', async () => {
    const { deps } = gateway(() => ({ ok: false, status: 403, error: 'AUDIO_TRANSCRIPTION_NOT_ENABLED' }));
    mount({ items: [bare()], deps });
    await until(() => transcribeButton() !== null);

    act(() => transcribeButton()?.click());
    await until(() => page()?.querySelector('[data-viewer-audio-notice]') !== null);

    expect(page()?.querySelector('[data-viewer-audio-notice]')?.textContent).toBe('Transcription impossible');
    expect(transcribeButton()?.disabled).toBe(false);
  });
});

describe('Traduire depuis le lecteur (#9256)', () => {
  const translateButton = (): HTMLButtonElement | null => page()?.querySelector<HTMLButtonElement>('[data-viewer-audio-translate]') ?? null;
  const offer = (code: string): HTMLButtonElement | null => page()?.querySelector<HTMLButtonElement>(`[data-viewer-audio-translate-to="${code}"]`) ?? null;

  test('« Traduire » déplie les langues qu’on peut demander — celles du lecteur d’abord, jamais une version déjà là', async () => {
    mount({ items: [bare({ transcription })], languages: ['en', 'fr'] });
    await until(() => translateButton() !== null);

    expect(translateButton()?.getAttribute('aria-expanded')).toBe('false');
    act(() => translateButton()?.click());

    expect(translateButton()?.getAttribute('aria-expanded')).toBe('true');
    const offered = [...(page()?.querySelectorAll<HTMLElement>('[data-viewer-audio-translate-to]') ?? [])].map((el) => el.getAttribute('data-viewer-audio-translate-to'));
    expect(offered[0]).toBe('en');
    expect(offered).not.toContain('fr');
    expect(offer('en')?.getAttribute('aria-label')).toBe('Traduire en anglais');
  });

  test('demander une langue part à la passerelle, dit « en cours », puis la version arrivée se joue', async () => {
    const { calls, deps } = gateway(() => ({ ok: true, data: { status: 'processing', jobId: 'job-1' } }));
    const host = mount({ items: [bare({ transcription })], deps, languages: ['fr'] });
    await until(() => translateButton() !== null);

    act(() => translateButton()?.click());
    act(() => offer('en')?.click());
    await until(() => offer('en')?.getAttribute('aria-busy') === 'true');

    expect(calls.find((call) => call.path === '/api/v1/attachments/a-bare/translate')?.body).toEqual({ targetLanguages: ['en'], sourceLanguage: 'fr' });
    expect(offer('en')?.textContent).toContain('Traduction en cours');

    act(() => host.setItems([bare({ transcription, translations: { en: english } })]));
    await until(() => track()?.getAttribute('data-viewer-audio-track') === 'en');

    expect(page()?.querySelector('[data-viewer-audio-language="en"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(track()?.getAttribute('src')).toContain('note-en.wav');
    expect(transcript()?.textContent).toBe('See you tomorrow at nine.');
    expect(transcript()?.getAttribute('lang')).toBe('en');
  });

  test('un refus le dit, et la langue reste à demander', async () => {
    const { deps } = gateway(() => ({ ok: false, status: 403, error: 'AUDIO_TRANSLATION_NOT_ENABLED' }));
    mount({ items: [bare({ transcription })], deps });
    await until(() => translateButton() !== null);

    act(() => translateButton()?.click());
    act(() => offer('en')?.click());
    await until(() => page()?.querySelector('[data-viewer-audio-notice]') !== null);

    expect(page()?.querySelector('[data-viewer-audio-notice]')?.textContent).toBe('Traduction impossible');
    expect(offer('en')?.getAttribute('aria-busy')).toBe('false');
  });

  test('sous fixtures, transcrire puis traduire le vocal du corpus, sans aucun rechargement', async () => {
    const id = `${MEDIA_UNTRANSCRIBED_VOICE_WITNESS_ID}-a1`;
    const witness = bare({ id, messageId: MEDIA_UNTRANSCRIBED_VOICE_WITNESS_ID });
    mount({ items: [witness] });
    await until(() => page(id)?.querySelector('[data-viewer-audio-transcribe]') !== null);

    act(() => page(id)?.querySelector<HTMLButtonElement>('[data-viewer-audio-transcribe]')?.click());
    await until(() => page(id)?.querySelector('[data-viewer-audio-transcript]') !== null);
    const supplied = MEDIA_ON_DEMAND[id]?.transcription;
    expect(page(id)?.querySelector('[data-viewer-audio-transcript]')?.textContent).toBe(supplied?.type === 'audio' ? supplied.transcribedText : '');

    act(() => page(id)?.querySelector<HTMLButtonElement>('[data-viewer-audio-translate]')?.click());
    act(() => page(id)?.querySelector<HTMLButtonElement>('[data-viewer-audio-translate-to="es"]')?.click());
    await until(() => track(id)?.getAttribute('data-viewer-audio-track') === 'es');

    expect(page(id)?.querySelector('[data-viewer-audio-transcript]')?.textContent).toBe(MEDIA_ON_DEMAND[id]?.translations.es?.transcription);
  });
});

describe('Fermer pendant la lecture confie le vocal au mini-lecteur (#9256)', () => {
  const voiced = (): Attachment => bare({ transcription, translations: { en: english } });

  test('le vocal qui jouait part au mini-lecteur : même piste, même seconde, même vitesse, et son auteur', async () => {
    mount({ items: [voiced()], languages: ['en', 'fr'] });
    await until(() => track() !== null);
    const element = track();
    if (element !== null) {
      element.currentTime = 4.2;
      element.playbackRate = 1.5;
    }
    act(() => {
      element?.dispatchEvent(new Event('play'));
    });

    act(() => {
      document.body.querySelector('[data-media-viewer]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await until(() => audioCarryStore.getState().carried !== null);

    const carried = audioCarryStore.getState().carried;
    expect(carried?.attachment.id).toBe('a-bare');
    expect(carried?.trackLanguage).toBe('en');
    expect(carried?.trackUrl).toBe('https://cdn.meeshy.me/note-en.wav');
    expect(carried?.positionMs).toBe(4_200);
    expect(carried?.rate).toBe(1.5);
    expect(carried?.title).toBe('Kwame Mensah');
  });

  test('un vocal quitté pour une autre page n’est jamais repris à la fermeture', async () => {
    const picture = bare({ id: 'a-picture', mimeType: 'image/png', fileUrl: 'https://cdn.meeshy.me/p.png' });
    mount({ items: [voiced(), picture] });
    await until(() => track() !== null);
    act(() => {
      track()?.dispatchEvent(new Event('play'));
    });

    const dialog = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[data-media-viewer]');
    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await until(() => dialog()?.getAttribute('data-viewer-attachment') === 'a-picture');
    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();

    expect(dialog()).toBeNull();
    expect(audioCarryStore.getState().carried).toBeNull();
  });

  test('un vocal en pause se ferme avec le lecteur : rien n’est confié', async () => {
    mount({ items: [voiced()] });
    await until(() => track() !== null);
    act(() => {
      track()?.dispatchEvent(new Event('play'));
    });
    act(() => {
      track()?.dispatchEvent(new Event('pause'));
    });

    act(() => {
      document.body.querySelector('[data-media-viewer]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();

    expect(page()).toBeNull();
    expect(audioCarryStore.getState().carried).toBeNull();
  });
});
