import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { ViewerIdentityModel } from '@/components/viewer-chrome';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { storyRepostCredit } from '@/lib/stories/playback';

import { StoryTopBar } from './story-chrome';

/**
 * **LE CRÉDIT D'UNE STORY REPUBLIÉE VIT DANS L'EN-TÊTE, APRÈS LA DATE**
 * (#10524, décision porteur 2026-10-13) — miroir de
 * `StoryViewerView+Header.swift` (icône de republication + « @handle » en
 * accessoire de la ligne du nom). La puce texte « Reposté de @auteur » posée
 * dans le canvas n'est plus servie par la passerelle : sans cet en-tête, le
 * web ne dirait plus à qui appartient ce qu'il montre.
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
  if (mounted === null) return;
  const { container, root } = mounted;
  act(() => {
    root.unmount();
  });
  container.remove();
  mounted = null;
});

function mount(identity: ViewerIdentityModel): HTMLDivElement {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  const r = createRoot(c);
  mounted = { container: c, root: r };
  act(() => {
    r.render(
      <StoryTopBar
        authorId="author-1"
        identity={identity}
        progress={<div data-fake-progress />}
        hidden={false}
        language="fr"
        onClose={() => undefined}
      />,
    );
  });
  return c;
}

const baseIdentity: ViewerIdentityModel = {
  name: 'Belva',
  initials: 'BE',
  time: { iso: '2026-10-13T08:00:00.000Z', label: '2 h' },
};

describe('storyRepostCredit — à qui la story republiée appartient', () => {
  test('le pseudo de l’auteur de la source', () => {
    expect(storyRepostCredit({ repostOf: { id: 's', author: { username: 'ada', displayName: 'Ada L.' } } })).toEqual({ handle: 'ada' });
  });

  test('le nom affiché quand la source ne sert pas de pseudo', () => {
    expect(storyRepostCredit({ repostOf: { id: 's', author: { username: null, displayName: 'Ada L.' } } })).toEqual({ handle: 'Ada L.' });
  });

  test('la seule icône quand la source est servie sans auteur', () => {
    expect(storyRepostCredit({ repostOf: { id: 's' } })).toEqual({ handle: null });
  });

  test('rien pour une story qui n’est pas une republication', () => {
    expect(storyRepostCredit({ repostOf: null })).toBeNull();
    expect(storyRepostCredit({})).toBeNull();
  });
});

describe('StoryTopBar — le crédit suit la date', () => {
  test('affiche « @ada » APRÈS l’heure, et le nomme au lecteur d’écran', () => {
    const el = mount({ ...baseIdentity, repost: { handle: 'ada', label: 'Republication de @ada' } });
    const time = el.querySelector('time');
    const credit = el.querySelector('[data-viewer-repost]');
    expect(time).not.toBeNull();
    expect(credit).not.toBeNull();
    expect(time?.compareDocumentPosition(credit as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(credit?.textContent).toContain('@ada');
    expect(credit?.textContent).toContain('Republication de @ada');
  });

  test('aucun crédit sur une story qui n’est pas une republication', () => {
    const el = mount(baseIdentity);
    expect(el.querySelector('[data-viewer-repost]')).toBeNull();
  });
});
