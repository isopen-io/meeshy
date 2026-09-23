import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { SelectionToolbar } from './selection-toolbar';

/**
 * LA BARRE DE SÉLECTION PORTE « TRANSFÉRER » (#5866) — la SECONDE porte de la
 * décision du porteur (#5989) : le menu ARME la sélection, la barre la VALIDE
 * vers des destinataires. Un bouton sans effet est le défaut que la loi 4 du
 * dépôt interdit et que `check-thread-states.mjs` § 6.2 mesure : ce témoin
 * CLIQUE, il ne se contente pas de trouver le libellé.
 */
describe('SelectionToolbar — Annuler · N sélectionnés · Transférer · Copier', () => {
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

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (count: number, handlers: { onEnd?: () => void; onCopy?: () => void; onForward?: () => void } = {}) => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <SelectionToolbar
          count={count}
          onEnd={handlers.onEnd ?? (() => {})}
          onCopy={handlers.onCopy ?? (() => {})}
          onForward={handlers.onForward ?? (() => {})}
        />,
      );
    });
    return container;
  };

  const buttonNamed = (host: HTMLElement, label: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  test('« Transférer » existe et APPELLE son gestionnaire (loi 4)', () => {
    let forwarded = 0;
    const host = mount(2, { onForward: () => (forwarded += 1) });
    const button = buttonNamed(host, 'Transférer');
    expect(button).toBeDefined();
    act(() => {
      button?.click();
    });
    expect(forwarded).toBe(1);
  });

  test('sélection VIDE ⇒ Transférer et Copier sont désactivés — rien à envoyer', () => {
    const host = mount(0);
    expect(buttonNamed(host, 'Transférer')?.disabled).toBe(true);
    expect(buttonNamed(host, 'Copier')?.disabled).toBe(true);
    expect(buttonNamed(host, 'Annuler')?.disabled).toBe(false);
  });

  test('« Annuler » et « Copier » gardent leur effet — la barre ne régresse pas', () => {
    let ended = 0;
    let copied = 0;
    const host = mount(3, { onEnd: () => (ended += 1), onCopy: () => (copied += 1) });
    act(() => {
      buttonNamed(host, 'Annuler')?.click();
      buttonNamed(host, 'Copier')?.click();
    });
    expect({ ended, copied }).toEqual({ ended: 1, copied: 1 });
    expect(host.textContent).toContain('3 sélectionnés');
  });
});
