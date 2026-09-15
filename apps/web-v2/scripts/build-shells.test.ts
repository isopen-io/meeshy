import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditAndroidVersionCodeForm,
  auditAndroidVersionName,
  auditBuiltApkVersion,
  auditBuiltIosAppVersion,
  auditCommittedBuildNumberFallback,
  auditIosInfoPlistVersionForm,
  auditIosMarketingVersion,
  auditShellBundle,
  auditSyncedShellConfig,
  deriveAndroidVersionName,
  deriveIosMarketingVersion,
  nativeBuildArgs,
  REFERENCE_IOS_SIMULATOR_UDID,
  resolveShellBuildEnv,
  resolveShellBuildNumber,
  resolveShellSimulatorUdid,
  resolveShellVersion,
  SHELL_IOS_SIMULATOR_UDID,
} from './build-shells.mjs';
import type { NativeBuildTarget } from './build-shells.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const REAL_GRADLE_PATH = join(APP, 'android/app/build.gradle');
const REAL_PBXPROJ_PATH = join(APP, 'ios/App/App.xcodeproj/project.pbxproj');
const REAL_PACKAGE_JSON_PATH = join(APP, 'package.json');
const REAL_INFO_PLIST_PATH = join(APP, 'ios/App/App/Info.plist');

/** Version voisine (bump de patch) — jamais la même, sinon la contre-épreuve
 * ne prouve rien (une chaîne comparée à elle-même est toujours égale). */
function bumpPatch(version: string): string {
  const parts = version.split('.');
  const last = Number(parts[parts.length - 1]);
  return [...parts.slice(0, -1), String(last + 1)].join('.');
}

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

describe('resolveShellVersion — la version des coques vient de package.json, jamais 1.0 en littéral (#6196)', () => {
  test('lit "version" depuis un package.json valide', () => {
    expect(resolveShellVersion(JSON.stringify({ name: 'web-v2', version: '2.0.0' }))).toBe('2.0.0');
  });

  test('un package.json illisible lève, en le nommant', () => {
    expect(() => resolveShellVersion('{ pas du json')).toThrow(/illisible/);
  });

  test('une "version" absente ou vide lève', () => {
    expect(() => resolveShellVersion(JSON.stringify({ name: 'web-v2' }))).toThrow(/version/);
    expect(() => resolveShellVersion(JSON.stringify({ version: '' }))).toThrow(/version/);
  });
});

describe('auditAndroidVersionName — ferme #6196 côté Android', () => {
  const GRADLE_AVEC_LITTERALE = [
    'android {',
    '    defaultConfig {',
    '        versionCode 1',
    '        versionName "1.0"',
    '    }',
    '}',
  ].join('\n');

  test('versionName divergent de package.json ROUGIT, nommant les deux valeurs', () => {
    const violations = auditAndroidVersionName(GRADLE_AVEC_LITTERALE, '2.0.0');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('1.0');
    expect(violations[0]).toContain('2.0.0');
  });

  test('versionName aligné sur package.json ne porte aucune violation (contre-épreuve)', () => {
    const gradleAligne = GRADLE_AVEC_LITTERALE.replace('"1.0"', '"2.0.0"');
    expect(auditAndroidVersionName(gradleAligne, '2.0.0')).toEqual([]);
  });

  test('un build.gradle sans "versionName" ROUGIT plutôt que de lever', () => {
    const violations = auditAndroidVersionName('android { defaultConfig { } }', '2.0.0');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('aucun');
  });
});

describe('deriveAndroidVersionName — dérive versionName de package.json (#6196)', () => {
  const GRADLE_AVEC_LITTERALE = 'defaultConfig {\n    versionCode 1\n    versionName "1.0"\n}';

  test('remplace la littérale par la version dérivée, sans toucher versionCode', () => {
    const derived = deriveAndroidVersionName(GRADLE_AVEC_LITTERALE, '2.0.0');
    expect(derived).toContain('versionName "2.0.0"');
    expect(derived).toContain('versionCode 1');
    expect(auditAndroidVersionName(derived, '2.0.0')).toEqual([]);
  });

  test('un build.gradle sans "versionName" lève — rien à dériver', () => {
    expect(() => deriveAndroidVersionName('defaultConfig { }', '2.0.0')).toThrow(/versionName/);
  });
});

