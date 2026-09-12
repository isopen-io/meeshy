import { describe, expect, test } from 'bun:test';

import { applyStartPathPlan, IOS_NATIVE_WEB_DIR, planStartPathHook } from './shell-start-path-hook.mjs';

/**
 * `scripts/shell-start-path-hook.mjs` — LE MÉCANISME QUI ARME iOS (#6027).
 *
 * `resolveCapacitorConfig` (`capacitor.config.ts`) ne lève plus pour iOS
 * (inversion de la garde #5774) : elle pose `server.appStartPath` pour les
 * DEUX cibles. Ce hook est ce qui rend cette pose EXPLOITABLE côté iOS —
 * `CAPBridgeViewController.loadWebView()` (`@capacitor/ios` 8.5.1) exige
 * qu'un FICHIER existe littéralement sous `public/` avant même d'atteindre
 * `Router.swift` (dont le repli SPA ne s'applique qu'aux navigations qui
 * suivent ce premier chargement). Android n'a besoin de rien : `Bridge.java`
 * (`appUrl += appUrlPath`) réécrit déjà `appStartPath` correctement.
 *
 * La CLI Capacitor (`@capacitor/cli/dist/common.js::runPlatformHook`) invoque
 * ce script en lui fournissant, dans son environnement, EXACTEMENT :
 *   - `CAPACITOR_CONFIG`  : `JSON.stringify(config.app.extConfig)` — le MÊME
 *     objet que `resolveCapacitorConfig` a résolu, jamais une seconde lecture ;
 *   - `CAPACITOR_PLATFORM_NAME` : la plateforme RÉELLEMENT synchronisée
 *     (`"android"` ou `"ios"`, jamais devinée) ;
 *   - `CAPACITOR_ROOT_DIR` : la racine du paquet (`config.app.rootDir`).
 * `MEESHY_SHELL_SYNC_TARGET` vient, lui, du process de l'appelant (spread
 * `...process.env` en dernier dans `runPlatformHook`).
 *
 * `planStartPathHook` est PURE — aucune écriture, elle rend un type SOMME
 * (`skip` | `place`) ou lève. `applyStartPathPlan` prend ce plan et un `fs`
 * INJECTÉ (jamais `node:fs` en dur) pour rester falsifiable sans toucher au
 * disque.
 */
