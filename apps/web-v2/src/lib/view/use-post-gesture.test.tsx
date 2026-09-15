import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';

import { usePostGesture } from './use-post-gesture';

/**
 * `usePostGesture` ANNONCE DANS LA LANGUE D'INTERFACE (#6488) — la couche
 * réseau (`RETOUR_PARTAGE_PUBLICATION`, `share-url.ts`) ne rend plus un texte
 * déjà traduit mais une CLÉ de catalogue ; ce hook est le SEUL point qui
 * connaît la langue et doit la traduire avant d'`announce()`r. Sans ce
 * témoin, un partage indisponible annoncerait la clé brute (`feed.share.
 * error`) au lieu d'un texte lisible.
 *
 * LE PARTAGE, PAS LE « LIKE » : sous `bun test`, `apiDeps.source` vaut
 * `'fixtures'` (`__FIXTURES__`, `bunfig.toml`) — `sendGesture`
 * (`feed-gestures.ts`) y court-circuite TOUJOURS sur `ok:true`, si bien
 * qu'aucun scénario public ne peut faire passer `onGesture` par la branche
 * `ok:false` sous ce harnais. Le partage, lui, dépend de la détection de
 * fonctionnalité du NAVIGATEUR (`navigator.share`/`navigator.clipboard`) —
 * happy-dom expose `navigator.clipboard.writeText`, jamais `navigator.share`,
 * donc `partagerLien` retombe de façon fiable sur `'copie'` — même chemin de
 * code (`RETOUR_PARTAGE_PUBLICATION[result]` → `translate` → `announce`) que
 * `onGesture`.
 *
 * Patron `use-live-announcer.test.tsx` (happy-dom + `createRoot` + `act`).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
});

afterAll(async () => {
  document.documentElement.lang = 'fr';
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function Harness({ postId }: { readonly postId: string }) {
  const { announcement, onShare } = usePostGesture();
  return (
    <div>
      <span data-live>{announcement}</span>
      <button type="button" data-share onClick={() => onShare(postId)} />
    </div>
  );
}

function mount(postId = 'p1'): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness postId={postId} />);
  });
  return container;
}

const liveOf = (el: HTMLDivElement): string => el.querySelector('[data-live]')!.textContent ?? '';

/** Laisse la promesse de `partagerLien().then()` s'écouler, DANS `act`. */
const laisserPasser = () => act(async () => Promise.resolve());

describe('usePostGesture — l’annonce suit la langue d’interface (#6488)', () => {
  test('en : le lien copié s’annonce en anglais, jamais la clé brute', async () => {
    document.documentElement.lang = 'en';
    const el = mount();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-share]')!.click();
    });
    await laisserPasser();
    const texte = liveOf(el);
    expect(texte).not.toBe('feed.share.copied');
    expect(texte).toBe(translate('en', 'feed.share.copied'));
    expect(texte).toBe('Link copied — just paste it.');
  });

  test('fr : la MÊME issue s’annonce en français une fois la langue reposée', async () => {
    document.documentElement.lang = 'fr';
    const el = mount();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-share]')!.click();
    });
    await laisserPasser();
    expect(liveOf(el)).toBe(translate('fr', 'feed.share.copied'));
    expect(liveOf(el)).toBe('Lien copié — il ne reste qu’à le coller.');
  });
});
