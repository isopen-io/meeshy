import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { DEFAULT_USER_PERMISSIONS } from '@meeshy/shared/types/participant';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { GuestAttachments } from '@/lib/send/guest-attachment-policy';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ComposerAttachmentPanel } from './composer-attachment-panel';

/**
 * LE SÉLECTEUR D'UN INVITÉ RESTREINT (#10003, planche « Attach ») — World Wide
 * n'ouvre aux invités que le `.txt` et l'audio. Le panneau n'offre QUE ces
 * portes, leurs sélecteurs ne proposent qu'elles, et une note dit ce qui passe.
 * Un compte garde son panneau complet.
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

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const WORLD: GuestAttachments = { kinds: ['text', 'audio'], title: 'World Wide' };

function mount(options: { readonly guest?: GuestAttachments; readonly picked?: Array<FileList | null>; readonly canLocate?: boolean } = {}): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <ComposerAttachmentPanel
        onPickPhotos={() => undefined}
        onPickCamera={() => undefined}
        onPickFile={(files) => options.picked?.push(files)}
        onRequestLocation={() => undefined}
        onRequestEmoji={() => undefined}
        onRequestSticker={() => undefined}
        contact={{ source: 'file', onRequest: () => undefined, onPickFile: () => undefined }}
        onStartVoice={() => undefined}
        canRecord
        canLocate={options.canLocate ?? false}
        rights={{ ...DEFAULT_USER_PERMISSIONS, canSendFiles: false, canSendImages: false }}
        {...(options.guest === undefined ? {} : { guest: options.guest })}
      />,
    );
  });
  return container;
}

const sources = (el: HTMLElement): readonly string[] =>
  Array.from(el.querySelectorAll('[data-composer-source]')).map((node) => node.getAttribute('data-composer-source') ?? '');

describe('le panneau d’un invité de World Wide', () => {
  test('n’offre que le texte, l’audio, le vocal et l’emoji', () => {
    const el = mount({ guest: WORLD });
    expect(sources(el)).toEqual(['guest-text', 'guest-audio', 'voice', 'emoji']);
  });

  /* La planche « Attach » ne montre que les deux familles : partager sa
     position dans un fil public, sans compte, n'est pas ce qu'elle ouvre. */
  test('ne propose pas la position, même là où le navigateur sait la lire', () => {
    const el = mount({ guest: WORLD, canLocate: true });
    expect(sources(el)).toEqual(['guest-text', 'guest-audio', 'voice', 'emoji']);
  });

  test('chaque sélecteur ne propose que sa famille', () => {
    const el = mount({ guest: WORLD });
    const accept = (id: string) => el.querySelector(`[data-composer-source="${id}"] input[type="file"]`)?.getAttribute('accept') ?? '';
    expect(accept('guest-text').split(',')).toEqual(['.txt', 'text/plain']);
    expect(accept('guest-audio')).toContain('audio/*');
    expect(accept('guest-audio')).not.toContain('.txt');
  });

  test('un fichier choisi rejoint le composeur, qui le jugera', () => {
    const picked: Array<FileList | null> = [];
    const el = mount({ guest: WORLD, picked });
    act(() => {
      el.querySelector('[data-composer-source="guest-text"] input[type="file"]')?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(picked).toHaveLength(1);
  });

  test('la note dit ce qui passe, et mène à la création de compte', () => {
    const el = mount({ guest: WORLD });
    const note = el.querySelector('[data-composer-guest-note]');
    expect(note?.textContent?.replace(/[⁦-⁩]/gu, '')).toContain(
      'Sans compte, World Wide accepte vos messages, vos vocaux, des fichiers texte (.txt) et audio.',
    );
    expect(note?.querySelector('[data-composer-guest-signup]')?.getAttribute('href')).toBe('/signup');
  });
});

describe('le panneau d’un compte reste complet', () => {
  test('la position reste offerte à un compte', () => {
    expect(sources(mount({ canLocate: true }))).toContain('location');
  });

  test('aucune note d’invité, les portes gardées par les droits', () => {
    const el = mount();
    expect(el.querySelector('[data-composer-guest-note]')).toBeNull();
    expect(sources(el).some((id) => id.startsWith('guest-'))).toBe(false);
  });
});
