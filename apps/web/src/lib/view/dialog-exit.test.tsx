import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { act, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DIALOG_GHOST_MAX_NODES, SHEET_MOTION_MS, leaveDialogAsGhost, useDialogExit, type DialogGhostKind } from './dialog-exit';

/**
 * LA SORTIE D'UNE MODALE EST JOUÉE PAR UN FANTÔME (#18362) — le vrai `<dialog>`
 * se ferme tout de suite, par tous les chemins (bouton, Échap, démontage par
 * l'hôte) ; une copie inerte, posée dans la couche supérieure à sa place, joue
 * la descente ou le fondu puis s'en va.
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

const shown: HTMLElement[] = [];
const installPopover = (): void => {
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    writable: true,
    value: function showPopover(this: HTMLElement) {
      shown.push(this);
    },
  });
};
const removePopover = (): void => {
  delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
};

let originalMatchMedia: typeof window.matchMedia;
beforeAll(() => {
  originalMatchMedia = window.matchMedia;
});
const reduceMotion = (): void => {
  window.matchMedia = ((query: string) => ({ ...originalMatchMedia.call(window, query), matches: false })) as typeof window.matchMedia;
};

afterEach(() => {
  mounter.unmountAll();
  window.matchMedia = originalMatchMedia;
  removePopover();
  shown.splice(0);
  for (const ghost of document.querySelectorAll('[data-dialog-ghost]')) ghost.remove();
  for (const stage of document.querySelectorAll('[data-call-stage]')) stage.remove();
  jest.useRealTimers();
});

const RECT = { x: 12, y: 340, left: 12, top: 340, width: 360, height: 420, right: 372, bottom: 760 };

function Probe({ kind = 'bottom', onClose, children }: { readonly kind?: DialogGhostKind; readonly onClose?: () => void; readonly children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { leave } = useDialogExit(ref, { kind });
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    dialog.getBoundingClientRect = () => ({ ...RECT, toJSON: () => RECT }) as DOMRect;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      id="feuille"
      className="probe-sheet backdrop:bg-veil"
      style={{ color: 'red', '--probe-tint': 'blue' } as CSSProperties}
      onClose={onClose}
    >
      <button type="button" id="quitter" autoFocus onClick={leave}>
        Quitter
      </button>
      {children}
    </dialog>
  );
}

const ghosts = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-dialog-ghost]')];
const dialogOf = (host: ParentNode): HTMLDialogElement => {
  const dialog = host.querySelector('dialog');
  if (dialog === null) throw new Error('aucun dialogue');
  return dialog;
};

describe('useDialogExit — leave()', () => {
  test('(a) pose un fantôme inerte dans la couche supérieure, à la place du dialogue, et ferme le dialogue dans le même appel', async () => {
    installPopover();
    const closed: string[] = [];
    const host = await mounter.mount(<Probe kind="bottom" onClose={() => closed.push('close')} />);
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(closed).toEqual(['close']);
    const [ghost] = ghosts();
    expect(ghosts()).toHaveLength(1);
    expect(ghost?.parentElement).toBe(document.body);
    expect(ghost?.tagName).toBe('DIV');
    expect(ghost?.getAttribute('popover')).toBe('manual');
    expect(shown).toContain(ghost as HTMLElement);
    expect(ghost?.dataset.dialogGhost).toBe('bottom');
    expect(ghost?.hasAttribute('data-leaving')).toBe(true);
    expect(ghost?.hasAttribute('inert')).toBe(true);
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.className).toContain('probe-sheet');
    expect(ghost?.style.getPropertyValue('--probe-tint')).toBe('blue');
    expect(ghost?.style.color).toBe('red');
    expect(ghost?.style.position).toBe('fixed');
    expect(ghost?.style.left).toBe('12px');
    expect(ghost?.style.top).toBe('340px');
    expect(ghost?.style.width).toBe('360px');
    expect(ghost?.style.height).toBe('420px');
    expect(ghost?.style.margin).toBe('0px');
    expect(ghost?.querySelectorAll('[id]')).toHaveLength(0);
    expect(ghost?.hasAttribute('id')).toBe(false);
    expect(ghost?.querySelector('[autofocus]')).toBe(null);
    expect(ghost?.textContent).toContain('Quitter');
  });

  test('(b) sous « Réduire les animations », aucun fantôme — le dialogue se ferme quand même', async () => {
    installPopover();
    reduceMotion();
    const host = await mounter.mount(<Probe />);
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(ghosts()).toHaveLength(0);
  });

  test('(b) sans API Popover, aucun fantôme — le dialogue se ferme quand même', async () => {
    const host = await mounter.mount(<Probe />);
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(ghosts()).toHaveLength(0);
  });

  test('(b) au-delà du plafond de nœuds, aucun fantôme', async () => {
    installPopover();
    const many = Array.from({ length: DIALOG_GHOST_MAX_NODES }, (_, index) => <span key={index} />);
    const host = await mounter.mount(<Probe>{many}</Probe>);
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(ghosts()).toHaveLength(0);
  });

  test('(b) une sortie déjà en cours (`data-leaving`) ne crée pas de fantôme', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    dialogOf(host).setAttribute('data-leaving', '');
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(ghosts()).toHaveLength(0);
  });

  test('(b) une scène d’appel modale ouverte : aucun fantôme par-dessus l’appel', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    const stage = document.createElement('dialog');
    stage.setAttribute('data-call-stage', '');
    document.body.appendChild(stage);
    stage.showModal();
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(ghosts()).toHaveLength(0);
  });
});

describe('useDialogExit — Échap et démontage', () => {
  test('(c) Échap (`cancel`) crée le fantôme sans empêcher la fermeture native', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    const cancel = new Event('cancel', { cancelable: true });
    dialogOf(host).dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
    expect(ghosts()).toHaveLength(1);
  });

  test('(d) le démontage d’un dialogue ouvert crée le fantôme', async () => {
    installPopover();
    await mounter.mount(<Probe kind="centered" />);
    mounter.unmountAll();
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0]?.dataset.dialogGhost).toBe('centered');
  });

  test('(d) le démontage d’un dialogue déjà fermé n’en crée aucun', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    act(() => dialogOf(host).close());
    mounter.unmountAll();
    expect(ghosts()).toHaveLength(0);
  });
});

describe('le fantôme n’est qu’un décor', () => {
  test('il ne prend aucun toucher : ni lui, ni son voile — le geste suivant atteint l’écran dessous', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(ghosts()[0]?.style.pointerEvents).toBe('none');
  });

  test('un fantôme qui ne peut pas se montrer ne reste pas et n’empêche pas la fermeture', async () => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      writable: true,
      value: function showPopover() {
        throw new DOMException('refusé', 'InvalidStateError');
      },
    });
    const closed: string[] = [];
    const host = await mounter.mount(<Probe onClose={() => closed.push('close')} />);
    await mounter.click(buttonNamed(host, 'Quitter'));
    expect(dialogOf(host).open).toBe(false);
    expect(closed).toEqual(['close']);
    expect(ghosts()).toHaveLength(0);
  });

  test('le démontage survit à un fantôme impossible', async () => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      writable: true,
      value: function showPopover() {
        throw new DOMException('refusé', 'InvalidStateError');
      },
    });
    const host = await mounter.mount(<Probe kind="centered" />);
    const dialog = dialogOf(host);
    expect(() => mounter.unmountAll()).not.toThrow();
    expect(dialog.open).toBe(false);
    expect(ghosts()).toHaveLength(0);
  });
});

describe('le fantôme s’en va', () => {
  test('(e) à son `animationend`', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    await mounter.click(buttonNamed(host, 'Quitter'));
    const [ghost] = ghosts();
    ghost?.querySelector('button')?.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(ghosts()).toHaveLength(1);
    ghost?.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(ghosts()).toHaveLength(0);
  });

  test('(e) au plus tard après deux fois la durée du mouvement', async () => {
    installPopover();
    const host = await mounter.mount(<Probe />);
    jest.useFakeTimers();
    act(() => buttonNamed(host, 'Quitter')?.click());
    expect(ghosts()).toHaveLength(1);
    jest.advanceTimersByTime(SHEET_MOTION_MS * 2 - 1);
    expect(ghosts()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(ghosts()).toHaveLength(0);
  });
});

describe('le clone ne rejoue rien', () => {
  test('(f) une vidéo clonée n’a ni source ni lecture automatique ; le défilement d’une liste est recopié', async () => {
    installPopover();
    const host = await mounter.mount(
      <Probe>
        <video src="/clip.mp4" autoPlay>
          <source src="/clip.webm" />
        </video>
        <iframe title="cadre" src="/embed" />
        <ul data-scroller="">
          <li>un</li>
        </ul>
      </Probe>,
    );
    const scroller = dialogOf(host).querySelector<HTMLElement>('[data-scroller]');
    if (scroller === null) throw new Error('liste absente');
    scroller.scrollTop = 120;
    await mounter.click(buttonNamed(host, 'Quitter'));
    const [ghost] = ghosts();
    const video = ghost?.querySelector('video');
    expect(video).not.toBe(null);
    expect(video?.hasAttribute('src')).toBe(false);
    expect(video?.hasAttribute('autoplay')).toBe(false);
    expect(video?.querySelector('source')).toBe(null);
    expect(video?.getAttribute('preload')).toBe('none');
    expect(ghost?.querySelector('iframe')).toBe(null);
    expect(ghost?.querySelector<HTMLElement>('[data-scroller]')?.scrollTop).toBe(120);
  });

  test('(f) les champs clonés perdent leur nom : un bouton radio du fantôme ne décoche pas celui du dialogue', async () => {
    installPopover();
    const host = await mounter.mount(
      <Probe>
        <input type="radio" name="duree" value="1" defaultChecked />
        <input type="text" name="legende" defaultValue="bonjour" />
      </Probe>,
    );
    await mounter.click(buttonNamed(host, 'Quitter'));
    const [ghost] = ghosts();
    expect(ghost?.querySelectorAll('input')).toHaveLength(2);
    expect(ghost?.querySelectorAll('[name]')).toHaveLength(0);
    expect(dialogOf(host).querySelector<HTMLInputElement>('input[type=radio]')?.checked).toBe(true);
  });

  test('leaveDialogAsGhost sur un dialogue fermé ne rend rien', () => {
    installPopover();
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    expect(leaveDialogAsGhost(dialog, 'confirm')).toBe(null);
    dialog.remove();
  });
});
