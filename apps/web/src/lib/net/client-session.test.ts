import { describe, expect, test } from 'bun:test';

import { readClientSessionAuth, readClientSessionHeaders } from '@meeshy/shared/utils/client-session';

import { clientSessionAuth, clientSessionHeaders, describeClient, type ClientEnvironment } from './client-session';

/**
 * CE QUE LE WEB DÉCLARE DE LUI-MÊME (#9611) — le contrat de
 * `packages/shared/utils/client-session.ts`, rempli depuis ce que le navigateur
 * ou la coque savent. Chaque témoin relit la déclaration par le LECTEUR de la
 * passerelle (`readClientSessionHeaders`, `readClientSessionAuth`) : un champ
 * que le serveur jetterait n'est pas déclaré.
 */

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36';
const ANDROID_REDUCED = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const environment = (overrides: Partial<ClientEnvironment> = {}): ClientEnvironment => ({
  appVersion: '2.13.0',
  shellPlatform: null,
  standalone: false,
  userAgent: MAC_CHROME,
  timezone: 'Africa/Dakar',
  deviceLocale: 'fr-FR',
  hints: null,
  ...overrides,
});

const lowerCased = (headers: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));

describe('la plateforme se lit sur l’hôte, jamais sur l’agent', () => {
  test('un onglet de navigateur est « web »', () => {
    expect(describeClient(environment()).platform).toBe('web');
  });

  test('une application installée (display-mode standalone) est « pwa »', () => {
    expect(describeClient(environment({ standalone: true })).platform).toBe('pwa');
  });

  test('la coque Capacitor Android est « android-shell », même affichée en plein écran', () => {
    expect(describeClient(environment({ shellPlatform: 'android', standalone: true, userAgent: ANDROID_WEBVIEW })).platform).toBe('android-shell');
  });

  test('une coque d’une autre plateforme ne se fait passer pour rien', () => {
    expect(describeClient(environment({ shellPlatform: 'ios' })).platform).toBeNull();
  });
});

describe('la version, le fuseau et la locale', () => {
  test('la version est celle du paquet ; aucun build n’est inventé', () => {
    const info = describeClient(environment());
    expect(info.appVersion).toBe('2.13.0');
    expect(info.appBuild).toBeNull();
  });

  test('le fuseau IANA et la locale de l’appareil passent', () => {
    const info = describeClient(environment());
    expect(info.timezone).toBe('Africa/Dakar');
    expect(info.deviceLocale).toBe('fr-FR');
  });

  test('un fuseau hors forme est tu, comme la passerelle le tairait', () => {
    expect(describeClient(environment({ timezone: 'pas un fuseau !' })).timezone).toBeNull();
  });
});

describe('le système et l’appareil', () => {
  test('iPhone : la version du système vient de l’agent', () => {
    expect(describeClient(environment({ userAgent: IPHONE_SAFARI })).osVersion).toBe('17.4');
  });

  test('macOS : l’agent est figé à 10.15.7 — seule l’indication du navigateur dit la vraie version', () => {
    expect(describeClient(environment()).osVersion).toBeNull();
    expect(describeClient(environment({ hints: { platform: 'macOS', platformVersion: '15.2.0', model: '' } })).osVersion).toBe('15.2.0');
  });

  test('la coque Android : modèle, nom et version du système lus dans l’agent de la WebView', () => {
    const info = describeClient(environment({ shellPlatform: 'android', userAgent: ANDROID_WEBVIEW }));
    expect(info.deviceModel).toBe('Pixel 7');
    expect(info.deviceName).toBe('Pixel 7');
    expect(info.osVersion).toBe('14');
  });

  test('un agent RÉDUIT (« Android 10; K ») ne fabrique ni modèle ni version', () => {
    const info = describeClient(environment({ userAgent: ANDROID_REDUCED }));
    expect(info.deviceModel).toBeNull();
    expect(info.osVersion).toBeNull();
  });

  test('sous un agent réduit, l’indication du navigateur donne le vrai modèle et la vraie version', () => {
    const info = describeClient(
      environment({ userAgent: ANDROID_REDUCED, hints: { platform: 'Android', platformVersion: '14.0.0', model: 'SM-S911B' } }),
    );
    expect(info.deviceModel).toBe('SM-S911B');
    expect(info.osVersion).toBe('14.0.0');
  });

  test('Windows : la version servie par l’indication ne se recopie pas — elle ne dit pas « 11 »', () => {
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
    expect(describeClient(environment({ userAgent: windows, hints: { platform: 'Windows', platformVersion: '15.0.0', model: '' } })).osVersion).toBeNull();
  });

  test('un ordinateur ne déclare aucun modèle : la passerelle le déduit de l’agent', () => {
    const info = describeClient(environment());
    expect(info.deviceModel).toBeNull();
    expect(info.deviceName).toBeNull();
  });
});

describe('les en-têtes HTTP', () => {
  test('relus par la passerelle, ils rendent la déclaration ENTIÈRE — la locale du Prisme comprise', () => {
    const info = describeClient(environment({ shellPlatform: 'android', userAgent: ANDROID_WEBVIEW }));
    const headers = clientSessionHeaders(info);
    expect(readClientSessionHeaders(lowerCased(headers))).toEqual(info);
    expect(headers['X-Device-Locale']).toBe('fr-FR');
  });

  test('un champ inconnu n’est pas posé — jamais un en-tête vide', () => {
    const headers = clientSessionHeaders(describeClient(environment()));
    expect(Object.keys(headers).sort()).toEqual(['X-Device-Locale', 'X-Meeshy-Platform', 'X-Meeshy-Timezone', 'X-Meeshy-Version']);
    expect(Object.values(headers).every((value) => value !== '')).toBe(true);
  });
});

describe('la poignée de main socket', () => {
  test('`handshake.auth.client` porte le même relevé, locale comprise', () => {
    const info = describeClient(environment({ standalone: true }));
    expect(readClientSessionAuth({ client: clientSessionAuth(info) })).toEqual(info);
    expect(Object.keys(clientSessionAuth(info))).not.toContain('appBuild');
  });
});
