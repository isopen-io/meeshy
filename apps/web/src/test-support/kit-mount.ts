import { afterAll, afterEach, beforeAll } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * LE MONTAGE COMMUN DES TÉMOINS DU KIT. À appeler UNE fois, au sommet d'un fichier
 * de témoins : il enregistre happy-dom, monte dans un conteneur jetable et démonte
 * après chaque témoin. `mount` rend le conteneur ; `render` remonte sur le même
 * (un second rendu du même arbre, pour prouver ce qui change et ce qui reste).
 */
export function kitMount(): {
  readonly mount: (element: ReactElement) => HTMLElement;
  readonly render: (element: ReactElement) => void;
  readonly act: typeof act;
} {
  let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

  const unmount = (): void => {
    if (mounted === null) return;
    const current = mounted;
    mounted = null;
    act(() => current.root.unmount());
    current.container.remove();
  };

  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/kit' });
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    unmount();
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  afterEach(unmount);

  const mount = (element: ReactElement): HTMLElement => {
    unmount();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(element));
    mounted = { container, root };
    return container;
  };

  const render = (element: ReactElement): void => {
    if (mounted === null) throw new Error('rien n’est monté');
    const current = mounted;
    act(() => current.root.render(element));
  };

  return { mount, render, act };
}

/**
 * Ce qu'un lecteur d'écran trouve en parcourant un nœud : son texte, moins les
 * sous-arbres `aria-hidden`. Un `aria-label` posé sur un `<span>` ou un `<div>` sans
 * rôle n'y entre pas : ARIA l'interdit sur un élément générique, et VoiceOver comme
 * NVDA l'ignorent.
 */
export function spokenText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes, spokenText).join('');
}
