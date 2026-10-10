import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

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
