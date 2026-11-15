import { describe, it, expect } from 'vitest';
import {
  CLIENT_SESSION_HEADERS,
  CLIENT_SESSION_AUTH_KEY,
  CLIENT_PLATFORMS,
  SESSION_LOGIN_METHODS,
  GEOLOCATION_ATTRIBUTION,
  EMPTY_CLIENT_SESSION_INFO,
  readClientSessionHeaders,
  readClientSessionAuth,
  sessionClosureReasonText,
  isValidTimeZone,
  cleanClientText,
} from '../utils/client-session';

const iosHeaders = () => ({
  'x-meeshy-version': '1.4.2',
  'x-meeshy-build': '1874',
  'x-meeshy-platform': 'ios',
  'x-meeshy-device': 'iPhone16,2',
  'x-meeshy-os': '18.1',
  'x-meeshy-timezone': 'Europe/Paris',
  'x-device-locale': 'fr-FR',
  'x-meeshy-device-name': 'iPhone 15 Pro Max',
});

describe('le contrat des en-têtes client', () => {
  it('nomme les huit en-têtes, tous facultatifs, avec la casse publiée aux clients', () => {
    expect(CLIENT_SESSION_HEADERS).toEqual({
      appVersion: 'X-Meeshy-Version',
      appBuild: 'X-Meeshy-Build',
      platform: 'X-Meeshy-Platform',
      deviceModel: 'X-Meeshy-Device',
      osVersion: 'X-Meeshy-OS',
      timezone: 'X-Meeshy-Timezone',
      deviceLocale: 'X-Device-Locale',
      deviceName: 'X-Meeshy-Device-Name',
    });
  });

  it('ne connaît que quatre plateformes', () => {
    expect(CLIENT_PLATFORMS).toEqual(['ios', 'web', 'pwa', 'android-shell']);
  });

  it('nomme les moyens de connexion, dont l’inscription et la session anonyme', () => {
    expect(SESSION_LOGIN_METHODS).toEqual([
      'password',
      'two_factor',
      'magic_link',
      'registration',
      'email_verification',
      'oauth',
      'anonymous',
    ]);
  });

  it('porte l’attribution exigée par la licence CC-BY 4.0 de DB-IP Lite', () => {
    expect(GEOLOCATION_ATTRIBUTION).toEqual({
      provider: 'DB-IP',
      text: 'IP Geolocation by DB-IP',
      url: 'https://db-ip.com',
      license: 'CC-BY-4.0',
      approximate: true,
    });
  });

  it('la socket les porte sous une seule clé de `auth`', () => {
    expect(CLIENT_SESSION_AUTH_KEY).toBe('client');
  });
});

describe('readClientSessionHeaders', () => {
  it('lit les huit en-têtes d’un client iOS', () => {
    expect(readClientSessionHeaders(iosHeaders())).toEqual({
      appVersion: '1.4.2',
      appBuild: '1874',
      platform: 'ios',
      deviceModel: 'iPhone16,2',
      osVersion: '18.1',
      timezone: 'Europe/Paris',
      deviceLocale: 'fr-FR',
      deviceName: 'iPhone 15 Pro Max',
    });
  });

  it('un ancien client qui n’envoie rien rend un relevé entièrement nul', () => {
    expect(readClientSessionHeaders({ 'user-agent': 'Mozilla/5.0' })).toEqual(EMPTY_CLIENT_SESSION_INFO);
  });

  it('une plateforme inconnue est ignorée, jamais recopiée', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-platform': 'windows-phone' }).platform).toBeNull();
  });

  it('la plateforme se lit sans égard à la casse', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-platform': 'Android-Shell' }).platform).toBe('android-shell');
  });

  it('refuse une version qui n’a pas la forme d’une version', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-version': '<script>alert(1)</script>' }).appVersion).toBeNull();
  });

  it('refuse un fuseau qui n’a pas la forme IANA', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-timezone': 'Paris; DROP' }).timezone).toBeNull();
  });

  it('retire les caractères de contrôle et borne la longueur du nom d’appareil', () => {
    const declared = readClientSessionHeaders({ 'x-meeshy-device-name': `Pixel\u0000 8${'x'.repeat(200)}` }).deviceName;
    expect(declared).not.toContain('\u0000');
    expect(declared?.length).toBeLessThanOrEqual(64);
    expect(declared?.startsWith('Pixel 8')).toBe(true);
  });

  it('un en-tête vide ou fait d’espaces vaut absent', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-device-name': '   ', 'x-meeshy-build': '' })).toEqual(EMPTY_CLIENT_SESSION_INFO);
  });

  it('un en-tête répété ne garde que la première valeur', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-version': ['2.0.1', '9.9.9'] }).appVersion).toBe('2.0.1');
  });
});

