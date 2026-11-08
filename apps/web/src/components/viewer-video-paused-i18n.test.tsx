import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import ViewerVideoPage, { type ViewerVideoSlots } from './viewer-video-page';

/**
 * iter-79w — la pastille « En pause » de la visionneuse vidéo
 * (`viewer-video-page.tsx`) parlait FRANÇAIS à tout utilisateur, quelle que
 * soit sa langue d'interface : le texte était écrit en dur alors que
 * `translate(language, …)` sert déjà le bouton central voisin. Un défaut
 * VISIBLE À L'ÉCRAN (pas seulement un `aria-label`). Ce témoin rend la page en
 * état « plein cadre, entré en pause » (`pausedOnEntry`, non actif ⇒ ne joue
 * pas) et vérifie que la pastille suit la langue.
 */

const clip: Attachment = {
  id: 'v79w',
  messageId: 'm-v79w',
  fileName: 'v79w.mp4',
  originalName: 'v79w.mp4',
  mimeType: 'video/mp4',
  fileSize: 4096,
  fileUrl: '/uploads/v79w.mp4',
  width: 1920,
  height: 1080,
  duration: 42_000,
  uploadedBy: 'u',
  isAnonymous: false,
  isViewOnce: false,
  isBlurred: false,
  createdAt: '2026-09-20T10:00:00.000Z',
} as unknown as Attachment;

const emptySlots: ViewerVideoSlots = { transport: null, rail: null, info: null };

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(language: InterfaceLanguage): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ViewerVideoPage
        attachment={clip}
        isActive={false}
        presentation={{ kind: 'full', pausedOnEntry: true }}
        onToggleRef={() => {}}
        slots={emptySlots}
        showsFacts={false}
        language={language}
      />,
    );
  });
  return document.body.querySelector<HTMLElement>('[data-viewer-paused-badge]')!;
}

describe('ViewerVideoPage — la pastille « En pause » suit la langue (iter-79w)', () => {
  test('en anglais, la pastille lit « Paused » et aucun mot français', () => {
    const badge = mount('en');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Paused');
    expect(badge.textContent).not.toContain('En pause');
  });

  test('en français, la pastille conserve « En pause »', () => {
    const badge = mount('fr');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('En pause');
  });
});
