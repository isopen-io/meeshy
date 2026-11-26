import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadPublisherPageCatalog } from '@/lib/i18n-publisher-page-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PublisherPageSectionView, type PublisherPageView } from './settings-publisher-page';

/**
 * LA PAGE ÉDITEUR DANS LES RÉGLAGES (#16440) — un interrupteur « Afficher mon
 * profil Meeshy sur ma page éditeur », éteint par défaut, qui n'existe que
 * pour un compte qui a un profil d'éditeur : sans profil, ni pendant la
 * lecture, rien ne s'affiche (une fonction fermée est absente).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadPublisherPageCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const ready = (show: boolean): PublisherPageView => ({ kind: 'ready', displayName: 'Studio Lumière', showOwnerProfile: show });

function section(view: PublisherPageView, disabled = false) {
  const toggles: boolean[] = [];
  const element = <PublisherPageSectionView language="fr" view={view} disabled={disabled} onToggle={(show) => toggles.push(show)} />;
  return { element, toggles };
}

const switchOf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-setting="publisher-show-owner"]');

describe('Réglages › Page éditeur', () => {
  test('sans profil d’éditeur, pendant la lecture ou si elle échoue : rien', async () => {
    for (const view of [{ kind: 'none' }, { kind: 'loading' }, { kind: 'error' }] as const) {
      const host = await mount(section(view).element);
      expect({ kind: view.kind, html: host.innerHTML }).toEqual({ kind: view.kind, html: '' });
      unmountAll();
    }
  });

  test('un éditeur voit l’interrupteur éteint par défaut, nommé, avec le nom de sa page', async () => {
    const host = await mount(section(ready(false)).element);
    expect(host.querySelector('h2')?.textContent).toBe('PAGE ÉDITEUR');
    const toggle = switchOf(host);
    expect(toggle?.getAttribute('role')).toBe('switch');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe('Afficher mon profil Meeshy sur ma page éditeur');
    const caption = host.querySelector(`#${toggle?.getAttribute('aria-describedby') ?? 'absent'}`);
    expect(caption?.textContent).toContain('« Studio Lumière »');
  });

  test('toucher l’interrupteur demande l’état inverse', async () => {
    const off = section(ready(false));
    const hostOff = await mount(off.element);
    const toggleOff = switchOf(hostOff);
    if (toggleOff !== null) await click(toggleOff);
    expect(off.toggles).toEqual([true]);
    unmountAll();
    const on = section(ready(true));
    const hostOn = await mount(on.element);
    expect(switchOf(hostOn)?.getAttribute('aria-checked')).toBe('true');
    const toggleOn = switchOf(hostOn);
    if (toggleOn !== null) await click(toggleOn);
    expect(on.toggles).toEqual([false]);
  });

  test('hors ligne, l’interrupteur est désactivé', async () => {
    const host = await mount(section(ready(false), true).element);
    expect(switchOf(host)?.disabled).toBe(true);
  });
});
