import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID, MEDIA_VOICE_EN_WITNESS_ID } from '@/lib/api/fixtures-media';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { HttpTransport } from '@/lib/api/http';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';

import { Attachments } from './attachment-blocks';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const witness = (): Attachment => {
  const found = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_VOICE_EN_WITNESS_ID)?.attachments?.[0];
  if (found === undefined) throw new Error('témoin introuvable');
  return found;
};

const withTranscript = (patch: Partial<Attachment> = {}): Attachment => ({ ...witness(), originalName: 'reunion-du-comite-de-pilotage-octobre-2026.m4a', ...patch });

const voice = (patch: Partial<Attachment> = {}): Attachment => {
  const { transcription: _transcription, translations: _translations, ...bare } = withTranscript(patch);
  return bare;
};

const html = (attachment: Attachment) =>
  renderToStaticMarkup(<Attachments attachments={[attachment]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);

describe('la bulle vocale moderne', () => {
  test('un fichier nommé montre son nom tronqué au milieu, extension gardée', () => {
    const markup = html(voice());
    expect(markup).toContain('data-voice-filename');
    expect(markup).toContain('.m4a');
    expect(markup).toContain('…');
  });

  test('un vocal enregistré sans nom réel n’affiche aucun nom', () => {
    expect(html(voice({ originalName: 'vocal.webm' }))).not.toContain('data-voice-filename');
  });

  test('sans transcription : une zone « Transcrire » dans la bulle', () => {
    const markup = html(voice());
    expect(markup).toContain('data-voice-transcribe');
    expect(markup).toContain('Transcrire');
  });

  const witnessMessage = () => {
    const found = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_VOICE_EN_WITNESS_ID);
    if (found === undefined) throw new Error('témoin introuvable');
    return found;
  };
  const htmlOf = (message: ReturnType<typeof witnessMessage>) =>
    renderToStaticMarkup(<Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" message={message} />);

  test('un vocal d’un message lisible par le serveur offre « Transcrire » (#10700)', () => {
    expect(htmlOf({ ...witnessMessage(), isEncrypted: false, encryptionMode: null })).toContain('data-voice-transcribe');
  });

  test('un vocal chiffré de bout en bout n’offre pas « Transcrire » (#10700)', () => {
    expect(htmlOf({ ...witnessMessage(), isEncrypted: true, encryptionMode: 'e2ee' })).not.toContain('data-voice-transcribe');
  });

  test('dans une conversation chiffrée de bout en bout, un vocal ne propose pas « Transcrire », même si son message n’est pas marqué (#10700)', () => {
    const markup = renderToStaticMarkup(
      <ThreadMediaContext.Provider value={{ viewerId: 'u-viewer', onReplyToMedia: () => {}, conversationEncryptionMode: 'e2ee' }}>
        <Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" message={{ ...witnessMessage(), isEncrypted: false, encryptionMode: null }} />
      </ThreadMediaContext.Provider>,
    );
    expect(markup).not.toContain('data-voice-transcribe');
  });

  test('un vocal encore optimiste (cid_) n’offre pas « Transcrire » (#10700)', () => {
    expect(htmlOf({ ...witnessMessage(), id: 'cid_abc' })).not.toContain('data-voice-transcribe');
  });

  test('avec transcription : pas de zone « Transcrire »', () => {
    const markup = html(withTranscript());
    expect(markup).not.toContain('data-voice-transcribe');
  });

  test('toucher « Transcrire » passe la zone en cours (aria-busy)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);
    });
    const button = container.querySelector<HTMLButtonElement>('[data-voice-transcribe]');
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    expect(container.querySelector('[data-voice-transcribe]')?.getAttribute('aria-busy')).toBe('true');
    act(() => root.unmount());
    container.remove();
  });

  test('un échec de « Transcrire » se dit dans la bulle et rend le bouton (#10629)', async () => {
    const transport = { request: async () => ({ ok: false, status: 503, error: 'TRANSLATOR_UNAVAILABLE' }) } as unknown as HttpTransport;
    const deps: ConversationsDeps = { source: 'gateway', transport };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Attachments attachments={[voice()]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" deps={deps} />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-voice-transcribe]')?.click();
    });
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    const button = container.querySelector<HTMLButtonElement>('[data-voice-transcribe]');
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-busy')).toBe('false');
    expect(container.querySelector('[data-voice-transcribe-notice]')?.textContent ?? '').not.toBe('');
    act(() => root.unmount());
    container.remove();
  });
});
