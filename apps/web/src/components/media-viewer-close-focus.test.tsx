import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import { MEDIA_GRID_QUAD_WITNESS_ID } from '@/lib/api/fixtures-media-grid';

import MediaViewer from './media-viewer';

/**
 * #11100 — ÉCHAP REND LA PAGE DANS LE COMMIT QUI RETIRE LA VISIONNEUSE.
 * Preact diffère le nettoyage d'un `useEffect` démonté à l'après-peinture
 * (`requestAnimationFrame` puis `setTimeout`) : la visionneuse avait quitté le
 * DOM alors que `#root` restait INERTE et le focus tombé au `<body>` — une
 * fenêtre d'une image au repos, de centaines de millisecondes sous charge
 * (mesuré au gate `check-thread-states.mjs`, CPU saturé). Le témoin regarde à
 * l'instant où le moteur RETIRE la couche du DOM : seuls les nettoyages de
 * mise en page ont couru, dans React (témoins) comme dans Preact (production)
 * — React purge les effets passifs juste après, ce qui masquerait la fenêtre.
 */

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

const items = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_GRID_QUAD_WITNESS_ID)?.attachments ?? [];

function Thread({ exposeClose }: { readonly exposeClose: (close: () => void) => void }) {
  const [open, setOpen] = useState(false);
  exposeClose(() => setOpen(false));
  return (
    <>
      <button type="button" data-media-tile="" onClick={() => setOpen(true)}>
        tuile
      </button>
      {open ? <MediaViewer items={items} startIndex={1} onClose={() => setOpen(false)} languages={['fr']} fallbackLanguage="fr" /> : null}
    </>
  );
}

type PageAtRemoval = { readonly inert: boolean; readonly focusedTile: boolean };

/** Ce que la page offre à l'instant EXACT où le moteur retire la visionneuse
 * du DOM — avant tout nettoyage différé, quel que soit le moteur qui le diffère. */
function recordAtRemoval(container: HTMLElement, tile: HTMLElement): { readonly seen: () => PageAtRemoval | null; readonly restore: () => void } {
  const original = Node.prototype.removeChild;
  let seen: PageAtRemoval | null = null;
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    const leaving = child instanceof Element && (child.matches('[data-media-viewer]') || child.querySelector('[data-media-viewer]') !== null);
    if (leaving && seen === null) seen = { inert: container.hasAttribute('inert'), focusedTile: document.activeElement === tile };
    return original.call(this, child) as T;
  };
  return { seen: () => seen, restore: () => void (Node.prototype.removeChild = original) };
}

describe('MediaViewer — refermer rend la page dans le commit qui retire la couche (#11100)', () => {
  test('refermée, la visionneuse quitte le DOM avec #root déjà rendu et le focus déjà sur la tuile', () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let close: () => void = () => {};
    act(() => root.render(<Thread exposeClose={(fn) => (close = fn)} />));
    const tile = container.querySelector<HTMLButtonElement>('[data-media-tile]')!;
    tile.focus();
    act(() => tile.click());
    expect(document.querySelector('[data-media-viewer]')).not.toBeNull();
    expect(container.hasAttribute('inert')).toBe(true);

    const probe = recordAtRemoval(container, tile);
    act(() => close());
    probe.restore();
    expect(document.querySelector('[data-media-viewer]')).toBeNull();
    act(() => root.unmount());
    container.remove();

    expect(probe.seen()).toEqual({ inert: false, focusedTile: true });
  });
});
