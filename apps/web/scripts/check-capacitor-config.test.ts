import { describe, expect, test } from 'bun:test';

import {
  androidShellPlugins,
  auditAndroidShellLinks,
  auditHookDeclaration,
  auditWebViewFloor,
  auditSyncedPlugins,
  capacitorPluginsImportedBy,
  judgeStartPathReplay,
} from './check-capacitor-config.mjs';

/**
 * `scripts/check-capacitor-config.mjs` — LE GATE QUI PROUVE QUE LA FORME iOS
 * EST ARMÉE, PAS SEULEMENT ACCEPTÉE (#6027).
 *
 * `judgeStartPathReplay` et `auditHookDeclaration` sont PURES — elles jugent
 * un résultat déjà obtenu (un `spawnSync` réel, ou `cap config --json` déjà
 * parsé), jamais un appel réseau ou disque elles-mêmes. Le pilote (rejeu réel
 * de `bunx cap config --json`, mkdtemp + rejeu du hook) n'est testé qu'en
 * l'exécutant (`node scripts/check-capacitor-config.mjs`), même discipline
 * que `build-shells.mjs`.
 */
describe('judgeStartPathReplay — juge un rejeu de `cap config --json` déjà obtenu', () => {
  test('android, RC 0, appStartPath résolu -> aucune violation', () => {
    const result = {
      status: 0,
      stdout: JSON.stringify({ app: { extConfig: { server: { appStartPath: '/c/c-deploiement' } } } }),
      stderr: '',
    };
    expect(judgeStartPathReplay('android', result)).toEqual([]);
  });

  test('android, RC ≠ 0 -> violation (Bridge.java réécrit toujours appStartPath, aucun refus légitime)', () => {
    const result = { status: 1, stdout: '', stderr: 'boom' };
    expect(judgeStartPathReplay('android', result).length).toBeGreaterThan(0);
  });

  test('android, RC 0 mais SANS appStartPath -> violation (MEESHY_SHELL_START_PATH pas résolu)', () => {
    const result = { status: 0, stdout: JSON.stringify({ app: { extConfig: { server: {} } } }), stderr: '' };
    expect(judgeStartPathReplay('android', result).length).toBeGreaterThan(0);
  });

  test('ios, RC 0, appStartPath résolu -> aucune violation (la forme "sert")', () => {
    const result = {
      status: 0,
      stdout: JSON.stringify({ app: { extConfig: { server: { appStartPath: '/c/c-deploiement' } } } }),
      stderr: '',
    };
    expect(judgeStartPathReplay('ios', result)).toEqual([]);
  });

  test('ios, RC ≠ 0, cause nommée (CAPBridgeViewController) -> aucune violation (le refus motivé reste admis)', () => {
    const result = { status: 1, stdout: '', stderr: 'Error: … CAPBridgeViewController.loadWebView() exige …' };
    expect(judgeStartPathReplay('ios', result)).toEqual([]);
  });

  test('ios, RC ≠ 0, SANS nommer la cause -> violation (un refus muet n’est jamais recevable)', () => {
    const result = { status: 1, stdout: '', stderr: 'quelque chose a échoué' };
    expect(judgeStartPathReplay('ios', result).length).toBeGreaterThan(0);
  });

  test('stdout non-JSON avec RC 0 -> violation, jamais une exception qui ferait planter le gate', () => {
    const result = { status: 0, stdout: 'pas du json', stderr: '' };
    expect(() => judgeStartPathReplay('ios', result)).not.toThrow();
    expect(judgeStartPathReplay('ios', result).length).toBeGreaterThan(0);
  });
});

