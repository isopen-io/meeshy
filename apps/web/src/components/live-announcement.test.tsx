import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LiveAnnouncement } from './live-announcement';

/**
 * **L'ISSUE D'UN GESTE SE VOIT** (revue #7083, défaut majeur 3).
 *
 * Le défaut mesuré tenait dans une classe : `/discover` peignait sa pastille
 * dès que la région portait un texte, `/u/` la laissait en `sr-only`
 * INCONDITIONNELLEMENT — mêmes clés, même hook, deux produits. Ces témoins
 * gardent la loi partagée, pour que la prochaine surface qui la copie
 * n'invente pas une troisième variante.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

function render(node: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => root.render(node));
  return container;
}

describe('LiveAnnouncement — la même loi sur les deux surfaces', () => {
  test('au repos elle reste `sr-only` : jamais une bande vide au bas de l’écran', () => {
    const el = render(<LiveAnnouncement text="" tone="neutral" marker="profile" />);
    const region = el.querySelector('[data-profile-announce]');
    expect(region?.getAttribute('class')).toBe('sr-only');
    expect(region?.getAttribute('data-announce-tone')).toBeNull();
  });

  test('dès qu’elle porte un texte, elle QUITTE `sr-only` — c’était le défaut de `/u/`', () => {
    const el = render(<LiveAnnouncement text="Demande envoyée" tone="neutral" marker="profile" />);
    const region = el.querySelector('[data-profile-announce]');
    expect(region?.getAttribute('class')).not.toBe('sr-only');
    expect(region?.getAttribute('class') ?? '').toContain('rounded-chip');
    expect(region?.textContent).toBe('Demande envoyée');
  });

  test('un ÉCHEC ne se lit pas comme une réussite : encre d’erreur et ton déclaré', () => {
    const el = render(<LiveAnnouncement text="Impossible de bloquer" tone="error" marker="profile" />);
    const region = el.querySelector<HTMLElement>('[data-profile-announce]');
    expect(region?.getAttribute('data-announce-tone')).toBe('error');
    expect(region?.style.backgroundColor).toBe('var(--color-error)');
  });

  /**
   * **L'ENCRE TIENT AA DANS LES DEUX SCHÉMAS** (revue-correction #6149,
   * défaut majeur 1, issue #7859) — `#fff` codé en dur ne tenait que 3,23:1
   * sur `--color-error` en sombre (`--color-danger` `#f45b5b`) ; le calcul
   * complet, depuis les jetons réels, vit dans
   * `live-announcement-contrast.test.ts`. Ce témoin-ci garde seulement que le
   * composant ne recopie plus jamais `#fff` — un jeton par schéma
   * (`--color-on-status`), jamais une constante.
   */
  test('l’encre d’erreur suit un jeton PAR SCHÉMA, jamais `#fff` recopié', () => {
    const el = render(<LiveAnnouncement text="Impossible de bloquer" tone="error" marker="profile" />);
    const region = el.querySelector<HTMLElement>('[data-profile-announce]');
    expect(region?.style.color).toBe('var(--color-on-status)');
    expect(region?.style.color).not.toBe('#fff');
  });

  test('les deux surfaces gardent leur point d’accroche de gate', () => {
    const profil = render(<LiveAnnouncement text="Bonjour" tone="neutral" marker="profile" />);
    expect(profil.querySelector('[data-profile-announce]')).not.toBeNull();
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    const decouvrir = render(<LiveAnnouncement text="Bonjour" tone="neutral" marker="discover" />);
    expect(decouvrir.querySelector('[data-discover-announce]')).not.toBeNull();
  });

  test('elle ANNONCE, elle ne prend aucun geste — le « Réessayer » reste le bouton d’action lui-même', () => {
    const el = render(<LiveAnnouncement text="Impossible de bloquer" tone="error" marker="profile" />);
    expect(el.querySelector('[data-profile-announce]')?.getAttribute('class') ?? '').toContain('pointer-events-none');
    expect(el.querySelector('[data-profile-announce] button')).toBeNull();
  });
});
