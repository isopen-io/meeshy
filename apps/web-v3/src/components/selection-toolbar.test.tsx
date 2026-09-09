import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { SelectionToolbar } from './selection-toolbar';

describe('SelectionToolbar — rendu (T13)', () => {
  test('1 sélectionné ⇒ pas de compteur', () => {
    const html = renderToStaticMarkup(<SelectionToolbar count={1} onEnd={() => {}} onCopy={() => {}} />);
    expect(html).not.toContain('sélectionnés');
  });

  test('2 sélectionnés ⇒ « 2 sélectionnés »', () => {
    const html = renderToStaticMarkup(<SelectionToolbar count={2} onEnd={() => {}} onCopy={() => {}} />);
    expect(html).toContain('2 sélectionnés');
  });

  test('`role="toolbar"` posé, cibles ≥ 44 px', () => {
    const html = renderToStaticMarkup(<SelectionToolbar count={3} onEnd={() => {}} onCopy={() => {}} />);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('44');
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('SelectionToolbar — effets (T13)', () => {
  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (props: { onEnd: () => void; onCopy: () => void }): HTMLDivElement => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<SelectionToolbar count={2} {...props} />);
    });
    return container;
  };

  test('Annuler ⇒ onEnd', () => {
    let ended = false;
    const el = mount({ onEnd: () => (ended = true), onCopy: () => {} });
    act(() => {
      (el.querySelector('button') as HTMLButtonElement).click();
    });
    expect(ended).toBe(true);
  });

  test('Copier ⇒ onCopy', () => {
    let copied = false;
    const el = mount({ onEnd: () => {}, onCopy: () => (copied = true) });
    const buttons = el.querySelectorAll('button');
    act(() => {
      (buttons[buttons.length - 1] as HTMLButtonElement).click();
    });
    expect(copied).toBe(true);
  });

  /**
   * « SÉLECTIONNER » MET LE FOCUS SUR LA BARRE (revue #5814, défaut majeur
   * 8) — avant ce correctif, `document.activeElement` valait BODY après
   * l'action « Sélectionner » du menu du message : cette barre REMPLACE le
   * composeur exactement à ce moment (`thread.tsx`), et rien n'y prenait le
   * focus que `focusTakenRef` (`use-message-menu.ts`) promettait pris.
   */
  test('au montage, « Annuler » REÇOIT le focus', () => {
    const el = mount({ onEnd: () => {}, onCopy: () => {} });
    const cancelButton = el.querySelector('button')!;
    expect(document.activeElement).toBe(cancelButton);
  });
});
