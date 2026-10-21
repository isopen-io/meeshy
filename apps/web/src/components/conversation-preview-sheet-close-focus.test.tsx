import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationPreviewSheet } from './conversation-preview-sheet';

/**
 * #11108 — REFERMER L'APERÇU REND LA PAGE DANS LE COMMIT QUI RETIRE LA FEUILLE.
 * Jumelle de #11100 (visionneuse) : Preact diffère le nettoyage d'un
 * `useEffect` démonté à l'après-peinture, et la feuille quittait le DOM en
 * laissant `#root` INERTE et isolé, le focus tombé au `<body>`. Le témoin
 * regarde à l'instant où le moteur RETIRE la couche du DOM : seuls les
 * nettoyages de mise en page ont couru, dans React (témoins) comme dans
 * Preact (production).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadNotificationRowCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function Screen({ exposeClose }: { readonly exposeClose: (close: () => void) => void }) {
  const [open, setOpen] = useState(false);
  exposeClose(() => setOpen(false));
  return (
    <>
      <button type="button" data-opener="" onClick={() => setOpen(true)}>
        bannière
      </button>
      {open ? (
        <ConversationPreviewSheet conversationId="c1" onClose={() => setOpen(false)}>
          <p>fil</p>
        </ConversationPreviewSheet>
      ) : null}
    </>
  );
}

type PageAtRemoval = { readonly inert: boolean; readonly isolated: boolean; readonly focusedOpener: boolean };

/** Ce que la page offre à l'instant EXACT où le moteur retire la feuille du
 * DOM — avant tout nettoyage différé, quel que soit le moteur qui le diffère. */
function recordAtRemoval(container: HTMLElement, opener: HTMLElement): { readonly seen: () => PageAtRemoval | null; readonly restore: () => void } {
  const original = Node.prototype.removeChild;
  let seen: PageAtRemoval | null = null;
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    const leaving = child instanceof Element && (child.matches('[data-conversation-preview]') || child.querySelector('[data-conversation-preview]') !== null);
    if (leaving && seen === null) {
      seen = { inert: container.hasAttribute('inert'), isolated: container.style.isolation !== '', focusedOpener: document.activeElement === opener };
    }
    return original.call(this, child) as T;
  };
  return { seen: () => seen, restore: () => void (Node.prototype.removeChild = original) };
}

describe('ConversationPreviewSheet — refermer rend la page dans le commit qui retire la feuille (#11108)', () => {
  test("refermée, la feuille quitte le DOM avec #root déjà rendu et le focus déjà sur ce qui l'a ouverte", () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let close: () => void = () => {};
    act(() => root.render(<Screen exposeClose={(fn) => (close = fn)} />));
    const opener = container.querySelector<HTMLButtonElement>('[data-opener]')!;
    opener.focus();
    act(() => opener.click());
    expect(document.querySelector('[data-conversation-preview]')).not.toBeNull();
    expect(container.hasAttribute('inert')).toBe(true);

    const probe = recordAtRemoval(container, opener);
    act(() => close());
    probe.restore();
    expect(document.querySelector('[data-conversation-preview]')).toBeNull();
    act(() => root.unmount());
    container.remove();

    expect(probe.seen()).toEqual({ inert: false, isolated: false, focusedOpener: true });
  });
});