describe('auditIosMarketingVersion — ferme #6196 côté iOS (Debug ET Release)', () => {
  const PBXPROJ_AVEC_LITTERALE = [
    '			97C146E61CF9000F007C117D /* Debug */ = {',
    '				buildSettings = {',
    '					CURRENT_PROJECT_VERSION = 1;',
    '					MARKETING_VERSION = 1.0;',
    '				};',
    '			};',
    '			97C146E71CF9000F007C117D /* Release */ = {',
    '				buildSettings = {',
    '					CURRENT_PROJECT_VERSION = 1;',
    '					MARKETING_VERSION = 1.0;',
    '				};',
    '			};',
  ].join('\n');

  test('les DEUX MARKETING_VERSION divergents de package.json ROUGISSENT', () => {
    const violations = auditIosMarketingVersion(PBXPROJ_AVEC_LITTERALE, '2.0.0');
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.includes('MARKETING_VERSION = 1.0') && v.includes('2.0.0'))).toBe(true);
  });

  test('un SEUL des deux alignés — l’autre configuration ROUGIT encore', () => {
    const uneSeuleAlignee = PBXPROJ_AVEC_LITTERALE.replace('MARKETING_VERSION = 1.0;', 'MARKETING_VERSION = 2.0.0;');
    expect(auditIosMarketingVersion(uneSeuleAlignee, '2.0.0')).toHaveLength(1);
  });

  test('les deux configurations alignées ne portent aucune violation (contre-épreuve)', () => {
    const pbxprojAligne = PBXPROJ_AVEC_LITTERALE.replaceAll('MARKETING_VERSION = 1.0;', 'MARKETING_VERSION = 2.0.0;');
    expect(auditIosMarketingVersion(pbxprojAligne, '2.0.0')).toEqual([]);
  });

  test('un project.pbxproj sans "MARKETING_VERSION" ROUGIT plutôt que de lever', () => {
    const violations = auditIosMarketingVersion('buildSettings = { CURRENT_PROJECT_VERSION = 1; };', '2.0.0');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('aucun');
  });
});