describe('planStartPathHook — la validation, PURE, jamais une écriture', () => {
  test('sans MEESHY_SHELL_START_PATH -> skip : un cap sync/copy normal n’exige pas la variable', () => {
    const plan = planStartPathHook({}, 'before');
    expect(plan.action).toBe('skip');
  });

  test('CAPACITOR_CONFIG sans server.appStartPath -> skip, même avec d’autres variables posées', () => {
    const plan = planStartPathHook(
      {
        CAPACITOR_CONFIG: JSON.stringify({ server: { androidScheme: 'https' } }),
        CAPACITOR_PLATFORM_NAME: 'ios',
      },
      'after',
    );
    expect(plan.action).toBe('skip');
  });

  test('SYNC_TARGET="ios" mais plateforme réellement synchronisée "android" -> lève, nommant les DEUX', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/c-deploiement' } }),
      CAPACITOR_PLATFORM_NAME: 'android',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
    };
    expect(() => planStartPathHook(env, 'before')).toThrow(/android/);
    expect(() => planStartPathHook(env, 'before')).toThrow(/ios/);
  });

  test('SYNC_TARGET="android" mais plateforme réellement synchronisée "ios" -> lève, nommant les DEUX', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/c-deploiement' } }),
      CAPACITOR_PLATFORM_NAME: 'ios',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    };
    expect(() => planStartPathHook(env, 'before')).toThrow(/android/);
    expect(() => planStartPathHook(env, 'before')).toThrow(/ios/);
  });

  test('cible et plateforme ÉGALES (android) -> aucune levée, phase before/after toutes deux skip', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/c-deploiement' } }),
      CAPACITOR_PLATFORM_NAME: 'android',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    };
    expect(planStartPathHook(env, 'before').action).toBe('skip');
    expect(planStartPathHook(env, 'after').action).toBe('skip');
  });

  test('Android -> TOUJOURS skip (Bridge.java réécrit déjà appStartPath, rien à poser)', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/settings' } }),
      CAPACITOR_PLATFORM_NAME: 'android',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    };
    const plan = planStartPathHook(env, 'after');
    expect(plan.action).toBe('skip');
    expect(typeof (plan as { reason?: unknown }).reason).toBe('string');
  });

  test('iOS, phase "before" -> skip (la validation est faite, le placement attend "after")', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/c-deploiement' } }),
      CAPACITOR_PLATFORM_NAME: 'ios',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
      CAPACITOR_ROOT_DIR: '/r',
    };
    expect(planStartPathHook(env, 'before').action).toBe('skip');
  });

  test('iOS, phase "after" -> place le chemin ATTENDU sous CAPACITOR_ROOT_DIR/ios/App/App/public', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/c-deploiement' } }),
      CAPACITOR_PLATFORM_NAME: 'ios',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
      CAPACITOR_ROOT_DIR: '/r',
    };
    const plan = planStartPathHook(env, 'after');
    expect(plan).toEqual({ action: 'place', filePath: '/r/ios/App/App/public/c/c-deploiement' });
  });

  test('une AUTRE surface que le fil (/settings) est portée à l’identique — la garde ne connaît aucune route', () => {
    const env = {
      CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/settings' } }),
      CAPACITOR_PLATFORM_NAME: 'ios',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
      CAPACITOR_ROOT_DIR: '/r',
    };
    expect(planStartPathHook(env, 'after')).toEqual({ action: 'place', filePath: '/r/ios/App/App/public/settings' });
  });

  test('CAPACITOR_CONFIG illisible (JSON invalide) -> lève', () => {
    const env = { CAPACITOR_CONFIG: '{ pas du json', CAPACITOR_PLATFORM_NAME: 'ios' };
    expect(() => planStartPathHook(env, 'before')).toThrow();
  });

  test('phase inconnue -> lève', () => {
    expect(() =>
      planStartPathHook(
        { CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/x' } }), CAPACITOR_PLATFORM_NAME: 'ios' },
        'pendant',
      ),
    ).toThrow(/phase/);
  });

  test('CAPACITOR_PLATFORM_NAME absent alors qu’un chemin est posé -> lève (la CLI ne l’a pas fourni)', () => {
    expect(() =>
      planStartPathHook({ CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/x' } }) }, 'before'),
    ).toThrow();
  });

  test('MEESHY_SHELL_SYNC_TARGET absent alors qu’un chemin est posé -> lève, nommant la variable', () => {
    expect(() =>
      planStartPathHook(
        {
          CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/x' } }),
          CAPACITOR_PLATFORM_NAME: 'ios',
        },
        'before',
      ),
    ).toThrow(/MEESHY_SHELL_SYNC_TARGET/);
  });

  test('MEESHY_SHELL_SYNC_TARGET invalide -> lève', () => {
    expect(() =>
      planStartPathHook(
        {
          CAPACITOR_CONFIG: JSON.stringify({ server: { appStartPath: '/c/x' } }),
          CAPACITOR_PLATFORM_NAME: 'ios',
          MEESHY_SHELL_SYNC_TARGET: 'windows',
        },
        'before',
      ),
    ).toThrow(/MEESHY_SHELL_SYNC_TARGET/);
  });

  test('IOS_NATIVE_WEB_DIR est exportée — un unique site de vérité pour le dossier natif iOS', () => {
    expect(IOS_NATIVE_WEB_DIR).toBe('ios/App/App/public');
  });
});

describe('applyStartPathPlan — l’écriture, injectée, jamais node:fs en dur', () => {
  function fakeFs(initial: ReadonlySet<string> = new Set()) {
    const existing = new Set(initial);
    const written: string[] = [];
    const dirsMade: string[] = [];
    return {
      fs: {
        existsSync: (p: string) => existing.has(p),
        mkdirSync: (p: string, _opts?: unknown) => {
          dirsMade.push(p);
        },
        writeFileSync: (p: string, _contents: string) => {
          written.push(p);
          existing.add(p);
        },
      },
      written,
      dirsMade,
    };
  }

  test('plan "skip" -> aucune écriture, placed: false', () => {
    const { fs, written } = fakeFs();
    const result = applyStartPathPlan({ action: 'skip', reason: 'x' }, fs);
    expect(result).toEqual({ placed: false });
    expect(written).toEqual([]);
  });

  test('plan "place" absent du disque -> mkdir récursif + fichier vide, placed: true', () => {
    const { fs, written, dirsMade } = fakeFs();
    const result = applyStartPathPlan({ action: 'place', filePath: '/r/ios/App/App/public/c/c-deploiement' }, fs);
    expect(result).toEqual({ placed: true });
    expect(written).toEqual(['/r/ios/App/App/public/c/c-deploiement']);
    expect(dirsMade).toEqual(['/r/ios/App/App/public/c']);
  });

  test('plan "place" DÉJÀ présent (fichier) -> aucune écriture', () => {
    const { fs, written } = fakeFs(new Set(['/r/ios/App/App/public/c/c-deploiement']));
    const result = applyStartPathPlan({ action: 'place', filePath: '/r/ios/App/App/public/c/c-deploiement' }, fs);
    expect(result).toEqual({ placed: false });
    expect(written).toEqual([]);
  });

  test('plan "place" DÉJÀ présent (dossier) -> aucune écriture — existsSync ne distingue pas', () => {
    const { fs, written } = fakeFs(new Set(['/r/ios/App/App/public/c']));
    const result = applyStartPathPlan({ action: 'place', filePath: '/r/ios/App/App/public/c' }, fs);
    expect(result).toEqual({ placed: false });
    expect(written).toEqual([]);
  });

  test('l’écriture ne PREND pas (existsSync reste faux après) -> lève, nommant CAPBridgeViewController.loadWebView', () => {
    const fs = {
      existsSync: () => false,
      mkdirSync: () => undefined,
      writeFileSync: () => undefined,
    };
    expect(() =>
      applyStartPathPlan({ action: 'place', filePath: '/r/ios/App/App/public/c/c-deploiement' }, fs),
    ).toThrow(/CAPBridgeViewController\.loadWebView/);
  });
});
