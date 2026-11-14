import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { DIALOG_FADE_MS, SHEET_MOTION_MS } from '@/lib/view/dialog-exit';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Sheet } from './sheet';

/**
 * LA FEUILLE CENTRÉE (#8289) — les formulaires de l'administration (photo,
 * mot de passe, bannissement, création) s'ouvraient PLEIN ÉCRAN sur un bureau
 * de 1 280 px : un bouton « Téléverser » étiré sur toute la largeur, et la
 * fiche disparue derrière. `presentation="centered"` en fait une MODALE,
 * bornée et centrée, qui garde sa gouttière sur un téléphone.
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

describe('Sheet — présentation', () => {
  test('par défaut, plein écran — les listes longues (pays, langue) le restent', async () => {
    const host = await mounter.mount(
      <Sheet title="Pays" onClose={() => {}}>
        <li>France</li>
      </Sheet>,
    );
    const dialog = host.querySelector('dialog');
    expect(dialog?.dataset.sheetPresentation).toBe('fullscreen');
    const classes = dialog?.className.split(' ') ?? [];
    expect(classes).toContain('w-full');
    expect(classes).toContain('h-full');
    expect(classes).toContain('max-w-full');
    expect(classes).toContain('max-h-full');
  });

  /**
   * SUR ORDINATEUR, PLUS AUCUNE MODALE PLEIN ÉCRAN (#10070) — à partir de 768 px,
   * la feuille « plein écran » devient une fenêtre centrée, bornée, posée sur le
   * voile : l'écran d'où l'on vient reste visible derrière. Sous 768 px, rien ne
   * change. Le cadre a une HAUTEUR définie (pas seulement un plafond) : le fil
   * virtualisé de la lecture souveraine a besoin d'un conteneur mesurable.
   */
  test('plein écran : fenêtre centrée et bornée à partir de 768 px', async () => {
    const host = await mounter.mount(
      <Sheet title="Pays" onClose={() => {}}>
        <li>France</li>
      </Sheet>,
    );
    const dialog = host.querySelector('dialog');
    const classes = dialog?.className.split(' ') ?? [];
    expect(classes).toContain('md:m-auto');
    expect(classes).toContain('md:w-[min(40rem,calc(100%-4rem))]');
    expect(classes).toContain('md:h-[min(85dvh,calc(100%-4rem))]');
    expect(classes).toContain('md:rounded-card');
    expect(classes).toContain('backdrop:bg-veil');
    expect(dialog?.style.width).toBe('');
    expect(dialog?.style.height).toBe('');
  });

  test('plein écran : un clic sur le voile ferme la feuille (le clic dans la fenêtre, non)', async () => {
    const host = await mounter.mount(
      <Sheet title="Pays" onClose={() => {}}>
        <li>France</li>
      </Sheet>,
    );
    const dialog = host.querySelector('dialog');
    const item = host.querySelector('li');
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog?.open).toBe(true);
    dialog?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dialog?.open).toBe(false);
  });

  test('plein écran : sur un téléphone, l\'en-tête garde la zone sûre, que le bureau retire', async () => {
    const host = await mounter.mount(
      <Sheet title="Pays" onClose={() => {}}>
        <li>France</li>
      </Sheet>,
    );
    const header = host.querySelector('[data-sheet-close]')?.parentElement;
    const classes = header?.className.split(' ') ?? [];
    expect(classes).toContain('pt-safe');
    expect(classes).toContain('md:pt-2');
  });

  test('centrée : largeur BORNÉE avec gouttière, hauteur bornée, marges automatiques', async () => {
    const host = await mounter.mount(
      <Sheet title="Photo de profil" presentation="centered" bodyAs="div" onClose={() => {}}>
        <p>corps</p>
      </Sheet>,
    );
    const dialog = host.querySelector('dialog');
    expect(dialog?.dataset.sheetPresentation).toBe('centered');
    const classes = dialog?.className.split(' ') ?? [];
    expect(classes).toContain('m-auto');
    expect(classes).toContain('w-[min(36rem,calc(100%-2rem))]');
    expect(classes).toContain('max-h-[min(90dvh,calc(100%-2rem))]');
    expect(dialog?.style.width).toBe('');
  });
});

