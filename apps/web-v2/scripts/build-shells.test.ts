import { describe, expect, test } from 'bun:test';

import {
  auditShellBundle,
  auditSyncedShellConfig,
  REFERENCE_IOS_SIMULATOR_UDID,
  resolveShellBuildEnv,
  resolveShellSimulatorUdid,
  SHELL_IOS_SIMULATOR_UDID,
} from './build-shells.mjs';

/**
 * UNE COMMANDE UNIQUE CONSTRUIT LES DEUX COQUES CONTRE UNE PASSERELLE RÉELLE
 * (#5815). Ces témoins gardent les trois fonctions PURES du pilote — le
 * pilote lui-même (`spawnSync` réel de `bunx vite build`, `bunx cap sync`,
 * gradle/xcodebuild) n'est pas testé en bun, même discipline que
 * `check-shell-dist.mjs`.
 */
describe('resolveShellBuildEnv — refuse AVANT tout coût', () => {
  test('exige VITE_API_BASE ABSOLUE — la coque ne résout pas une base relative', () => {
    expect(() => resolveShellBuildEnv({})).toThrow(/VITE_API_BASE/);
    expect(() => resolveShellBuildEnv({ VITE_API_BASE: '/api/v1' })).toThrow(/ABSOLUE/);
    expect(() =>
      resolveShellBuildEnv({ VITE_API_BASE: 'gate.staging.meeshy.me', VITE_DATA_SOURCE: 'gateway' }),
    ).toThrow(/ABSOLUE/);
  });

  test('une base absolue + VITE_DATA_SOURCE=gateway passe', () => {
    const resolved = resolveShellBuildEnv({
      VITE_API_BASE: 'https://gate.staging.meeshy.me',
      VITE_DATA_SOURCE: 'gateway',
    });
    expect(resolved).toEqual({
      apiBase: 'https://gate.staging.meeshy.me',
      dataSource: 'gateway',
      target: 'both',
    });
  });

  test('une base absolue avec /api/v1 surnuméraire ou une barre finale est normalisée', () => {
    expect(
      resolveShellBuildEnv({
        VITE_API_BASE: 'https://gate.staging.meeshy.me/api/v1/',
        VITE_DATA_SOURCE: 'gateway',
      }).apiBase,
    ).toBe('https://gate.staging.meeshy.me');
  });

  test('exige VITE_DATA_SOURCE=gateway — une coque de recette sur fixtures montrerait Kwame et Amina', () => {
    expect(() =>
      resolveShellBuildEnv({ VITE_API_BASE: 'https://gate.staging.meeshy.me' }),
    ).toThrow(/Amina|Kwame|Fatou/);
    expect(() =>
      resolveShellBuildEnv({ VITE_API_BASE: 'https://gate.staging.meeshy.me', VITE_DATA_SOURCE: 'fixtures' }),
    ).toThrow(/Amina|Kwame|Fatou/);
    expect(() =>
      resolveShellBuildEnv({ VITE_API_BASE: 'https://gate.staging.meeshy.me', VITE_DATA_SOURCE: 'gatway' }),
    ).toThrow(/gateway/);
  });

  test('MEESHY_SHELL_START_PATH posé ⇒ refus : une coque LIVRÉE ne porte jamais un chemin de recette', () => {
    expect(() =>
      resolveShellBuildEnv({
        VITE_API_BASE: 'https://gate.staging.meeshy.me',
        VITE_DATA_SOURCE: 'gateway',
        MEESHY_SHELL_START_PATH: '/c/c-deploiement',
      }),
    ).toThrow(/MEESHY_SHELL_START_PATH/);
  });

  test('une cible connue (android, ios, both) passe ; une cible inconnue est refusée', () => {
    const base = { VITE_API_BASE: 'https://gate.staging.meeshy.me', VITE_DATA_SOURCE: 'gateway' } as const;
    expect(resolveShellBuildEnv({ ...base, target: 'android' }).target).toBe('android');
    expect(resolveShellBuildEnv({ ...base, target: 'ios' }).target).toBe('ios');
    expect(() => resolveShellBuildEnv({ ...base, target: 'web' })).toThrow(/target/);
  });
});

