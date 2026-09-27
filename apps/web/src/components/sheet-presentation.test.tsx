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
    expect(dialog?.style.width).toBe('100%');
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