describe('deriveIosMarketingVersion — dérive CHAQUE MARKETING_VERSION de package.json (#6196)', () => {
  const PBXPROJ_AVEC_LITTERALE = [
    'buildSettings = { CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0; };',
    'buildSettings = { CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0; };',
  ].join('\n');

  test('remplace les DEUX occurrences, sans toucher CURRENT_PROJECT_VERSION', () => {
    const derived = deriveIosMarketingVersion(PBXPROJ_AVEC_LITTERALE, '2.0.0');
    expect(derived.match(/MARKETING_VERSION = 2\.0\.0;/g)).toHaveLength(2);
    expect(derived.match(/CURRENT_PROJECT_VERSION = 1;/g)).toHaveLength(2);
    expect(auditIosMarketingVersion(derived, '2.0.0')).toEqual([]);
  });

  test('un project.pbxproj sans "MARKETING_VERSION" lève — rien à dériver', () => {
    expect(() =>
      deriveIosMarketingVersion('buildSettings = { CURRENT_PROJECT_VERSION = 1; };', '2.0.0'),
    ).toThrow(/MARKETING_VERSION/);
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

// ---------------------------------------------------------------------------
// Reste de #6196 (issue de suivi, decisions.md § D-45) — la garde sur des
// chaînes synthétiques prouve la RÈGLE ; celle-ci prouve que les fichiers
// RÉELS du dépôt l'observent, aujourd'hui, sur cette révision.
// ---------------------------------------------------------------------------

describe('les fichiers RÉELS du dépôt portent la version de package.json (#6196 — dimension 13)', () => {
  const version = resolveShellVersion(readFileSync(REAL_PACKAGE_JSON_PATH, 'utf8'));

  test('android/app/build.gradle : versionName ≡ package.json', () => {
    expect(auditAndroidVersionName(readFileSync(REAL_GRADLE_PATH, 'utf8'), version)).toEqual([]);
  });

  test('ios/App/App.xcodeproj/project.pbxproj : CHAQUE MARKETING_VERSION ≡ package.json', () => {
    expect(auditIosMarketingVersion(readFileSync(REAL_PBXPROJ_PATH, 'utf8'), version)).toEqual([]);
  });

  test('contre-épreuve : la même lecture, opposée à une version VOISINE, ROUGIT', () => {
    const voisine = bumpPatch(version);
    expect(auditAndroidVersionName(readFileSync(REAL_GRADLE_PATH, 'utf8'), voisine).length).toBeGreaterThan(0);
    expect(
      auditIosMarketingVersion(readFileSync(REAL_PBXPROJ_PATH, 'utf8'), voisine).length,
    ).toBeGreaterThan(0);
  });
});

describe('Info.plist RÉSOUT sa version, il ne la porte pas (miroir de BundleVersionVariableGuardTests, #6186)', () => {
  test('le plist RÉEL porte $(MARKETING_VERSION) et $(CURRENT_PROJECT_VERSION)', () => {
    expect(auditIosInfoPlistVersionForm(readFileSync(REAL_INFO_PLIST_PATH, 'utf8'))).toEqual([]);
  });

  test('une littérale sous CFBundleVersion ROUGIT en nommant la clé', () => {
    const plist = [
      '<key>CFBundleShortVersionString</key>',
      '<string>$(MARKETING_VERSION)</string>',
      '<key>CFBundleVersion</key>',
      '<string>1</string>',
    ].join('\n');
    const violations = auditIosInfoPlistVersionForm(plist);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('CFBundleVersion'))).toBe(true);
  });

  test('une littérale sous CFBundleShortVersionString ROUGIT en nommant la clé', () => {
    const plist = [
      '<key>CFBundleShortVersionString</key>',
      '<string>2.0.0</string>',
      '<key>CFBundleVersion</key>',
      '<string>$(CURRENT_PROJECT_VERSION)</string>',
    ].join('\n');
    const violations = auditIosInfoPlistVersionForm(plist);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('CFBundleShortVersionString'))).toBe(true);
  });

  test('une clé ABSENTE rougit aussi', () => {
    const plist = '<key>CFBundleShortVersionString</key>\n<string>$(MARKETING_VERSION)</string>';
    const violations = auditIosInfoPlistVersionForm(plist);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('CFBundleVersion'))).toBe(true);
  });
});

describe('resolveShellBuildNumber — UNE source, jamais deux (D-45)', () => {
  test('sans MEESHY_SHELL_BUILD_NUMBER, c’est le compte de commits de HEAD', () => {
    expect(resolveShellBuildNumber({ env: {}, commitCount: 20219, shallow: false })).toBe(20219);
  });

  test('MEESHY_SHELL_BUILD_NUMBER posé l’emporte', () => {
    expect(
      resolveShellBuildNumber({
        env: { MEESHY_SHELL_BUILD_NUMBER: '31' },
        commitCount: 20219,
        shallow: false,
      }),
    ).toBe(31);
  });

  test('une valeur non entière, nulle, négative ou vide est REFUSÉE', () => {
    for (const bad of ['abc', '0', '-3', '', '1.5']) {
      expect(() =>
        resolveShellBuildNumber({ env: { MEESHY_SHELL_BUILD_NUMBER: bad }, commitCount: 1, shallow: false }),
      ).toThrow(/MEESHY_SHELL_BUILD_NUMBER/);
    }
  });

  test('un dépôt SUPERFICIEL sans compteur explicite est REFUSÉ — 1 n’est pas un numéro, c’est une absence', () => {
    expect(() => resolveShellBuildNumber({ env: {}, commitCount: 1, shallow: true })).toThrow(
      /superficiel|shallow/i,
    );
    expect(
      resolveShellBuildNumber({ env: { MEESHY_SHELL_BUILD_NUMBER: '7' }, commitCount: 1, shallow: true }),
    ).toBe(7);
  });

  test('au-delà de 2 100 000 000 (plafond Android) c’est refusé', () => {
    expect(() =>
      resolveShellBuildNumber({ env: {}, commitCount: 2_100_000_001, shallow: false }),
    ).toThrow();
  });
});