describe('auditHookDeclaration — les quatre clés de package.json + le dossier natif visé', () => {
  const scripts = {
    'capacitor:copy:before': 'node scripts/shell-start-path-hook.mjs before',
    'capacitor:copy:after': 'node scripts/shell-start-path-hook.mjs after',
    'capacitor:sync:before': 'node scripts/shell-start-path-hook.mjs before',
    'capacitor:sync:after': 'node scripts/shell-start-path-hook.mjs after',
  };
  const capConfig = { ios: { webDir: 'App/App/public' } };

  test('les quatre clés déclarées avec la bonne phase, ios.webDir correct -> aucune violation', () => {
    expect(auditHookDeclaration({ scripts }, capConfig)).toEqual([]);
  });

  test('une clé MANQUANTE est NOMMÉE dans la violation', () => {
    const { 'capacitor:sync:after': _drop, ...rest } = scripts;
    const violations = auditHookDeclaration({ scripts: rest }, capConfig);
    expect(violations.some((v) => v.includes('capacitor:sync:after'))).toBe(true);
  });

  test('un autre script (ou la mauvaise phase) sous une clé attendue -> violation', () => {
    const violations = auditHookDeclaration(
      { scripts: { ...scripts, 'capacitor:copy:after': 'node scripts/shell-start-path-hook.mjs before' } },
      capConfig,
    );
    expect(violations.some((v) => v.includes('capacitor:copy:after'))).toBe(true);
  });

  test('ios.webDir ≠ "App/App/public" -> violation nommant le dossier natif visé', () => {
    const violations = auditHookDeclaration({ scripts }, { ios: { webDir: 'App/wrong/public' } });
    expect(violations.some((v) => v.includes('webDir'))).toBe(true);
  });
});

/**
 * #8090 — `cap sync` ne synchronise que `dependencies` et `devDependencies`
 * (`@capacitor/cli` 8.5.1, `dist/plugin.js` § `getDependencies`). Un plugin
 * importé par `src/` mais rangé en `optionalDependencies` n'entre jamais dans
 * l'APK : `Capacitor.isPluginAvailable()` rend faux, en silence.
 */
describe('capacitorPluginsImportedBy — les plugins Capacitor que le code importe', () => {
  test('retient les paquets @capacitor/* hors du cœur, de la CLI et des plateformes', () => {
    const sources = [
      "import { PushNotifications } from '@capacitor/push-notifications';",
      "const m = await import('@capacitor/push-notifications');",
      "import { Capacitor } from '@capacitor/core';",
      "import type { CapacitorConfig } from '@capacitor/cli';",
    ];
    expect(capacitorPluginsImportedBy(sources)).toEqual(['@capacitor/push-notifications']);
  });

  test('aucun import de plugin -> liste vide', () => {
    expect(capacitorPluginsImportedBy(["import { h } from 'preact';"])).toEqual([]);
  });
});

describe('auditSyncedPlugins — un plugin importé doit être synchronisé par cap sync', () => {
  test('plugin en optionalDependencies -> violation qui nomme le plugin', () => {
    const packageJson = { optionalDependencies: { '@capacitor/push-notifications': '8.1.2' } };
    const violations = auditSyncedPlugins(packageJson, ['@capacitor/push-notifications']);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('@capacitor/push-notifications');
  });

  test('plugin en dependencies -> aucune violation', () => {
    const packageJson = { dependencies: { '@capacitor/push-notifications': '8.1.2' } };
    expect(auditSyncedPlugins(packageJson, ['@capacitor/push-notifications'])).toEqual([]);
  });

  test('plugin en devDependencies -> aucune violation (cap sync les lit aussi)', () => {
    const packageJson = { devDependencies: { '@capacitor/push-notifications': '8.1.2' } };
    expect(auditSyncedPlugins(packageJson, ['@capacitor/push-notifications'])).toEqual([]);
  });

  test('le package.json réel synchronise tous les plugins importés par src/', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('..', import.meta.url).pathname;
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.(ts|tsx)$/.test(name) ? [readFileSync(path, 'utf8')] : [];
      });
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(auditSyncedPlugins(packageJson, capacitorPluginsImportedBy(walk(join(root, 'src'))))).toEqual([]);
  });
});

