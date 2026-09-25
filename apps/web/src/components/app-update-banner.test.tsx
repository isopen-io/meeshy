import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { appUpdateStore } from '@/lib/app-update/pending-store';
import type { RegistrationLike } from '@/lib/app-update/service-worker';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AppUpdateBanner } from './app-update-banner';

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('ar');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();

/* `act()` exige que l'environnement se DÉCLARE (motif `media-grid.test.tsx`) :
   sans ce drapeau, React avertit à chaque montage et n'applique pas ses
   garanties de rendu. */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

afterEach(async () => {
  mounter.unmountAll();
  appUpdateStore.setState({ pending: null, store: null, dismissed: false, applying: false });
  await setInterfaceLanguage('fr');
  online = true;
});

let online = true;

const registration = (): RegistrationLike => ({
  installing: null,
  waiting: null,
  addEventListener: () => undefined,
  update: () => Promise.resolve(),
});

function fakeOnline(): boolean {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  return online;
}

const mount = async (apply: (registration: RegistrationLike) => void = () => undefined): Promise<HTMLDivElement> => {
  fakeOnline();
  return mounter.mount(<AppUpdateBanner apply={apply} />);
};

const button = (host: ParentNode, label: string): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  ) ?? null;

describe('la bannière de mise à jour — ce qu’elle montre', () => {
  test('aucune version en attente ⇒ elle ne peint rien', async () => {
    const host = await mount();

    expect(host.textContent).toBe('');
  });

  test('une version en attente ⇒ le texte du legacy et ses deux contrôles', async () => {
    appUpdateStore.getState().announce(registration());
    const host = await mount();

    expect(host.textContent).toContain(translate('fr', 'appUpdate.available'));
    expect(host.textContent).toContain(translate('fr', 'appUpdate.hint'));
    expect(button(host, translate('fr', 'appUpdate.action'))).not.toBeNull();
    expect(button(host, translate('fr', 'appUpdate.dismiss'))).not.toBeNull();
  });

  test('elle est annoncée au lecteur d’écran, et sa région porte un nom', async () => {
    appUpdateStore.getState().announce(registration());
    const host = await mount();

    const region = host.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('aria-label')).toBe(translate('fr', 'appUpdate.region'));
  });

  test('ses deux contrôles portent une cible de 44 px', async () => {
    appUpdateStore.getState().announce(registration());
    const host = await mount();

    for (const label of [translate('fr', 'appUpdate.action'), translate('fr', 'appUpdate.dismiss')]) {
      expect(button(host, label)?.className).toContain('min-h-11');
    }
  });

  test('elle se dit dans la langue d’interface — l’arabe, pas un repli français', async () => {
    await setInterfaceLanguage('ar');
    appUpdateStore.getState().announce(registration());
    const host = await mount();

    expect(host.textContent).toContain(translate('ar', 'appUpdate.available'));
    expect(host.textContent).not.toContain(translate('fr', 'appUpdate.available'));
  });

  test('HORS LIGNE ⇒ rien : la coupure passe d’abord, comme dans le legacy', async () => {
    appUpdateStore.getState().announce(registration());
    online = false;
    const host = await mount();

    expect(host.textContent).toBe('');
  });
});

describe('la bannière de mise à jour — ce que ses contrôles font', () => {
  test('« Mettre à jour » applique la version en attente', async () => {
    const attendue = registration();
    appUpdateStore.getState().announce(attendue);
    const appliquees: RegistrationLike[] = [];
    const host = await mount((target) => appliquees.push(target));

    await mounter.click(button(host, translate('fr', 'appUpdate.action')));

    expect(appliquees).toEqual([attendue]);
  });

  test('pendant l’application, le bouton le DIT et ne repart pas deux fois', async () => {
    appUpdateStore.getState().announce(registration());
    let appels = 0;
    const host = await mount(() => {
      appels += 1;
    });

    await mounter.click(button(host, translate('fr', 'appUpdate.action')));
    expect(host.textContent).toContain(translate('fr', 'appUpdate.applying'));

    const encore = button(host, translate('fr', 'appUpdate.applying'));
    expect(encore?.disabled).toBe(true);
    await mounter.click(encore);

    expect(appels).toBe(1);
  });

  test('« Attendre » referme la bannière sans rien appliquer', async () => {
    appUpdateStore.getState().announce(registration());
    let appels = 0;
    const host = await mount(() => {
      appels += 1;
    });

    await mounter.click(button(host, translate('fr', 'appUpdate.dismiss')));

    expect(host.textContent).toBe('');
    expect(appels).toBe(0);
  });

  test('une annonce suivante rouvre la bannière refermée', async () => {
    appUpdateStore.getState().announce(registration());
    const host = await mount();
    await mounter.click(button(host, translate('fr', 'appUpdate.dismiss')));
    expect(host.textContent).toBe('');

    await act(async () => {
      appUpdateStore.getState().announce(registration());
    });

    expect(host.textContent).toContain(translate('fr', 'appUpdate.available'));
  });
});

describe('la bannière de mise à jour — dans la coque, la version vient du magasin (#6937)', () => {
  const PLAY = 'https://play.google.com/store/apps/details?id=me.meeshy.app';

  test('les mêmes libellés, et l’action OUVRE la fiche du magasin au lieu de recharger', async () => {
    appUpdateStore.getState().announceStore({ version: '2.0.8', storeUrl: PLAY });
    const applied: RegistrationLike[] = [];
    const host = await mount((target) => applied.push(target));

    expect(host.textContent).toContain(translate('fr', 'appUpdate.available'));
    expect(host.textContent).toContain(translate('fr', 'appUpdate.storeHint'));
    expect(host.textContent).not.toContain(translate('fr', 'appUpdate.hint'));
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.trim() === translate('fr', 'appUpdate.action'));
    expect(link?.getAttribute('href')).toBe(PLAY);
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.className).toContain('min-h-11');
    expect(button(host, translate('fr', 'appUpdate.action'))).toBeNull();
    expect(applied).toEqual([]);
  });

  test('« Attendre » la referme aussi', async () => {
    appUpdateStore.getState().announceStore({ version: '2.0.8', storeUrl: PLAY });
    const host = await mount();

    await act(async () => {
      button(host, translate('fr', 'appUpdate.dismiss'))?.click();
    });

    expect(host.textContent).toBe('');
  });

  test('HORS LIGNE ⇒ rien, comme sur le web', async () => {
    appUpdateStore.getState().announceStore({ version: '2.0.8', storeUrl: PLAY });
    online = false;
    const host = await mount();

    expect(host.textContent).toBe('');
  });
});
