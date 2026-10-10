import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { PendingAttachment } from '@/lib/send/attachments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * GLISSER UN FICHIER DU FINDER SUR LA FENÊTRE LE JOINT (#9991) — le dépôt
 * passe par le MÊME chemin que le bouton « joindre », le navigateur n'ouvre
 * jamais le fichier à la place de la page, et un voile dit où lâcher.
 * Safari ne remet les fichiers qu'au `drop` : pendant le survol, la liste est
 * vide et seul `types` annonce `Files`.
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

type Sent = { readonly attachments: readonly PendingAttachment[] };

const mount = (onSend: (payload: Sent) => void = () => {}): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Composer onSend={onSend} />);
  });
  return container;
};

type Transfer = { readonly types: readonly string[]; readonly files: readonly File[]; dropEffect: string };

const drag = (type: string, transfer: Transfer, target: EventTarget = document.body): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const finderDrag = (files: readonly File[]): { readonly hover: Transfer; readonly dropped: Transfer } => ({
  hover: { types: ['Files'], files: [], dropEffect: 'none' },
  dropped: { types: ['Files'], files, dropEffect: 'none' },
});

const flush = async (condition: () => boolean): Promise<void> => {
  const limite = Date.now() + 2000;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (condition() || Date.now() >= limite) return;
  }
};

const veil = (): Element | null => document.querySelector('[data-composer-drop-veil]');

const sendNow = (el: HTMLElement): void => {
  act(() => {
    el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')?.click();
  });
};

describe('déposer un fichier sur la fenêtre de conversation (#9991)', () => {
  test('le fichier lâché rejoint les pièces en attente et part avec le message', async () => {
    const sent: Sent[] = [];
    const el = mount((payload) => sent.push(payload));
    const report = new File(['%PDF-1.4'], 'rapport.pdf', { type: 'application/pdf' });
    const { hover, dropped } = finderDrag([report]);

    drag('dragenter', hover);
    drag('dragover', hover);
    const drop = drag('drop', dropped);

    expect(drop.defaultPrevented).toBe(true);
    await flush(() => el.querySelector('[aria-label="Supprimer rapport.pdf"]') !== null);
    expect(el.querySelector('[aria-label="Supprimer rapport.pdf"]')).not.toBeNull();
    sendNow(el);
    expect(sent[0]?.attachments.map((attachment) => attachment.name)).toEqual(['rapport.pdf']);
  });

  test('plusieurs fichiers lâchés ensemble sont tous joints', async () => {
    const el = mount();
    const { dropped } = finderDrag([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ]);

    drag('drop', dropped);
    await flush(() => el.querySelector('[aria-label="Supprimer b.txt"]') !== null);

    expect(el.querySelector('[aria-label="Supprimer a.txt"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Supprimer b.txt"]')).not.toBeNull();
  });

  test('le survol d’un fichier est capturé : le navigateur ne l’ouvre pas et annonce une copie', () => {
    mount();
    const { hover } = finderDrag([]);

    const over = drag('dragover', hover);

    expect(over.defaultPrevented).toBe(true);
    expect(hover.dropEffect).toBe('copy');
  });

  test('un glisser de TEXTE reste natif : ni capturé, ni voilé', () => {
    mount();
    const text: Transfer = { types: ['text/plain'], files: [], dropEffect: 'none' };

    drag('dragenter', text);
    const over = drag('dragover', text);

    expect(over.defaultPrevented).toBe(false);
    expect(veil()).toBeNull();
  });

  test('le voile « Déposer pour joindre » couvre la fenêtre le temps du survol, entrées imbriquées comprises', () => {
    mount();
    const { hover, dropped } = finderDrag([new File(['x'], 'x.png', { type: 'image/png' })]);
    const inner = document.createElement('span');
    document.body.appendChild(inner);

    drag('dragenter', hover);
    drag('dragenter', hover, inner);
    drag('dragleave', hover);
    expect(veil()?.textContent).toContain('Déposer pour joindre');

    drag('dragleave', hover, inner);
    expect(veil()).toBeNull();

    drag('dragenter', hover);
    drag('drop', dropped);
    expect(veil()).toBeNull();
    inner.remove();
  });

  test('un dépôt déjà traité par une zone dédiée (feuille de stickers) n’est pas joint une seconde fois', async () => {
    const el = mount();
    const zone = document.createElement('div');
    zone.addEventListener('drop', (event) => event.preventDefault());
    document.body.appendChild(zone);

    drag('drop', finderDrag([new File(['s'], 'sticker.png', { type: 'image/png' })]).dropped, zone);
    await flush(() => false);

    expect(el.querySelector('[aria-label="Supprimer sticker.png"]')).toBeNull();
    zone.remove();
  });
});
