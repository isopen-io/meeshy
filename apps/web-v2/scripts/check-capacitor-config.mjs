#!/usr/bin/env node
/**
 * PROUVE QUE `capacitor.config.ts` SE CHARGE DANS LE CHARGEUR RÉEL DE LA CLI
 * — ET, DEPUIS #6027, QUE LA FORME iOS EST ARMÉE, PAS SEULEMENT ACCEPTÉE.
 *
 * (1) `cap ls` (inchangé, revue #5774) : la CLI charge `capacitor.config.ts`
 * en CJS (`require.extensions['.ts']`), jamais en ESM ; `bun test` l'importe
 * en ESM (un chargeur DIFFÉRENT) et ne verrait pas un `import.meta` fautif
 * qui rend TOUTES les commandes de coque inutilisables. Ce gate rejoue le
 * VRAI chargeur : `bunx cap ls`.
 *
 * (2)-(5) `MEESHY_SHELL_START_PATH` sur iOS (#6027) — `resolveCapacitorConfig`
 * ne lève plus pour iOS ; elle pose `server.appStartPath` pour les DEUX
 * cibles et compte sur un hook (`scripts/shell-start-path-hook.mjs`) pour
 * poser, côté iOS, le FICHIER que `CAPBridgeViewController.loadWebView()`
 * exige. Un gate qui ne rejouerait que « `cap config --json` réussit » ne
 * verrait PAS une régression retirant les quatre clés de `package.json` (ou
 * visant le mauvais dossier natif) : `cap config --json` continuerait de
 * rendre `appStartPath` (il ne dépend d'aucun hook), et la coque sortirait au
 * premier lancement, en silence. D'où (3)-(4) : la DÉCLARATION des quatre
 * clés ET un rejeu RÉEL du hook, comme la CLI l'exécuterait.
 *
 * Et le rejeu (4) se juge sur le FICHIER POSÉ, jamais sur le code de sortie
 * du hook : `skip` est son issue la plus fréquente et sort 0 lui aussi
 * (revue #6027 — falsifié, un hook rendu muet laissait ce gate VERT).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { IOS_NATIVE_WEB_DIR } from './shell-start-path-hook.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const RECIPE_START_PATH = '/c/c-deploiement';

/** (1) — inchangé (revue #5774). */
function runCapLs() {
  const result = spawnSync('bunx', ['cap', 'ls'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.error) {
    throw new Error(
      `check-capacitor-config: impossible de lancer \`bunx cap ls\` (${result.error.message}) — ` +
        "@capacitor/cli est une optionalDependency de ce paquet ; sans elle, ce gate ne peut " +
        'pas prouver que capacitor.config.ts se charge dans le VRAI chargeur CJS de la CLI.',
    );
  }
  if (result.status !== 0) {
    throw new Error(
      'check-capacitor-config: `bunx cap ls` a échoué — capacitor.config.ts ne se charge PAS ' +
        "dans le chargeur CJS réel de la CLI Capacitor (require.extensions['.ts'], " +
        "@capacitor/cli/dist/util/node.js). Cause typique : un `import.meta` (ou tout autre " +
        'motif ESM-only) dans capacitor.config.ts fait basculer Node sur `loadESMFromCJS`, qui ' +
        `échoue sur le module transpilé. Sortie :\n${combined}`,
    );
  }
  console.log('✓ capacitor.config.ts se charge dans le chargeur CJS réel de `cap` (bunx cap ls, RC=0).');
}

/**
 * (2) — rejoue LECTURE SEULE `bunx cap config --json` pour la cible donnée,
 * avec `MEESHY_SHELL_START_PATH` posé : `cap config` (commande cachée,
 * `@capacitor/cli/dist/tasks/config.js`) n'écrit rien sur le disque, il
 * imprime la config ÉVALUÉE par le VRAI chargeur — même garantie que (1),
 * étendue à la résolution de `server.appStartPath`.
 */
export function replayStartPath(target) {
  const result = spawnSync('bunx', ['cap', 'config', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      MEESHY_SHELL_START_PATH: RECIPE_START_PATH,
      MEESHY_SHELL_SYNC_TARGET: target,
    },
  });
  return { status: result.status ?? (result.error ? 1 : 0), stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * (2), jugement PURE — `result` est un `{status, stdout, stderr}` déjà
 * obtenu (par `replayStartPath` en vrai, ou canné par un témoin). Deux formes
 * sont admises pour iOS : SERT le chemin (RC 0, `appStartPath` résolu, la
 * forme que ce lot livre) ou REFUSE en nommant la cause précise
 * (`CAPBridgeViewController.loadWebView`, la forme que `resolveCapacitorConfig`
 * rendait avant #6027 et que le critère de l'issue admet toujours). Un refus
 * MUET, ou toute autre forme, est une violation — Android n'a droit qu'à la
 * première forme : `Bridge.java` n'a jamais eu de raison de refuser.
 */
export function judgeStartPathReplay(target, result) {
  const { status, stdout, stderr } = result;

  if (status === 0) {
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      return [
        `cap config --json (cible ${target}) a rendu RC 0 mais un JSON illisible ` +
          `(${err instanceof Error ? err.message : String(err)}) — sortie :\n${stdout}`,
      ];
    }
    const appStartPath = parsed?.app?.extConfig?.server?.appStartPath;
    if (appStartPath !== RECIPE_START_PATH) {
      return [
        `cap config --json (cible ${target}) a rendu RC 0 mais server.appStartPath=` +
          `${JSON.stringify(appStartPath ?? null)} ≠ ${JSON.stringify(RECIPE_START_PATH)} attendu — ` +
          'MEESHY_SHELL_START_PATH n’a pas été résolu jusqu’au bout.',
      ];
    }
    return [];
  }

  if (target === 'ios' && /CAPBridgeViewController/.test(stderr)) {
    return [];
  }

  return [
    `cap config --json (cible ${target}) a échoué (code ${status})` +
      (target === 'ios' ? ' sans nommer CAPBridgeViewController.loadWebView' : '') +
      ` — cause :\n${stderr}`,
  ];
}

/**
 * (3) — les quatre clés de `package.json` pointent vers le hook avec la
 * bonne phase, et `cap config --json` vise le dossier natif iOS ATTENDU.
 * `ios.webDir` (rendu par `cap config --json`, relatif à `ios/`) et
 * `IOS_NATIVE_WEB_DIR` (relatif à la racine du paquet, utilisé par le hook
 * pour `join(CAPACITOR_ROOT_DIR, IOS_NATIVE_WEB_DIR, startPath)`) partagent
 * un référentiel différent par UN SEUL segment (`ios/`) — l'attendu est
 * DÉRIVÉ de la constante importée, jamais retapé une seconde fois.
 */
const HOOK_KEYS = Object.freeze({
  'capacitor:copy:before': 'before',
  'capacitor:copy:after': 'after',
  'capacitor:sync:before': 'before',
  'capacitor:sync:after': 'after',
});

export function auditHookDeclaration(packageJson, capConfig) {
  const violations = [];
  const scripts = packageJson?.scripts ?? {};

  for (const [key, phase] of Object.entries(HOOK_KEYS)) {
    const expected = `node scripts/shell-start-path-hook.mjs ${phase}`;
    const actual = scripts[key];
    if (actual === undefined) {
      violations.push(`package.json ne déclare pas le script "${key}" (attendu : "${expected}").`);
    } else if (actual !== expected) {
      violations.push(`package.json.scripts["${key}"]=${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)} attendu.`);
    }
  }

  const expectedWebDir = IOS_NATIVE_WEB_DIR.slice('ios/'.length);
  const actualWebDir = capConfig?.ios?.webDir;
  if (actualWebDir !== expectedWebDir) {
    violations.push(
      `cap config --json rend ios.webDir=${JSON.stringify(actualWebDir ?? null)} ≠ ` +
        `${JSON.stringify(expectedWebDir)} attendu — le hook viserait le mauvais dossier natif.`,
    );
  }

  return violations;
}

/**
 * (4) — rejeu RÉEL du hook, comme la CLI l'exécute : un dossier temporaire
 * fait office de `CAPACITOR_ROOT_DIR`, jamais `ios/` du dépôt (idempotence —
 * même discipline que `build-shells.mjs`, qui n'écrit jamais dans les
 * coques du dépôt hors de son propre pilote de construction).
 *
 * Trois preuves, dans cet ordre : le placeholder EXISTE après la phase
 * `after` (le code de sortie ne prouve rien — voir le doc-comment du module),
 * le rejouer une SECONDE fois ne casse rien (`copy:after` puis `sync:after`
 * dans un même `cap sync`), et une cible ≠ plateforme REFUSE en nommant les
 * deux.
 */
export function replayHookRoundtrip() {
  const tmp = mkdtempSync(join(tmpdir(), 'meeshy-shell-hook-'));
  try {
    mkdirSync(join(tmp, IOS_NATIVE_WEB_DIR), { recursive: true });

    const config = JSON.stringify({ server: { appStartPath: RECIPE_START_PATH } });
    const placeEnv = {
      ...process.env,
      CAPACITOR_CONFIG: config,
      CAPACITOR_PLATFORM_NAME: 'ios',
      CAPACITOR_ROOT_DIR: tmp,
      MEESHY_SHELL_SYNC_TARGET: 'ios',
    };
    const placed = spawnSync('node', ['scripts/shell-start-path-hook.mjs', 'after'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: placeEnv,
    });
    if (placed.status !== 0) {
      return [`rejeu du hook (after, ios) : code ${placed.status} — ${placed.stderr}`];
    }

    // LE FICHIER, PAS LE CODE DE SORTIE (revue #6027). Le hook sort 0 sur son
    // issue la plus FRÉQUENTE — `skip` — donc « RC 0 » ne prouve rien : un
    // hook qui cesserait de poser le placeholder (phase inversée, `skip` rendu
    // pour iOS, pilote jamais atteint parce que sa garde `import.meta.url` a
    // changé de nom) rendrait 0 sans rien écrire, et ce gate annoncerait
    // « ARMÉ » pendant que la coque sortirait au lancement, en silence
    // (`fatalLoadError`, `exit(1)`) — exactement le défaut que #6027 referme.
    // Falsifié : `planStartPathHook` rendu `skip` en phase `after` laissait ce
    // gate VERT avant cette vérification.
    const expectedPlaceholder = join(tmp, IOS_NATIVE_WEB_DIR, RECIPE_START_PATH);
    if (!existsSync(expectedPlaceholder)) {
      return [
        `rejeu du hook (after, ios) : code 0 mais AUCUN placeholder à "${expectedPlaceholder}" — le hook ` +
          "n'écrit plus le fichier que CAPBridgeViewController.loadWebView() exige sous public/ ; " +
          `\`cap sync ios\` réussirait et la coque sortirait au premier lancement. Journal du hook :\n${placed.stdout}`,
      ];
    }

    // IDEMPOTENCE — `copy:after` PUIS `sync:after` rejouent le même plan dans
    // un même `cap sync` (decisions.md § D-27, complément 2026-09-12) : la
    // seconde passe ne doit ni échouer ni réécrire.
    const rerun = spawnSync('node', ['scripts/shell-start-path-hook.mjs', 'after'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: placeEnv,
    });
    if (rerun.status !== 0 || !existsSync(expectedPlaceholder)) {
      return [
        `rejeu du hook (after, ios, SECONDE passe) : code ${rerun.status} — le plan n'est pas idempotent, ` +
          `alors que \`copy:after\` puis \`sync:after\` le rejouent dans un même \`cap sync\`.\n${rerun.stderr}`,
      ];
    }

    const mismatchEnv = {
      ...process.env,
      CAPACITOR_CONFIG: config,
      CAPACITOR_PLATFORM_NAME: 'ios',
      CAPACITOR_ROOT_DIR: tmp,
      MEESHY_SHELL_SYNC_TARGET: 'android',
    };
    const refused = spawnSync('node', ['scripts/shell-start-path-hook.mjs', 'before'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: mismatchEnv,
    });
    if (refused.status === 0 || !/android/.test(refused.stderr) || !/ios/.test(refused.stderr)) {
      return [
        'rejeu du hook (before, cible ≠ plateforme) : devait refuser en nommant "android" et "ios", a rendu ' +
          `code ${refused.status} — ${refused.stderr}`,
      ];
    }

    return [];
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function run() {
  runCapLs();

  const androidResult = replayStartPath('android');
  const iosResult = replayStartPath('ios');
  const violations = [
    ...judgeStartPathReplay('android', androidResult).map((v) => `[android] ${v}`),
    ...judgeStartPathReplay('ios', iosResult).map((v) => `[ios] ${v}`),
  ];

  // (5) — iOS ne SERT le chemin (RC 0) que si le mécanisme qui le rend
  // exploitable est vraiment ARMÉ : la déclaration ET un rejeu réel.
  let iosServes = false;
  try {
    iosServes = JSON.parse(iosResult.stdout)?.app?.extConfig?.server?.appStartPath === RECIPE_START_PATH;
  } catch {
    iosServes = false;
  }

  if (iosServes) {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    let capConfig;
    try {
      capConfig = JSON.parse(androidResult.stdout);
    } catch {
      capConfig = undefined;
    }

    const declarationViolations = auditHookDeclaration(packageJson, capConfig);
    const roundtripViolations = replayHookRoundtrip();

    if (declarationViolations.length > 0 || roundtripViolations.length > 0) {
      violations.push(
        'iOS SERT MEESHY_SHELL_START_PATH (cap config --json rend server.appStartPath) mais le mécanisme qui le ' +
          'pose réellement sous public/ n’est pas ARMÉ — la coque sortirait au premier lancement, en silence :',
        ...declarationViolations.map((v) => `  · ${v}`),
        ...roundtripViolations.map((v) => `  · ${v}`),
      );
    } else {
      console.log('✓ iOS sert MEESHY_SHELL_START_PATH et le hook qui le pose sous public/ est ARMÉ.');
    }
  } else {
    console.log('✓ iOS refuse MEESHY_SHELL_START_PATH en nommant CAPBridgeViewController.loadWebView (forme admise).');
  }

  if (violations.length > 0) {
    console.error('\n  check-capacitor-config : la forme iOS de MEESHY_SHELL_START_PATH ne respecte pas #6027 :\n');
    for (const v of violations) console.error(`    ${v}`);
    console.error('');
    process.exit(1);
  }

  console.log('✓ MEESHY_SHELL_START_PATH est correctement rejoué pour android ET ios (bunx cap config --json).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
