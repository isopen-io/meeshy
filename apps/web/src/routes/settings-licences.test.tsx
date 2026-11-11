import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadLicencesCatalog } from '@/lib/i18n-licences-catalog';
import { libsignalEngineAt } from '@/lib/licences/libsignal-engine';
import { MEESHY_REPOSITORY_URL } from '@/lib/licences/source-offer';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SettingsLicencesScreen } from './settings-licences';
import { AboutSection, LICENCES_PANEL, SECURITY_PANEL_PARAM } from './settings-sections';

/**
 * L'ÉCRAN LICENCES (#14628) — la licence de Meeshy, l'offre de source au commit
 * du bundle, et, SEULEMENT quand le moteur WASM de libsignal est embarqué, la
 * mention AGPL-3.0, son texte intégral et le renvoi aux avis de libsignal.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();
const sha = '0123456789abcdef0123456789abcdef01234567';

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('ar'), loadLicencesCatalog('fr'), loadLicencesCatalog('ar')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

describe('l écran Licences', () => {
  test('le lien de source mène au commit exact du bundle, qui s affiche en abrégé', async () => {
    const host = await mount(<SettingsLicencesScreen language="fr" commit={sha} engine={null} />);
    const source = host.querySelector<HTMLAnchorElement>('[data-licences-source]');
    expect(source?.getAttribute('href')).toBe(`${MEESHY_REPOSITORY_URL}/tree/${sha}`);
    expect(source?.getAttribute('rel')).toContain('noopener');
    expect(host.querySelector('[data-licences-commit]')?.textContent).toBe('Révision 0123456');
  });

  test('sans commit gravé, le lien mène au dépôt et aucune révision n est inventée', async () => {
    const host = await mount(<SettingsLicencesScreen language="fr" commit={null} engine={null} />);
    expect(host.querySelector('[data-licences-source]')?.getAttribute('href')).toBe(MEESHY_REPOSITORY_URL);
    expect(host.querySelector('[data-licences-commit]')).toBeNull();
  });

  test('sans moteur libsignal, le bundle se dit MIT, sans texte AGPL ni avis', async () => {
    const host = await mount(<SettingsLicencesScreen language="fr" commit={null} engine={null} />);
    expect(host.querySelector('[data-licences-statement]')?.textContent).toBe('Le code source de Meeshy est publié sous licence MIT.');
    expect(host.querySelector('[data-licences-agpl]')).toBeNull();
    expect(host.querySelector('[data-licences-libsignal]')).toBeNull();
  });

  test('avec le moteur libsignal, il se dit AGPL-3.0, embarque le texte intégral et renvoie aux avis du tag épinglé', async () => {
    const host = await mount(<SettingsLicencesScreen language="fr" commit={null} engine={libsignalEngineAt('0.105.4')} />);
    expect(host.querySelector('[data-licences-statement]')?.textContent).toContain('AGPL-3.0 uniquement');
    const text = host.querySelector('[data-licences-agpl] pre')?.textContent ?? '';
    expect((host.textContent ?? '').toLocaleLowerCase('fr').split('texte de la licence agpl-3.0').length - 1).toBe(1);
    expect(text.startsWith('                    GNU AFFERO GENERAL PUBLIC LICENSE')).toBe(true);
    expect(text).toContain('13. Remote Network Interaction');
    expect(host.querySelector('[data-licences-libsignal]')?.getAttribute('href')).toBe('https://github.com/signalapp/libsignal/tree/v0.105.4/acknowledgments');
  });

  test('en arabe, l écran parle arabe et garde la révision de gauche à droite', async () => {
    const host = await mount(<SettingsLicencesScreen language="ar" commit={sha} engine={null} />);
    expect(host.querySelector('h1')?.textContent).toBe('التراخيص');
    expect(host.querySelector('[data-licences-commit]')?.getAttribute('dir')).toBe('ltr');
  });

  test('Réglages › À propos mène au volet des licences', async () => {
    const host = await mount(<AboutSection language="fr" version="0.0.0-test" />);
    const row = host.querySelector<HTMLAnchorElement>('[data-settings-licences]');
    expect(row?.textContent).toContain('Licences open source');
    expect(row?.getAttribute('href')).toContain(`${SECURITY_PANEL_PARAM}=${LICENCES_PANEL}`);
  });
});