describe('readClientSessionAuth', () => {
  it('lit le relevé posé sous `auth.client` par une socket', () => {
    const auth = { token: 'jwt', client: { appVersion: '2.0.3', platform: 'pwa', deviceName: 'Chrome sur Mac' } };
    expect(readClientSessionAuth(auth)).toEqual({
      ...EMPTY_CLIENT_SESSION_INFO,
      appVersion: '2.0.3',
      platform: 'pwa',
      deviceName: 'Chrome sur Mac',
    });
  });

  it('une socket sans relevé, ou avec un relevé qui n’est pas un objet, ne déclare rien', () => {
    expect(readClientSessionAuth({ token: 'jwt' })).toEqual(EMPTY_CLIENT_SESSION_INFO);
    expect(readClientSessionAuth({ client: 'ios' })).toEqual(EMPTY_CLIENT_SESSION_INFO);
    expect(readClientSessionAuth(null)).toEqual(EMPTY_CLIENT_SESSION_INFO);
  });

  it('applique les mêmes refus qu’aux en-têtes', () => {
    const auth = { client: { appVersion: 42, platform: 'beos', timezone: '../../etc' } };
    expect(readClientSessionAuth(auth)).toEqual(EMPTY_CLIENT_SESSION_INFO);
  });
});

describe('sessionClosureReasonText', () => {
  it('dit en clair pourquoi une session a été fermée, en français', () => {
    expect(sessionClosureReasonText('admin_revoke', 'fr')).toBe('Fermée par l’équipe Meeshy');
    expect(sessionClosureReasonText('logout', 'fr')).toBe('Déconnexion');
  });

  it('en anglais pour toute autre langue', () => {
    expect(sessionClosureReasonText('expired', 'de')).toBe('Expired');
  });

  it('reconnaît la forme majuscule historique de la réinitialisation de mot de passe', () => {
    expect(sessionClosureReasonText('PASSWORD_RESET', 'fr')).toBe('Mot de passe réinitialisé');
  });

  it('une session ouverte n’a pas de motif, un code inconnu se dit tel quel', () => {
    expect(sessionClosureReasonText(null, 'fr')).toBeNull();
    expect(sessionClosureReasonText('quantum_flux', 'en')).toBe('Closed (quantum_flux)');
  });
});

describe('audit L2-1, L2-8 — ce qui passe la forme mais pas la réalité', () => {
  it('un fuseau de forme IANA mais inconnu est refusé (Intl.DateTimeFormat)', () => {
    expect(readClientSessionHeaders({ 'x-meeshy-timezone': 'Foo/Bar' }).timezone).toBeNull();
    expect(readClientSessionHeaders({ 'x-meeshy-timezone': 'America/Argentina/Buenos_Aires' }).timezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('isValidTimeZone dit si Intl connaît le fuseau', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Foo/Bar')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it('retire les contrôles bidirectionnels d’un nom d’appareil', () => {
    const name = readClientSessionHeaders({ 'x-meeshy-device-name': 'iPhone ‮orp⁦ ‏de Ada‎' }).deviceName;
    expect(name).toBe('iPhone orp de Ada');
  });

  it('cleanClientText borne et nettoie un texte libre', () => {
    expect(cleanClientText(`a‫b\u0000c${'x'.repeat(100)}`, 10)).toBe('abcxxxxxxx');
    expect(cleanClientText('  ', 10)).toBeNull();
    expect(cleanClientText(42, 10)).toBeNull();
  });
});
