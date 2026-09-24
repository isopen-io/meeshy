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

/** Les références que l'hôte a rendues, rendu après rendu — la preuve que
 * `open`/`close` gardent leur IDENTITÉ (revue-correction #6484). */
const seenHosts: ReturnType<typeof useCommentsSheetHost>[] = [];

function Harness({ closeKey, tick = 0 }: { readonly closeKey: string; readonly tick?: number }) {
  const host = useCommentsSheetHost(closeKey);
  seenHosts.push(host);
  return (
    <div data-tick={tick}>
      <button type="button" data-opener onClick={() => host.open('p1')} />
      <span data-state>{host.postId ?? 'fermé'}</span>
      {/* La feuille PREND le focus à son montage (`publication-comments-sheet.tsx`,
          `panneau.current?.focus()`) : le champ ci-dessous la joue, sans quoi le
          focus ne quitterait jamais le bouton d'origine et le témoin de retour
          ne pourrait pas rougir. */}
      {host.postId !== null ? (
        <div>
          <input data-sheet-field />
          <button type="button" data-close onClick={host.close} />
        </div>
      ) : null}
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

  test('le focus revient au bouton qui a ouvert la feuille — même quand la feuille l’avait pris', () => {
    const el = mount();
    const opener = el.querySelector<HTMLButtonElement>('[data-opener]')!;
    opener.focus();
    act(() => {
      opener.click();
    });
    const field = el.querySelector<HTMLInputElement>('[data-sheet-field]')!;
    field.focus();
    expect(document.activeElement).toBe(field);
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-close]')!.click();
    });
    expect(document.activeElement).toBe(opener);
  });

  test('`open` et `close` gardent leur IDENTITÉ d’un rendu à l’autre — un hôte qui les mémoïse en aval ne recalcule rien', () => {
    seenHosts.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness closeKey="reel-1" tick={0} />);
    });
    act(() => {
      root.render(<Harness closeKey="reel-1" tick={1} />);
    });
    const [first, last] = [seenHosts[0], seenHosts[seenHosts.length - 1]];
    expect(seenHosts.length >= 2).toBe(true);
    expect(last?.open).toBe(first?.open);
    expect(last?.close).toBe(first?.close);
    expect(last).toBe(first);
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