describe('auditWebViewFloor — la coque exige sa WebView minimale (#11325)', () => {
  const floorSource = "export const MIN_ANDROID_WEBVIEW_MAJOR = 111;\nexport const WEBVIEW_UPDATE_PAGE = 'webview-update.html';";
  const healthy = {
    capConfig: { android: { minWebViewVersion: 111 }, server: { errorPath: 'webview-update.html' } },
    floorSource,
    publicFiles: ['config.js', 'webview-update.html'],
    mainSource: 'if (__SHELL__) redirectBelowWebViewFloor({ userAgent, replace });',
  };

  test('config, page et contrôle au démarrage présents -> aucune violation', () => {
    expect(auditWebViewFloor(healthy)).toEqual([]);
  });

  test('chaque pièce manquante est nommée', () => {
    expect(auditWebViewFloor({ ...healthy, capConfig: { server: { errorPath: 'webview-update.html' } } })).toHaveLength(1);
    expect(auditWebViewFloor({ ...healthy, capConfig: { android: { minWebViewVersion: 100 }, server: { errorPath: 'webview-update.html' } } })[0]).toContain('minWebViewVersion');
    expect(auditWebViewFloor({ ...healthy, capConfig: { android: { minWebViewVersion: 111 } } })[0]).toContain('errorPath');
    expect(auditWebViewFloor({ ...healthy, publicFiles: ['config.js'] })[0]).toContain('public/webview-update.html');
    expect(auditWebViewFloor({ ...healthy, mainSource: '' })[0]).toContain('main.tsx');
  });

  test('un plancher sous le minimum de Capacitor (55) est refusé', () => {
    const low = { ...healthy, floorSource: floorSource.replace('111', '50'), capConfig: { android: { minWebViewVersion: 50 }, server: { errorPath: 'webview-update.html' } } };
    expect(auditWebViewFloor(low)[0]).toContain('≥ 55');
  });
});

/**
 * #11229 — un plugin SANS import dans `src/` (le pilote Haptics le lit comme
 * la coque le DÉCLARE, par `PluginHeaders`) échappe au gate #8090 : la
 * dépendance est posée, la coque ne la lie pas, et l'appui long vibre au
 * navigateur sans que rien ne rougisse. Les deux fichiers gradle que `cap
 * sync` génère sont SUIVIS : ils doivent lier chaque plugin Android déclaré.
 */
describe('androidShellPlugins — les dépendances qui portent un module Android', () => {
  test('retient un paquet dont le manifeste déclare capacitor.android, ignore le reste', () => {
    const manifests: Readonly<Record<string, unknown>> = {
      '@capacitor/haptics': { capacitor: { android: { src: 'android' } } },
      '@capacitor/core': {},
      preact: {},
    };
    const packageJson = { dependencies: { '@capacitor/haptics': '8.0.2', '@capacitor/core': '8.5.1', preact: '10' } };
    expect(androidShellPlugins(packageJson, (name: string) => manifests[name])).toEqual(['@capacitor/haptics']);
  });

  test('un manifeste illisible ne fait pas un plugin', () => {
    expect(androidShellPlugins({ dependencies: { x: '1' } }, () => undefined)).toEqual([]);
  });
});

describe('auditAndroidShellLinks — la coque Android lie chaque plugin déclaré', () => {
  const settingsGradle = "include ':capacitor-haptics'\nproject(':capacitor-haptics').projectDir = new File('x')";
  const buildGradle = "dependencies {\n    implementation project(':capacitor-haptics')\n}";

  test('inclus ET implémenté -> aucune violation', () => {
    expect(auditAndroidShellLinks({ plugins: ['@capacitor/haptics'], settingsGradle, buildGradle })).toEqual([]);
  });

  test('absent de capacitor.settings.gradle -> violation qui nomme le plugin et le fichier', () => {
    const violations = auditAndroidShellLinks({ plugins: ['@capacitor/haptics'], settingsGradle: '', buildGradle });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('@capacitor/haptics');
    expect(violations[0]).toContain('capacitor.settings.gradle');
  });

  test('absent de app/capacitor.build.gradle -> violation qui nomme le fichier', () => {
    const violations = auditAndroidShellLinks({ plugins: ['@capacitor-community/media'], settingsGradle: "include ':capacitor-community-media'", buildGradle: '' });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('capacitor.build.gradle');
  });

  test('la coque suivie lie tous les plugins Android de package.json (Haptics compris)', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('..', import.meta.url).pathname;
    const manifestOf = (name: string): unknown => {
      const path = join(root, 'node_modules', name, 'package.json');
      return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
    };
    const plugins = androidShellPlugins(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), manifestOf);
    expect(plugins).toContain('@capacitor/haptics');
    expect(
      auditAndroidShellLinks({
        plugins,
        settingsGradle: readFileSync(join(root, 'android/capacitor.settings.gradle'), 'utf8'),
        buildGradle: readFileSync(join(root, 'android/app/capacitor.build.gradle'), 'utf8'),
      }),
    ).toEqual([]);
  });
});
