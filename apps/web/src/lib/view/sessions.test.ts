import { describe, expect, test } from 'bun:test';

import type { ActiveSession, ActiveSessions } from '@/lib/api/account-security';
import { loadSessionsCatalog, sessionsTextOf } from '@/lib/i18n-sessions-catalog';

import { orderedSessions, sessionFields, sessionTitle, withoutSessions } from './sessions';

/**
 * CE QUE L'ÉCRAN SÉCURITÉ > SESSIONS DIT D'UNE SESSION (#6720) — tout ce que
 * la passerelle sait, dans la langue du lecteur, chaque champ absent TU
 * (jamais « null », jamais un tiret qui ressemble à une valeur).
 */

const session = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  id: 's1',
  deviceType: 'mobile',
  deviceVendor: 'Google',
  deviceModel: 'Pixel 7',
  deviceName: null,
  osName: 'Android',
  osVersion: '14',
  browserName: 'Chrome WebView',
  browserVersion: '141',
  isMobile: true,
  appVersion: '2.13.0',
  appBuild: null,
  platform: 'android-shell',
  loginMethod: 'magic_link',
  ipAddress: '203.0.113.7',
  country: 'SN',
  city: 'Dakar',
  location: 'Dakar, SN',
  timezone: 'Africa/Dakar',
  createdAt: '2026-10-01T08:00:00.000Z',
  lastActivityAt: '2026-10-08T11:55:00.000Z',
  isCurrent: false,
  isTrusted: false,
  ...overrides,
});

const NOW = new Date('2026-10-08T12:00:00.000Z');

const fieldsFr = async (s: ActiveSession, approximate = true) => {
  await loadSessionsCatalog('fr');
  return Object.fromEntries(sessionFields(s, { language: 'fr', now: NOW, t: sessionsTextOf('fr'), approximate }).map((f) => [f.key, f.value]));
};

describe('sessionFields — toutes les informations disponibles', () => {
  test('version, plateforme, appareil, système, navigateur, IP, lieu approximatif, fuseau, dates, moyen', async () => {
    const { opened, ...fields } = await fieldsFr(session());
    expect(opened).toContain('2026');
    expect(fields).toEqual({
      app: 'Version 2.13.0',
      platform: 'Application Android',
      device: 'Google Pixel 7',
      system: 'Android 14',
      browser: 'Chrome WebView 141',
      ip: '203.0.113.7',
      place: 'Dakar, Sénégal · approximatif',
      timezone: 'Africa/Dakar',
      lastActive: 'il y a 5 minutes',
      method: 'Lien de connexion par e-mail',
    });
  });

  test('le build accompagne la version quand il est servi', async () => {
    expect((await fieldsFr(session({ appBuild: '1874' }))).app).toBe('Version 2.13.0 (1874)');
  });

  test('un champ absent est TU, jamais rendu vide', async () => {
    const fields = await fieldsFr(session({ appVersion: null, platform: null, ipAddress: null, country: null, city: null, location: null, loginMethod: null, timezone: null }));
    for (const key of ['app', 'platform', 'ip', 'place', 'method', 'timezone']) expect(Object.keys(fields)).not.toContain(key);
  });

  test('un lieu servi sans pays ni ville retombe sur `location` ; sans attribution approximative, il n’est pas qualifié', async () => {
    expect((await fieldsFr(session({ country: null, city: null, location: 'Local' }), false)).place).toBe('Local');
  });

  test('l’arabe nomme le pays dans sa langue', async () => {
    await loadSessionsCatalog('ar');
    const place = sessionFields(session(), { language: 'ar', now: NOW, t: sessionsTextOf('ar'), approximate: true }).find((f) => f.key === 'place');
    expect(place?.value).toContain('السنغال');
  });

  test('l’adresse IP et le fuseau se lisent de gauche à droite, même en arabe', async () => {
    await loadSessionsCatalog('ar');
    const fields = sessionFields(session(), { language: 'ar', now: NOW, t: sessionsTextOf('ar'), approximate: true });
    expect(fields.filter((f) => f.ltr).map((f) => f.key).sort()).toEqual(['ip', 'timezone']);
  });
});

describe('sessionTitle', () => {
  test('le nom déclaré d’abord, puis la marque et le modèle, puis le navigateur et le système', async () => {
    await loadSessionsCatalog('fr');
    const t = sessionsTextOf('fr');
    expect(sessionTitle(session({ deviceName: 'Pixel de Awa' }), t)).toBe('Pixel de Awa');
    expect(sessionTitle(session(), t)).toBe('Google Pixel 7');
    expect(sessionTitle(session({ deviceVendor: null, deviceModel: null }), t)).toBe('Chrome WebView · Android');
    expect(sessionTitle(session({ deviceVendor: null, deviceModel: null, browserName: null, osName: null }), t)).toBe('Appareil inconnu');
  });
});

describe('orderedSessions', () => {
  test('la courante en tête, puis la plus récemment active', () => {
    const order = orderedSessions([
      session({ id: 'vieille', lastActivityAt: '2026-09-01T00:00:00.000Z' }),
      session({ id: 'recente', lastActivityAt: '2026-10-08T00:00:00.000Z' }),
      session({ id: 'courante', isCurrent: true, lastActivityAt: '2026-08-01T00:00:00.000Z' }),
    ]).map((s) => s.id);
    expect(order).toEqual(['courante', 'recente', 'vieille']);
  });
});

describe('withoutSessions — l’effet immédiat d’une fermeture', () => {
  test('retire les sessions nommées, garde l’attribution', () => {
    const before: ActiveSessions = { sessions: [session({ id: 'a' }), session({ id: 'b' })], geolocation: null };
    expect(withoutSessions(before, (s) => s.id === 'a')).toEqual({ sessions: [session({ id: 'b' })], geolocation: null });
  });

  test('une charge absente reste absente', () => {
    expect(withoutSessions(undefined, () => true)).toBeUndefined();
  });
});
