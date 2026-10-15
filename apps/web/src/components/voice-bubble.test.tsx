import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID, MEDIA_VOICE_EN_WITNESS_ID } from '@/lib/api/fixtures-media';
import type { Attachment } from '@/lib/api/types';

import { Attachments } from './attachment-blocks';

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
});
