import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { Attachments } from './attachment-blocks';

/**
 * #12285 (web) — LE VOCAL D'UN MESSAGE SE LIT AU NIVEAU DE LA CIBLE. Un vocal
 * fort (−10 LUFS) est atténué de 6 dB par le volume de son élément ; un vocal
 * faible (−24 LUFS) demande le mode CORS à la route de flux, qui permet au
 * graphe audio de l'amplifier. Sans mesure, rien ne change.
 */
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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const voice = (lufs: number | null): Attachment => ({
  ...attachmentDefaults,
  id: 'v-1',
  messageId: 'm-1',
  fileName: 'voice.m4a',
  originalName: 'voice.m4a',
  mimeType: 'audio/mp4',
  fileSize: 40_000,
  fileUrl: '2026/10/u/voice.m4a',
  duration: 4_000,
  uploadedBy: 'u-1',
  createdAt: new Date().toISOString(),
  loudnessLufs: lufs,
});

const markup = (attachment: Attachment): string =>
  renderToStaticMarkup(<Attachments attachments={[attachment]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);

function mounted(attachment: Attachment): HTMLAudioElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Attachments attachments={[attachment]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />));
  return container.querySelector('audio')!;
}

describe('le vocal d’un message, à −16 LUFS', () => {
  test('un vocal faible demande le mode CORS à la passerelle, pour être amplifié', () => {
    expect(markup(voice(-24))).toMatch(/<audio [^>]*crossorigin="anonymous"/);
  });

  test('un vocal fort est atténué par le volume de l’élément, sans CORS', () => {
    expect(markup(voice(-10))).not.toContain('crossorigin');
    expect(mounted(voice(-10)).volume).toBeCloseTo(0.501, 2);
  });

  test('sans mesure : ni CORS, ni volume changé', () => {
    expect(markup(voice(null))).not.toContain('crossorigin');
    expect(mounted(voice(null)).volume).toBe(1);
  });
});
