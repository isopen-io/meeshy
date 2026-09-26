import { describe, expect, test } from 'bun:test';

import {
  auditHookDeclaration,
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