/**
 * LA FEUILLE ENTRE ET SORT EN MOUVEMENT (#18362) — le ✕, le chevron et le voile ferment le dialogue
 * au même moment qu'avant (`onClose` dans le même toucher), et un fantôme joue la sortie.
 */
describe('Sheet — mouvement', () => {
  const withPopover = async (run: () => Promise<void>): Promise<void> => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, writable: true, value() {} });
    try {
      await run();
    } finally {
      delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
      for (const ghost of document.querySelectorAll('[data-dialog-ghost]')) ghost.remove();
    }
  };

  test('le ✕ rappelle onClose dans le même toucher et laisse un fantôme de la feuille', async () =>
    withPopover(async () => {
      const closed: string[] = [];
      const host = await mounter.mount(
        <Sheet title="Pays" presentation="bottom" onClose={() => closed.push('close')}>
          <li>France</li>
        </Sheet>,
      );
      host.querySelector<HTMLButtonElement>('[data-sheet-close]')?.click();
      expect(closed).toEqual(['close']);
      expect(host.querySelector('dialog')?.open).toBe(false);
      expect(document.querySelector('[data-dialog-ghost]')?.getAttribute('data-dialog-ghost')).toBe('bottom');
    }));

  test('le chevron et le voile font de même', async () =>
    withPopover(async () => {
      const closed: string[] = [];
      const host = await mounter.mount(
        <Sheet title="Détail" backLabel="Retour" onClose={() => closed.push('back')}>
          <li>France</li>
        </Sheet>,
      );
      host.querySelector<HTMLButtonElement>('[data-sheet-back]')?.click();
      expect(closed).toEqual(['back']);
      expect(document.querySelectorAll('[data-dialog-ghost="fullscreen"]')).toHaveLength(1);

      const second = await mounter.mount(
        <Sheet title="Pays" onClose={() => closed.push('veil')}>
          <li>France</li>
        </Sheet>,
      );
      second.querySelector('dialog')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(closed).toEqual(['back', 'veil']);
      expect(document.querySelectorAll('[data-dialog-ghost="fullscreen"]')).toHaveLength(2);
    }));

  test('le dialogue porte les durées de la fiche, en variables que sheet-motion.css lit', async () => {
    const host = await mounter.mount(
      <Sheet title="Pays" onClose={() => {}}>
        <li>France</li>
      </Sheet>,
    );
    const dialog = host.querySelector('dialog');
    expect(dialog?.style.getPropertyValue('--dialog-rise-ms')).toBe(`${SHEET_MOTION_MS}ms`);
    expect(dialog?.style.getPropertyValue('--dialog-fade-ms')).toBe(`${DIALOG_FADE_MS}ms`);
    expect(dialog?.style.getPropertyValue('--dialog-motion-curve')).not.toBe('');
  });

  test('sheet-motion.css n’anime que sous no-preference, en durées de variables', () => {
    const css = readFileSync(new URL('../styles/sheet-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    const end = css.indexOf('@keyframes');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, end);
    expect(block.split('{').length).toBe(block.split('}').length);
    expect(css.slice(0, start) + css.slice(end)).not.toMatch(/animation\s*:/);
    const animations = [...css.matchAll(/animation\s*:\s*([^;]+);/g)].map((match) => match[1] ?? '');
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      expect(animation).toMatch(/var\(--dialog-(?:rise|fade)-ms\)/);
      expect(animation).not.toMatch(/\d+m?s\b/);
    }
    expect(readFileSync(new URL('./sheet.tsx', import.meta.url), 'utf8')).toContain("import '@/styles/sheet-motion.css'");
  });

  test('le voile d’un fantôme ne prend aucun toucher, hors de toute préférence de mouvement', () => {
    const css = readFileSync(new URL('../styles/sheet-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const outside = css.slice(0, css.indexOf('@media'));
    expect(outside).toMatch(/\[data-dialog-ghost\]::backdrop\s*\{[^}]*pointer-events\s*:\s*none/);
  });

  test('la feuille du jeu ne porte plus sa propre animation de feuille', () => {
    const css = readFileSync(new URL('../styles/game.css', import.meta.url), 'utf8');
    expect(css).not.toContain('data-sheet-presentation');
    expect(css).not.toContain('gameSheetRise');
  });
});