/** La forme MESURÉE : celle que gradle accepte, et celle que porte le dépôt. */
const ANDROID_VERSION_CODE_GRADLE_JUSTE = [
  'defaultConfig {',
  "    versionCode = (project.findProperty('meeshyBuildNumber') ?: '1').toString().toInteger()",
  '    versionName "2.0.0"',
  '}',
].join('\n');

/**
 * Le PIÈGE, payé par une construction gradle en échec le 2026-09-12 :
 * `versionCode (expr).toInteger()` se parse comme `versionCode(expr).toInteger()`
 * — le setter reçoit la CHAÎNE et `.toInteger()` s'applique à son retour
 * (`IllegalArgumentException: Value is null`). Il porte pourtant le nom de la
 * propriété : une garde qui ne cherche que `meeshyBuildNumber` l'accepte.
 */
const ANDROID_VERSION_CODE_GRADLE_PIEGE = [
  'defaultConfig {',
  "    versionCode (project.findProperty('meeshyBuildNumber') ?: '1').toInteger()",
  '    versionName "2.0.0"',
  '}',
].join('\n');

describe('versionCode est une PROPRIÉTÉ lue à la construction, jamais une littérale', () => {
  test('le build.gradle RÉEL lit meeshyBuildNumber, en AFFECTATION', () => {
    expect(auditAndroidVersionCodeForm(readFileSync(REAL_GRADLE_PATH, 'utf8'))).toEqual([]);
  });

  test('versionCode 1 (littérale) ROUGIT', () => {
    const gradle = 'defaultConfig {\n    versionCode 1\n    versionName "2.0.0"\n}';
    const violations = auditAndroidVersionCodeForm(gradle);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('versionCode'))).toBe(true);
  });

  test('un build.gradle sans versionCode rougit plutôt que de lever', () => {
    const violations = auditAndroidVersionCodeForm('defaultConfig { versionName "2.0.0" }');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('aucun');
  });

  test('la forme lue par ce témoin passe elle-même l’audit (contre-épreuve du témoin)', () => {
    expect(auditAndroidVersionCodeForm(ANDROID_VERSION_CODE_GRADLE_JUSTE)).toEqual([]);
  });

  test('l’appel-méthode « versionCode (expr).toInteger() » ROUGIT — la panne MESURÉE, pas seulement le nom', () => {
    const violations = auditAndroidVersionCodeForm(ANDROID_VERSION_CODE_GRADLE_PIEGE);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('AFFECTATION'))).toBe(true);
  });

  test('un COMMENTAIRE qui parle de meeshyBuildNumber ne suffit PAS à contenter la garde', () => {
    const gradle = [
      'defaultConfig {',
      "    // versionCode est lu depuis project.findProperty('meeshyBuildNumber') — enfin, il devrait.",
      '    versionCode 1',
      '}',
    ].join('\n');
    const violations = auditAndroidVersionCodeForm(gradle);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('littérale'))).toBe(true);
  });

  test('et une URL (https://…) n’est PAS prise pour un commentaire', () => {
    const gradle = [
      'repositories { maven { url "https://example.test/m2" } }',
      'defaultConfig {',
      "    versionCode = (project.findProperty('meeshyBuildNumber') ?: '1').toString().toInteger()",
      '}',
    ].join('\n');
    expect(auditAndroidVersionCodeForm(gradle)).toEqual([]);
  });
});

