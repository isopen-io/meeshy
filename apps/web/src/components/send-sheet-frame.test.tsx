import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, createRef, useRef } from 'react';

import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SEND_SHEET_EXIT_MS, SendSheetFrame, type SendSheetFrameHandle } from './send-sheet-frame';

/**
 * LE CADRE DES FEUILLES D'ENVOI (#8884) — ce que toute feuille de partage
 * posée dessus hérite : une VRAIE modale (`showModal`), un « Annuler » lisible
 * à gauche, Échap et le retour matériel qui annulent par le même chemin.
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

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

/** happy-dom répond `no-preference` : la sortie glisse, puis ferme. */
const afterExit = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SEND_SHEET_EXIT_MS + 20));
  });
};

const dialogOf = (host: ParentNode): HTMLDialogElement => {
  const dialog = host.querySelector('dialog');
  if (dialog === null) throw new Error('aucun dialogue');
  return dialog;
};

describe('SendSheetFrame — une modale qui s’annule clairement', () => {
  test('s’ouvre en MODALE et se nomme par son titre', async () => {
    const host = await mounter.mount(
      <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => {}}>
        <p>corps</p>
      </SendSheetFrame>,
    );
    const dialog = dialogOf(host);
    expect(dialog.open).toBe(true);
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).not.toBe(null);
    expect(host.querySelector(`[id="${labelledBy ?? ''}"]`)?.textContent).toBe('Partager');
    expect(dialog.className).toContain('glass-prominent');
    expect(dialog.className).toContain('backdrop:bg-veil');
  });

  test('« Annuler » est un bouton TEXTE, lisible, et il ferme la feuille', async () => {
    const closed: string[] = [];
    const host = await mounter.mount(
      <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => closed.push('close')}>
        <p>corps</p>
      </SendSheetFrame>,
    );
    const cancel = buttonNamed(host, 'Annuler');
    expect(cancel).not.toBe(null);
    await mounter.click(cancel);
    expect(dialogOf(host).hasAttribute('data-leaving')).toBe(true);
    expect(closed).toEqual([]);
    await afterExit();
    expect(closed).toEqual(['close']);
    expect(dialogOf(host).open).toBe(false);
  });

  test('moins de mouvement demandé : la feuille se ferme SANS glisser', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original.call(window, query), matches: false })) as typeof window.matchMedia;
    try {
      const closed: string[] = [];
      const host = await mounter.mount(
        <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => closed.push('close')}>
          <p>corps</p>
        </SendSheetFrame>,
      );
      await mounter.click(buttonNamed(host, 'Annuler'));
      expect(closed).toEqual(['close']);
    } finally {
      window.matchMedia = original;
    }
  });

  test('Échap (l’événement `cancel` du dialogue) annule par le MÊME chemin', async () => {
    const closed: string[] = [];
    const host = await mounter.mount(
      <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => closed.push('close')}>
        <p>corps</p>
      </SendSheetFrame>,
    );
    const dialog = dialogOf(host);
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    await afterExit();
    expect(cancel.defaultPrevented).toBe(true);
    expect(closed).toEqual(['close']);
  });

  test('le pied et l’action de droite sont des emplacements', async () => {
    const host = await mounter.mount(
      <SendSheetFrame
        title="Partager"
        cancelLabel="Annuler"
        onClose={() => {}}
        trailing={<button type="button">Aide</button>}
        footer={<button type="button">Envoyer</button>}
      >
        <p>corps</p>
      </SendSheetFrame>,
    );
    expect(host.querySelector('[data-send-sheet-footer]')?.textContent).toBe('Envoyer');
    expect(buttonNamed(host, 'Aide')).not.toBe(null);
  });

  test('le focus initial va où l’hôte le demande', async () => {
    function Probe() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => {}} initialFocus={ref}>
          <input ref={ref} data-probe />
        </SendSheetFrame>
      );
    }
    const host = await mounter.mount(<Probe />);
    expect(document.activeElement).toBe(host.querySelector('[data-probe]'));
  });

  test('démonter la feuille (une autre la remplace) ne rappelle PAS `onClose`', async () => {
    const closed: string[] = [];
    await mounter.mount(
      <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => closed.push('close')}>
        <p>corps</p>
      </SendSheetFrame>,
    );
    mounter.unmountAll();
    expect(closed).toEqual([]);
  });

  test('l’hôte peut fermer la feuille lui-même (après un envoi réussi)', async () => {
    const closed: string[] = [];
    const handle = createRef<SendSheetFrameHandle>();
    await mounter.mount(
      <SendSheetFrame handleRef={handle} title="Partager" cancelLabel="Annuler" onClose={() => closed.push('close')}>
        <p>corps</p>
      </SendSheetFrame>,
    );
    handle.current?.dismiss();
    await afterExit();
    expect(closed).toEqual(['close']);
  });
});

/**
 * LE DÉMONTAGE PAR L'HÔTE JOUE AUSSI LA SORTIE (#18362) — une feuille d'envoi que l'hôte retire après
 * un envoi, ou qu'une autre remplace, laisse un fantôme qui rejoue `.send-sheet[data-leaving]`.
 */
describe('SendSheetFrame — la sortie survit au démontage', () => {
  const withPopover = async (run: () => Promise<void>): Promise<void> => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, writable: true, value() {} });
    try {
      await run();
    } finally {
      delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
      for (const ghost of document.querySelectorAll('[data-dialog-ghost]')) ghost.remove();
    }
  };

  test('démontée par l’hôte, la feuille laisse un fantôme send-sheet en sortie', async () =>
    withPopover(async () => {
      await mounter.mount(
        <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => {}}>
          <p>corps</p>
        </SendSheetFrame>,
      );
      mounter.unmountAll();
      const ghost = document.querySelector<HTMLElement>('[data-dialog-ghost]');
      expect(ghost?.dataset.dialogGhost).toBe('send');
      expect(ghost?.classList.contains('send-sheet')).toBe(true);
      expect(ghost?.hasAttribute('data-leaving')).toBe(true);
    }));

  test('démontée pendant sa propre sortie, elle n’en crée pas de seconde', async () =>
    withPopover(async () => {
      const host = await mounter.mount(
        <SendSheetFrame title="Partager" cancelLabel="Annuler" onClose={() => {}}>
          <p>corps</p>
        </SendSheetFrame>,
      );
      await mounter.click(buttonNamed(host, 'Annuler'));
      expect(dialogOf(host).hasAttribute('data-leaving')).toBe(true);
      mounter.unmountAll();
      expect(document.querySelectorAll('[data-dialog-ghost]')).toHaveLength(0);
    }));
});
