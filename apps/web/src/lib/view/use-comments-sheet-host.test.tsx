import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useCommentsSheetHost } from './use-comments-sheet-host';

/**
 * `useCommentsSheetHost` (#6484) — la loi d'hôte extraite de `routes/story.tsx`
 * (`commentsOpen`/`returnFocusRef`/`openComments`), rejouée ici pour que le
 * lecteur des Réels ne l'écrive pas une seconde fois (D-89).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
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

function Harness({ closeKey }: { readonly closeKey: string }) {
  const host = useCommentsSheetHost(closeKey);
  return (
    <div>
      <button type="button" data-opener onClick={() => host.open('p1')} />
      <span data-state>{host.postId ?? 'fermé'}</span>
      {host.postId !== null ? <button type="button" data-close onClick={host.close} /> : null}
    </div>
  );
}

function mount(closeKey = 'a'): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness closeKey={closeKey} />);
  });
  return container;
}

const stateOf = (el: HTMLDivElement) => el.querySelector('[data-state]')!.textContent;

describe('useCommentsSheetHost — ouverture, fermeture, focus, clé', () => {
  test('fermée au départ', () => {
    const el = mount();
    expect(stateOf(el)).toBe('fermé');
  });

  test('open(postId) ouvre SUR cette publication', () => {
    const el = mount();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-opener]')!.click();
    });
    expect(stateOf(el)).toBe('p1');
  });

  test('close() referme', () => {
    const el = mount();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-opener]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-close]')!.click();
    });
    expect(stateOf(el)).toBe('fermé');
  });

  test('le focus revient au bouton qui a ouvert la feuille', () => {
    const el = mount();
    const opener = el.querySelector<HTMLButtonElement>('[data-opener]')!;
    opener.focus();
    act(() => {
      opener.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-close]')!.click();
    });
    expect(document.activeElement).toBe(opener);
  });

  test('un changement de CLÉ ferme la feuille — le fil suivant n’hérite pas de celui du précédent', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness closeKey="reel-1" />);
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-opener]')!.click();
    });
    expect(stateOf(container)).toBe('p1');
    act(() => {
      root.render(<Harness closeKey="reel-2" />);
    });
    expect(stateOf(container)).toBe('fermé');
  });
});
