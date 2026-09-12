import { describe, expect, test } from 'bun:test';

import { auditHookDeclaration, judgeStartPathReplay } from './check-capacitor-config.mjs';

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