describe('le REPLI commis annonce une ABSENCE (1), jamais un numéro (D-45)', () => {
  const gradleText = readFileSync(REAL_GRADLE_PATH, 'utf8');
  const pbxprojText = readFileSync(REAL_PBXPROJ_PATH, 'utf8');

  test('les deux fichiers RÉELS replient sur 1', () => {
    expect(auditCommittedBuildNumberFallback({ gradleText, pbxprojText })).toEqual([]);
  });

  test('un repli Android qui ressemble à un numéro ROUGIT', () => {
    const violations = auditCommittedBuildNumberFallback({
      gradleText: "versionCode = (project.findProperty('meeshyBuildNumber') ?: '4711').toString().toInteger()",
      pbxprojText,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('4711');
  });

  test('un CURRENT_PROJECT_VERSION commis autre que 1 ROUGIT, sur CHAQUE configuration', () => {
    const violations = auditCommittedBuildNumberFallback({
      gradleText,
      pbxprojText: 'CURRENT_PROJECT_VERSION = 4711;\nCURRENT_PROJECT_VERSION = 4711;',
    });
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('4711');
  });

  test('des fichiers MUETS rougissent plutôt que de passer', () => {
    expect(auditCommittedBuildNumberFallback({ gradleText: '', pbxprojText: '' })).toHaveLength(2);
  });
});

describe('auditAndroidVersionName ne se laisse pas contenter par un COMMENTAIRE non plus', () => {
  test('un commentaire portant la BONNE version au-dessus d’une littérale PÉRIMÉE rougit', () => {
    const gradle = [
      'defaultConfig {',
      '    // versionName "2.0.0" — dérivé de package.json',
      '    versionName "1.0"',
      '}',
    ].join('\n');
    const violations = auditAndroidVersionName(gradle, '2.0.0');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1.0');
  });
});

describe('nativeBuildArgs — le numéro de build VOYAGE jusqu’à gradle et xcodebuild', () => {
  test('android : assembleDebug avec -PmeeshyBuildNumber=<n>', () => {
    expect(nativeBuildArgs({ target: 'android', buildNumber: 31, version: '2.0.0' })).toEqual([
      'assembleDebug',
      '-PmeeshyBuildNumber=31',
    ]);
  });

  test('ios : porte CURRENT_PROJECT_VERSION, MARKETING_VERSION et la destination de la COQUE', () => {
    const args = nativeBuildArgs({
      target: 'ios',
      buildNumber: 31,
      version: '2.0.0',
      udid: SHELL_IOS_SIMULATOR_UDID,
    });
    expect(args).toContain('CURRENT_PROJECT_VERSION=31');
    expect(args).toContain('MARKETING_VERSION=2.0.0');
    expect(args).toContain('-destination');
    expect(args).toContain(`id=${SHELL_IOS_SIMULATOR_UDID}`);
  });

  /**
   * Une assertion `not.toContain(RÉFÉRENCE)` sur un appel qui n'a JAMAIS passé
   * l'UDID de référence est vraie par construction — elle ne peut pas tomber,
   * donc elle ne mesure rien (leçon : un vert des deux côtés mesure la
   * machine). La garde se prouve en PASSANT la mauvaise valeur.
   */
  test('ios : l’UDID de RÉFÉRENCE est REFUSÉ — la coque ne se construit jamais pour l’app native (leçon 554)', () => {
    expect(() =>
      nativeBuildArgs({
        target: 'ios',
        buildNumber: 31,
        version: '2.0.0',
        udid: REFERENCE_IOS_SIMULATOR_UDID,
      }),
    ).toThrow(/RÉFÉRENCE/);
  });

  /**
   * Le TYPE l'interdit déjà (`NativeBuildTarget` est une somme : `udid` est
   * obligatoire sur iOS). L'assertion de type prouve la garde d'EXÉCUTION —
   * celle que le pilote `.mjs`, qui n'est pas compilé, est seul à rencontrer.
   */
  test('ios : un udid absent ou vide est REFUSÉ, jamais composé en « id=undefined »', () => {
    for (const udid of [undefined, '', '   ']) {
      const mauvais = { target: 'ios', buildNumber: 31, version: '2.0.0', udid } as NativeBuildTarget;
      expect(() => nativeBuildArgs(mauvais)).toThrow(/udid/);
    }
  });

  test('android n’a pas besoin d’udid et n’en porte aucun', () => {
    const args = nativeBuildArgs({ target: 'android', buildNumber: 31, version: '2.0.0' });
    expect(args.join(' ')).not.toContain('destination');
  });
});

describe('auditBuiltApkVersion — l’APK construit porte ce que la construction a demandé', () => {
  const conforme = JSON.stringify({
    elements: [{ type: 'APK', versionCode: 31, versionName: '2.0.0' }],
  });

  test('output-metadata.json conforme → []', () => {
    expect(auditBuiltApkVersion(conforme, { version: '2.0.0', buildNumber: 31 })).toEqual([]);
  });

  test('versionName divergent, puis versionCode divergent : une violation chacun, nommant les deux valeurs', () => {
    const mauvaisNom = JSON.stringify({ elements: [{ type: 'APK', versionCode: 31, versionName: '1.0' }] });
    const v1 = auditBuiltApkVersion(mauvaisNom, { version: '2.0.0', buildNumber: 31 });
    expect(v1).toHaveLength(1);
    expect(v1[0]).toContain('1.0');
    expect(v1[0]).toContain('2.0.0');

    const mauvaisCode = JSON.stringify({ elements: [{ type: 'APK', versionCode: 1, versionName: '2.0.0' }] });
    const v2 = auditBuiltApkVersion(mauvaisCode, { version: '2.0.0', buildNumber: 31 });
    expect(v2).toHaveLength(1);
    expect(v2[0]).toContain('1');
    expect(v2[0]).toContain('31');
  });

  test('métadonnées illisibles ou sans élément → violation, jamais une levée', () => {
    expect(auditBuiltApkVersion('{ pas du json', { version: '2.0.0', buildNumber: 31 })).toHaveLength(1);
    expect(auditBuiltApkVersion(JSON.stringify({ elements: [] }), { version: '2.0.0', buildNumber: 31 })).toHaveLength(
      1,
    );
  });
});

describe('auditBuiltIosAppVersion — l’App.app construite porte ce que la construction a demandé', () => {
  const conforme = JSON.stringify({ CFBundleShortVersionString: '2.0.0', CFBundleVersion: '31' });

  test('Info.plist (JSON) conforme → []', () => {
    expect(auditBuiltIosAppVersion(conforme, { version: '2.0.0', buildNumber: 31 })).toEqual([]);
  });

  test('CFBundleShortVersionString divergent, puis CFBundleVersion divergent : une violation chacun', () => {
    const mauvaiseVersion = JSON.stringify({ CFBundleShortVersionString: '1.0', CFBundleVersion: '31' });
    const v1 = auditBuiltIosAppVersion(mauvaiseVersion, { version: '2.0.0', buildNumber: 31 });
    expect(v1).toHaveLength(1);
    expect(v1[0]).toContain('1.0');
    expect(v1[0]).toContain('2.0.0');

    const mauvaisBuild = JSON.stringify({ CFBundleShortVersionString: '2.0.0', CFBundleVersion: '1' });
    const v2 = auditBuiltIosAppVersion(mauvaisBuild, { version: '2.0.0', buildNumber: 31 });
    expect(v2).toHaveLength(1);
    expect(v2[0]).toContain('1');
    expect(v2[0]).toContain('31');
  });

  test('métadonnées illisibles ou incomplètes → violation, jamais une levée', () => {
    expect(auditBuiltIosAppVersion('{ pas du json', { version: '2.0.0', buildNumber: 31 })).toHaveLength(1);
    expect(
      auditBuiltIosAppVersion(JSON.stringify({ CFBundleShortVersionString: '2.0.0' }), {
        version: '2.0.0',
        buildNumber: 31,
      }),
    ).toHaveLength(1);
  });
});
