import { describe, expect, test } from 'bun:test';

import {
  APP_SESSION_IDLE_MS,
  createAppSession,
  deviceClassOf,
  networkOf,
  osOf,
  platformOf,
  socialEventsContext,
  visitorContextOf,
  type SocialEventsContext,
} from './social-events-context';

/**
 * L'ENVELOPPE DE LOT DES ÉVÉNEMENTS SOCIAUX v2 (#10500) — ce que le web dit
 * de lui-même, une fois par requête, sans jamais rien qui l'identifie.
 */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

describe('createAppSession — la session d’application', () => {
  test('stable tant que l’activité continue, renouvelée après 30 min d’inactivité', () => {
    let now = 1_000_000;
    let n = 0;
    const session = createAppSession({ storage: memoryStorage(), now: () => now, uuid: () => `s${(n += 1)}` });
    const first = session.current();
    now += APP_SESSION_IDLE_MS - 1;
    expect(session.current()).toBe(first);
    now += APP_SESSION_IDLE_MS - 1;
    expect(session.current()).toBe(first);
    now += APP_SESSION_IDLE_MS + 1;
    expect(session.current()).not.toBe(first);
  });

  test('vit dans le stockage de SESSION qu’on lui donne, jamais ailleurs', () => {
    const storage = memoryStorage();
    const session = createAppSession({ storage, now: () => 0, uuid: () => 'abc' });
    session.current();
    expect(storage.keys()).toEqual(['meeshy.telemetry.appSession']);
  });

  test('sans stockage (navigation privée stricte), une session en mémoire', () => {
    const session = createAppSession({ storage: null, now: () => 0, uuid: () => 'abc' });
    expect(session.current()).toBe('abc');
    expect(session.current()).toBe('abc');
  });
});

describe('les champs du contexte', () => {
  test('platform : coque Android, PWA installée ou navigateur', () => {
    expect(platformOf({ shellPlatform: 'android', standalone: false })).toBe('android_shell');
    expect(platformOf({ shellPlatform: 'web', standalone: true })).toBe('pwa');
    expect(platformOf({ shellPlatform: undefined, standalone: false })).toBe('web');
  });

  test('os : majeure.mineure seulement, jamais le build', () => {
    expect(osOf('Mozilla/5.0 (Linux; Android 14.1.2; Pixel 8) AppleWebKit')).toEqual({ name: 'android', version: '14.1' });
    expect(osOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)')).toEqual({ name: 'ios', version: '17.4' });
    expect(osOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toEqual({ name: 'macos', version: '10.15' });
    expect(osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual({ name: 'windows', version: '10.0' });
    expect(osOf('Mozilla/5.0 (X11; Linux x86_64)')).toEqual({ name: 'linux' });
    expect(osOf('')).toEqual({ name: 'other' });
  });

  test('deviceClass : la classe, jamais le modèle', () => {
    expect(deviceClassOf({ shortSide: 390, coarse: true })).toBe('phone');
    expect(deviceClassOf({ shortSide: 820, coarse: true })).toBe('tablet');
    expect(deviceClassOf({ shortSide: 900, coarse: false })).toBe('desktop');
  });

  test('network : navigator.connection quand il existe, hors ligne sinon inconnu', () => {
    expect(networkOf({ onLine: false, connection: undefined })).toEqual({ type: 'offline' });
    expect(networkOf({ onLine: true, connection: undefined })).toEqual({ type: 'unknown' });
    expect(networkOf({ onLine: true, connection: { type: 'wifi', effectiveType: '4g' } })).toEqual({ type: 'wifi' });
    expect(networkOf({ onLine: true, connection: { type: 'cellular', effectiveType: 'slow-2g' } })).toEqual({ type: 'cellular', subtype: '2g' });
    expect(networkOf({ onLine: true, connection: { effectiveType: '3g' } })).toEqual({ type: 'unknown', subtype: '3g' });
  });
});

const BASE = {
  appSessionId: 'sess-1',
  platform: 'web' as const,
  appVersion: '2.13.0',
  os: { name: 'android', version: '14.1' },
  deviceClass: 'phone' as const,
  network: { type: 'wifi' as const },
  uiLanguage: 'fr',
  deviceLocale: 'en-US',
  consent: 'unknown' as const,
  capabilities: ['scroll', 'playback_qoe'] as const,
  sampling: { scroll: 1, playback: 1, visibility: 1 },
};

describe('socialEventsContext — un objet par requête', () => {
  test('schemaVersion 2 et l’heure d’envoi', () => {
    const context = socialEventsContext(BASE, () => Date.parse('2026-10-13T10:00:00.000Z'));
    expect(context.schemaVersion).toBe(2);
    expect(context.sentAt).toBe('2026-10-13T10:00:00.000Z');
  });

  test('le navigateur ne déclare JAMAIS savoir détecter une capture d’écran', () => {
    const context = socialEventsContext({ ...BASE, capabilities: ['scroll', 'screenshot', 'screen_recording', 'playback_qoe'] }, () => 0);
    expect(context.capabilities).not.toContain('screenshot');
    expect(context.capabilities).not.toContain('screen_recording');
  });

  test('la coque Android déclare ce que sa version détecte', () => {
    const context = socialEventsContext({ ...BASE, platform: 'android_shell', capabilities: ['scroll', 'screenshot'] }, () => 0);
    expect(context.capabilities).toContain('screenshot');
  });

  test('un VISITEUR ne porte que plateforme et langue d’interface : ni session, ni OS, ni réseau, ni locale (O2, R4)', () => {
    const full: SocialEventsContext = socialEventsContext(BASE, () => 0);
    const visitor = visitorContextOf(full);
    expect(Object.keys(visitor).sort()).toEqual(['capabilities', 'platform', 'sampling', 'schemaVersion', 'sentAt', 'uiLanguage']);
    expect(visitor.platform).toBe('web');
    expect(visitor.uiLanguage).toBe('fr');
  });
});
