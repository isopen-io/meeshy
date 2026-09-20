import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedNewPostsBanner } from './feed-new-posts-banner';

/**
 * **« N NOUVELLES PUBLICATIONS »** (#7182) — ce que le lecteur n'a pas encore
 * vu, dit dans sa langue, et qui SERT à quelque chose.
 *
 * ## POURQUOI ELLE N'EST PAS FLOTTANTE, CONTRAIREMENT À iOS
 *
 * iOS la pose par-dessus le fil (`FeedView.swift:1200-1235`). **D-50 l'interdit
 * ici** : « aucun flottant ne recouvre un texte au repos », et l'article écarte
 * nommément l'argument qui aurait sauvé le flottant — « "iOS fait pareil" dit
 * que la cible porte le même défaut, pas qu'il est souhaitable ». La bannière
 * prend donc sa place DANS le flux, en tête de liste : elle ne recouvre rien,
 * ni pendant le défilement ni au repos.
 *
 * Ce que cette conformité coûte — la bannière n'est plus visible quand le
 * lecteur est descendu — est un arbitrage de produit, ouvert au porteur ; il
 * n'appartient pas à ce composant.
 *
 * ## LE TÉMOIN QUI COMPTE EST CELUI DE L'EFFET
 *
 * `PostCard` a déjà coûté au dépôt une zone « traductions disponibles »
 * cliquable dont le clic ne changeait RIEN (cycle 123 du `CLAUDE.md` racine).
 * Un contrôle n'existe que s'il a un effet (loi 4) : le témoin du bas ne
 * regarde ni la classe ni l'icône, il regarde si TAPER fait quelque chose.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const monter = async (props: { readonly count: number; readonly onTap?: () => void }): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<FeedNewPostsBanner count={props.count} onTap={props.onTap ?? (() => {})} />));
  return container;
};

const bouton = (host: ParentNode): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('[data-feed-new-posts]');

describe('elle ne parle que lorsqu’il y a quelque chose à dire', () => {
  /** LE CONTRE-TÉMOIN — sans lui, une bannière posée inconditionnellement
      annoncerait « 0 nouvelle publication » sur un fil immobile, et
      recouvrirait la première carte pour ne rien dire. */
  test('aucune bannière quand rien n’est arrivé', async () => {
    const host = await monter({ count: 0 });

    expect(bouton(host)).toBe(null);
    expect(host.textContent).toBe('');
  });

  test('un compte négatif ne la réveille pas davantage', async () => {
    const host = await monter({ count: -3 });

    expect(bouton(host)).toBe(null);
  });
});

describe('elle dit le compte, dans la langue de l’interface', () => {
  test('le PLURIEL, en français', async () => {
    const host = await monter({ count: 3 });

    expect(bouton(host)?.textContent).toContain('3 nouvelles publications');
  });

  /**
   * LE SINGULIER — sans clé propre, le français dirait « 1 nouvelles
   * publications ». Le dépôt a déjà la forme `.one` / `.other`
   * (`stories.count.one`, `a11y.floating.menu.unread.one`) ; on la suit.
   */
  test('le SINGULIER a sa clé', async () => {
    const host = await monter({ count: 1 });

    expect(bouton(host)?.textContent).toContain('1 nouvelle publication');
    expect(bouton(host)?.textContent).not.toContain('publications');
  });
});

describe('et elle a un EFFET (loi 4)', () => {
  test('la taper appelle son hôte', async () => {
    let tapes = 0;
    const host = await monter({ count: 2, onTap: () => (tapes += 1) });

    await act(async () => bouton(host)?.click());

    expect(tapes).toBe(1);
  });

  /**
   * ELLE S'ANNONCE AUX LECTEURS D'ÉCRAN. Une bannière qui apparaît sans être
   * annoncée est une information réservée à ceux qui voient — et la cible de
   * 44 px est la règle du dépôt pour toute cible tactile (dimension 5).
   */
  test('elle est atteignable sans la souris et sans voir', async () => {
    const host = await monter({ count: 2 });
    const cible = bouton(host);

    expect(cible?.tagName).toBe('BUTTON');
    expect(cible?.getAttribute('type')).toBe('button');
    expect(Number(cible?.style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(44);
  });
});