describe('auditSyncedShellConfig — ferme M1 (fuite mesurée le 2026-09-09)', () => {
  const JSON_ANDROID_AVEC_FUITE = JSON.stringify({
    appId: 'me.meeshy.app',
    appName: 'Meeshy',
    webDir: 'dist',
    android: { backgroundColor: '#0b0c14' },
    ios: { backgroundColor: '#0b0c14', contentInset: 'never' },
    server: { androidScheme: 'https', appStartPath: '/c/c-deploiement' },
  });

  const JSON_IOS_PROPRE = JSON.stringify({
    appId: 'me.meeshy.app',
    appName: 'Meeshy',
    webDir: 'dist',
    android: { backgroundColor: '#0b0c14' },
    ios: { backgroundColor: '#0b0c14', contentInset: 'never' },
    server: { androidScheme: 'https' },
    packageClassList: [],
  });

  test('un capacitor.config.json synchronisé avec appStartPath est REFUSÉ', () => {
    const violations = auditSyncedShellConfig(JSON_ANDROID_AVEC_FUITE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('appStartPath'))).toBe(true);
  });

  test('un capacitor.config.json synchronisé SANS appStartPath ne porte aucune violation', () => {
    expect(auditSyncedShellConfig(JSON_IOS_PROPRE)).toEqual([]);
  });

  test('appId et androidScheme sont ceux du contrat', () => {
    const mauvaisAppId = JSON.parse(JSON_IOS_PROPRE);
    mauvaisAppId.appId = 'com.example.other';
    expect(auditSyncedShellConfig(JSON.stringify(mauvaisAppId)).some((v) => v.includes('appId'))).toBe(true);

    const mauvaisScheme = JSON.parse(JSON_IOS_PROPRE);
    mauvaisScheme.server.androidScheme = 'http';
    expect(
      auditSyncedShellConfig(JSON.stringify(mauvaisScheme)).some((v) => v.includes('androidScheme')),
    ).toBe(true);
  });

  test('un JSON illisible rend une violation plutôt que de lever', () => {
    const violations = auditSyncedShellConfig('{ pas du json');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('illisible');
  });
});

describe('auditShellBundle — ferme M2 (comparaison de soi à soi, leçon 554)', () => {
  const API_BASE = 'https://gate.staging.meeshy.me';

  test('aucun marqueur de fixture dans les fichiers embarqués', () => {
    const files = [
      { path: 'assets/index-abc.js', text: `console.log("${API_BASE}")` },
      { path: 'assets/core-def.js', text: 'export const x = 1;' },
    ];
    expect(auditShellBundle(files, { apiBase: API_BASE })).toEqual([]);
  });

  test('un fichier portant "Kwame" (une fixture) fait ROUGIR, nommant le fichier', () => {
    const files = [
      { path: 'assets/index-abc.js', text: `console.log("${API_BASE}")` },
      { path: 'assets/core-def.js', text: 'const conv = { title: "Kwame Mensah" };' },
    ];
    const violations = auditShellBundle(files, { apiBase: API_BASE });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('Kwame') && v.includes('assets/core-def.js'))).toBe(true);
  });

  test('la base d’API absolue demandée est bien celle qui a été inlinée', () => {
    const sansBase = [{ path: 'assets/index-abc.js', text: 'export const x = 1;' }];
    const violationsSansBase = auditShellBundle(sansBase, { apiBase: API_BASE });
    expect(violationsSansBase.some((v) => v.includes('VITE_API_BASE'))).toBe(true);

    const avecBase = [{ path: 'assets/index-abc.js', text: `const b="${API_BASE}";` }];
    expect(auditShellBundle(avecBase, { apiBase: API_BASE })).toEqual([]);
  });
});

describe('la coque n’atterrit JAMAIS sur le simulateur de référence (leçon 554)', () => {
  test('sans surcharge, c’est le simulateur DÉDIÉ à la coque', () => {
    expect(resolveShellSimulatorUdid({})).toBe(SHELL_IOS_SIMULATOR_UDID);
    expect(SHELL_IOS_SIMULATOR_UDID).toBe('54438823-4ADC-4536-88D2-FC441395FA04');
  });

  test('une surcharge quelconque passe — c’est un paramètre de recette', () => {
    expect(resolveShellSimulatorUdid({ MEESHY_SHELL_IOS_UDID: 'AAAA-BBBB' })).toBe('AAAA-BBBB');
  });

  test('la surcharge qui NOMME le simulateur de référence est REFUSÉE', () => {
    expect(REFERENCE_IOS_SIMULATOR_UDID).toBe('3E761BC1-845D-49D2-8E4D-E0606E04D3E2');
    expect(() =>
      resolveShellSimulatorUdid({ MEESHY_SHELL_IOS_UDID: REFERENCE_IOS_SIMULATOR_UDID }),
    ).toThrow(/RÉFÉRENCE/);
  });
});
