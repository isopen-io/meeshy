#!/usr/bin/env node
/**
 * UNE COMMANDE UNIQUE CONSTRUIT LES DEUX COQUES CONTRE UNE PASSERELLE RÉELLE
 * (#5815, compagnon gateway #5651).
 *
 * `apps/web-v2` sait déjà résoudre une base d'API absolue en coque
 * (`src/lib/api/config.ts::resolveBase`, fail-closed sur la production) et
 * câbler `VITE_DATA_SOURCE=gateway` (#5650, D-26) : rien ne manquait côté
 * application. Ce qui manquait était une commande de RECETTE qui ne puisse
 * pas rejouer, en silence, l'un des deux défauts déjà mesurés le 2026-09-09 :
 *
 *   M1 — une fuite de recette : `bunx cap sync` lancé APRÈS une recette au
 *        chemin de lien profond (`MEESHY_SHELL_START_PATH`, #5812) synchronise
 *        `server.appStartPath` dans la coque — mesuré sur
 *        `android/app/src/main/assets/capacitor.config.json`, qui portait
 *        encore `/c/c-deploiement` (reste de #5812). Une coque construite
 *        ainsi démarre TOUJOURS sur cet identifiant de FIXTURE, et en source
 *        `gateway` c'est un `ThreadRefused` (D-26 F8) au premier écran.
 *   M2 — la comparaison de soi à soi (leçon 554) : une capture « iOS » peut
 *        montrer web-v2 sur SES fixtures. Les noms des fixtures
 *        (`scripts/lib/fixture-markers.mjs`) ne doivent apparaître dans
 *        AUCUN fichier du dist embarqué construit en `gateway` — mesuré à la
 *        main jusqu'ici (D-26 F9), sans gate.
 *
 * Ce script REFUSE avant de construire (§ `resolveShellBuildEnv`), AUDITE
 * après chaque étape coûteuse (§ `auditShellBundle`, `auditSyncedShellConfig`)
 * et REFUSE le simulateur de RÉFÉRENCE (leçon 554 écrite dans le code, pas
 * dans un prompt — jamais `3E761BC1-845D-49D2-8E4D-E0606E04D3E2`, qui porte
 * l'app native iOS et ne doit jamais recevoir la coque).
 *
 * Usage :
 *   MEESHY_TARGET=capacitor VITE_API_BASE=https://gate.staging.meeshy.me \
 *     VITE_DATA_SOURCE=gateway node scripts/build-shells.mjs \
 *     --target android|ios|both [--no-native]
 *
 * Les trois fonctions ci-dessous sont PURES et exportées pour un témoin sans
 * build (`build-shells.test.ts`) — même discipline que `check-shell-dist.mjs`
 * (`auditShellDist`) : le pilote ne s'exécute que lorsque ce fichier est le
 * POINT D'ENTRÉE.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { allFiles } from './lib/files.mjs';
import { FIXTURE_MARKERS } from './lib/fixture-markers.mjs';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Le simulateur de RÉFÉRENCE — l'app NATIVE iOS y vit (D-1). La coque n'y
 * entre JAMAIS : voir `targets/README.md` § « DEUX SIMULATEURS, DEUX APPS,
 * UN SEUL IDENTIFIANT » (leçon 554). */
export const REFERENCE_IOS_SIMULATOR_UDID = '3E761BC1-845D-49D2-8E4D-E0606E04D3E2';

/** Le simulateur DÉDIÉ à la coque du chantier — le seul destinataire d'un
 * build issu de ce script. */
export const SHELL_IOS_SIMULATOR_UDID = '54438823-4ADC-4536-88D2-FC441395FA04';

const VALID_TARGETS = Object.freeze(['android', 'ios', 'both']);

/**
 * La base d'API — même normalisation que `src/lib/api/config.ts::normalizeOrigin`
 * (barre finale et `/api/v1` surnuméraire retirés), réécrite ICI plutôt
 * qu'importée : `config.ts` évalue `import.meta.env`/`__SHELL__` au niveau
 * module (doc-comment de `apiConfig`), ce qu'un script node ne peut pas
 * fournir sans construire.
 */
function normalizeApiBase(raw) {
  return raw.trim().replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
}

/**
 * Refuse AVANT tout coût — construction, `cap sync`, gradle/xcodebuild.
 *
 * `env` est l'environnement du processus, éventuellement enrichi d'une clé
 * `target` par l'appelant (le pilote y fusionne l'option `--target` de la
 * ligne de commande AVANT d'appeler cette fonction — le CLI n'est jamais
 * testé ici, seule la RÈGLE l'est).
 */
export function resolveShellBuildEnv(env) {
  const apiBaseRaw = env.VITE_API_BASE;
  if (typeof apiBaseRaw !== 'string' || !/^https?:\/\//i.test(apiBaseRaw.trim())) {
    throw new Error(
      `VITE_API_BASE doit être une origine ABSOLUE (https://…) pour construire une coque — reçu ` +
        `${JSON.stringify(apiBaseRaw ?? null)}. Une base RELATIVE ne mène nulle part depuis une ` +
        'WebView (capacitor://localhost/api/v1, https://localhost/api/v1 ne résolvent nulle part) ' +
        'et REFUSER est le comportement voulu : `config.ts::resolveBase` retomberait, lui, sur la ' +
        "production en silence (fail-closed d'exécution) — une recette « staging » qui frappe la " +
        'production sans le dire est exactement le défaut que cette commande existe pour ne jamais ' +
        'produire.',
    );
  }

  const dataSource = env.VITE_DATA_SOURCE;
  if (dataSource !== 'gateway') {
    throw new Error(
      `VITE_DATA_SOURCE doit valoir "gateway" pour construire une coque de RECETTE — reçu ` +
        `${JSON.stringify(dataSource ?? null)}. Une coque construite sur "fixtures" (ou la variable ` +
        'absente) monterait Amina Diallo, Kwame Mensah et Fatou Bâ sur l’écran de recette au lieu du ' +
        'compte semé cible-web-trois (leçon 554) — la garde de `vite.config.ts` refuserait de toute ' +
        'façon une valeur ni "fixtures" ni "gateway" ni absente, mais SEULEMENT au moment de `vite ' +
        'build`, après que ce script aurait déjà pu lancer `bunx cap sync`.',
    );
  }

  if (env.MEESHY_SHELL_START_PATH !== undefined) {
    throw new Error(
      `MEESHY_SHELL_START_PATH="${env.MEESHY_SHELL_START_PATH}" est posé — une coque LIVRÉE ne porte ` +
        'jamais un chemin de RECETTE (`capacitor.config.ts:15-31` : « chemin de RECETTE : ne jamais ' +
        'synchroniser une coque livrée avec ce paramètre posé »). Le retirer avant de construire.',
    );
  }

  const targetRaw = env.target ?? 'both';
  if (!VALID_TARGETS.includes(targetRaw)) {
    throw new Error(
      `--target="${targetRaw}" inconnu — les cibles admises sont : ${VALID_TARGETS.join(', ')}.`,
    );
  }

  return Object.freeze({
    apiBase: normalizeApiBase(apiBaseRaw),
    dataSource,
    target: targetRaw,
  });
}

/**
 * LE SIMULATEUR QUI REÇOIT LA COQUE — jamais celui de RÉFÉRENCE (leçon 554).
 *
 * PURE et exportée parce qu'une garde qui ne vit que dans le pilote ne
 * s'exécute qu'au moment où elle coûte le plus cher : ce que le témoin
 * `build-shells.test.ts` doit pouvoir faire échouer, c'est la RÈGLE — deux
 * constantes qui diffèrent ne prouvent rien de la garde qui les compare.
 */
export function resolveShellSimulatorUdid(env) {
  const udid = env.MEESHY_SHELL_IOS_UDID ?? SHELL_IOS_SIMULATOR_UDID;
  if (udid === REFERENCE_IOS_SIMULATOR_UDID) {
    throw new Error(
      `MEESHY_SHELL_IOS_UDID="${udid}" est le simulateur de RÉFÉRENCE (« Meeshy Ref-Native » — ` +
        "l'app NATIVE iOS y vit, D-1) : la coque ne s'y installe JAMAIS (leçon 554). Utiliser " +
        `"${SHELL_IOS_SIMULATOR_UDID}" (« Meeshy Poc-Web-V31 »).`,
    );
  }
  return udid;
}

/**
 * Audite le `capacitor.config.json` SYNCHRONISÉ (`android/app/src/main/assets/…`
 * ou `ios/App/App/…`) — ferme M1 : une coque synchronisée ne doit JAMAIS
 * porter `server.appStartPath` (un chemin de RECETTE), et doit rester sur le
 * contrat déclaré par `capacitor.config.ts` (`appId`, `server.androidScheme`
 * — dont dépend l’origine `https://localhost` gardée côté passerelle, #5815).
 */
export function auditSyncedShellConfig(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return [`capacitor.config.json synchronisé illisible : ${err instanceof Error ? err.message : String(err)}`];
  }

  const violations = [];
  const server = parsed && typeof parsed === 'object' ? (parsed.server ?? {}) : {};

  if (server.appStartPath !== undefined) {
    violations.push(
      `server.appStartPath="${server.appStartPath}" est présent dans la coque SYNCHRONISÉE — un ` +
        'paramètre de RECETTE (`capacitor.config.ts:15-31`), jamais dans une coque livrée (fuite ' +
        'mesurée le 2026-09-09, M1).',
    );
  }
  if (parsed?.appId !== 'me.meeshy.app') {
    violations.push(
      `appId="${parsed?.appId}" — attendu "me.meeshy.app" (le contrat de \`capacitor.config.ts\`).`,
    );
  }
  if (server.androidScheme !== 'https') {
    violations.push(
      `server.androidScheme="${server.androidScheme}" — attendu "https" : l’origine servie par la ` +
        'coque Android (`https://localhost`, gardée côté passerelle, #5815) en dépend.',
    );
  }

  return violations;
}

/**
 * Audite le BUNDLE construit (fichiers `{path, text}`, jamais moins que ce
 * que `vite build` écrit réellement sous `dist/`) — ferme M2 : aucun
 * marqueur de fixture ne doit y voyager, et la base d’API demandée doit être
 * effectivement celle qui a été inlinée (sinon la construction n’a pas lu
 * `VITE_API_BASE`, un défaut de configuration silencieux et pire).
 */
export function auditShellBundle(files, { apiBase }) {
  const violations = [];

  for (const marker of FIXTURE_MARKERS) {
    const hit = files.find((file) => file.text.includes(marker));
    if (hit !== undefined) {
      violations.push(
        `le marqueur de fixture "${marker}" est présent dans ${hit.path} — une coque de recette ` +
          'construite sur VITE_DATA_SOURCE=gateway ne doit porter AUCUNE fixture (leçon 554).',
      );
    }
  }

  const inlinesApiBase = files.some(
    (file) => file.path.endsWith('.js') && file.text.includes(apiBase),
  );
  if (!inlinesApiBase) {
    violations.push(
      `aucun fichier .js du bundle n’inclut la base d’API demandée ("${apiBase}") — la construction ` +
        'n’a pas lu `VITE_API_BASE` (`src/lib/api/config.ts::resolveBase`).',
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Le pilote — non testé en bun (spawnSync réel, gradle/xcodebuild) ; les
// fonctions pures ci-dessus le sont, via `build-shells.test.ts`.
// ---------------------------------------------------------------------------

function readTextFiles(paths, root) {
  return paths
    .filter((p) => /\.(?:js|mjs|html|json)$/.test(p))
    .map((p) => ({ path: p.slice(root.length + 1), text: readFileSync(p, 'utf8') }));
}

function run(cmd, args, options, label) {
  console.log(`  ${label} : ${cmd} ${args.join(' ')}`);
  const startedAt = Date.now();
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n  ${label} a échoué (${seconds}s, code ${result.status}) — voir la sortie ci-dessus.\n`);
    process.exit(result.status ?? 1);
  }
  console.log(`  ${label} : ok (${seconds}s)`);
}

function parseArgv(argv) {
  const targetIndex = argv.indexOf('--target');
  const target = targetIndex !== -1 ? argv[targetIndex + 1] : undefined;
  const noNative = argv.includes('--no-native');
  return { target, noNative };
}

async function main() {
  const { target: cliTarget, noNative } = parseArgv(process.argv.slice(2));
  const { apiBase, target } = resolveShellBuildEnv({ ...process.env, target: cliTarget });

  console.log(`  cible : ${target}${noNative ? ' (--no-native : pas de gradle/xcodebuild)' : ''}`);
  console.log(`  base d'API : ${apiBase}`);

  // 1. Construction de la variante B DANS dist/ — jamais dist-capacitor/ :
  //    capacitor.config.ts:70 (webDir: 'dist') est le contrat que `cap sync`
  //    lit, et c'est exactement le piège documenté au README § coques que ce
  //    script rend impossible à rejouer par erreur.
  rmSync(join(APP, 'dist'), { recursive: true, force: true });
  run(
    'bunx',
    ['vite', 'build'],
    {
      cwd: APP,
      env: {
        ...process.env,
        MEESHY_TARGET: 'capacitor',
        VITE_API_BASE: apiBase,
        VITE_DATA_SOURCE: 'gateway',
      },
    },
    'construction de la variante B (dist/)',
  );

  // 2. Audit du bundle — ferme M2 avant de synchroniser quoi que ce soit.
  const bundleFiles = readTextFiles(allFiles(join(APP, 'dist')), join(APP, 'dist'));
  const bundleViolations = auditShellBundle(bundleFiles, { apiBase });
  if (bundleViolations.length > 0) {
    console.error('\n  le dist construit ne respecte pas le contrat de recette :\n');
    for (const v of bundleViolations) console.error(`    · ${v}`);
    console.error('');
    process.exit(1);
  }
  console.log('  audit du bundle : aucun marqueur de fixture, base d’API inlinée — ok');

  // 3. Synchronisation — SANS MEESHY_SHELL_START_PATH (déjà refusé à l'étape 1).
  const capTargets = target === 'both' ? [] : [target];
  run('bunx', ['cap', 'sync', ...capTargets], { cwd: APP, env: process.env }, 'synchronisation Capacitor');

  // 4. Audit des configs synchronisées — ferme M1.
  const syncedConfigs = [
    target !== 'ios' ? join(APP, 'android/app/src/main/assets/capacitor.config.json') : null,
    target !== 'android' ? join(APP, 'ios/App/App/capacitor.config.json') : null,
  ].filter((p) => p !== null);

  const configViolations = syncedConfigs.flatMap((p) => {
    const violations = auditSyncedShellConfig(readFileSync(p, 'utf8'));
    return violations.map((v) => `${p.slice(APP.length + 1)} : ${v}`);
  });
  if (configViolations.length > 0) {
    console.error('\n  la coque synchronisée ne respecte pas le contrat de livraison :\n');
    for (const v of configViolations) console.error(`    · ${v}`);
    console.error('');
    process.exit(1);
  }
  console.log('  audit des coques synchronisées : ok');

  if (noNative) {
    console.log('\n  --no-native : construction native sautée.\n');
    return;
  }

  // 5. Construction native.
  if (target !== 'ios') {
    run(
      './gradlew',
      ['assembleDebug'],
      {
        cwd: join(APP, 'android'),
        env: {
          ...process.env,
          JAVA_HOME: process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21',
          ANDROID_HOME: process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'android-sdk'),
        },
      },
      'construction Android (assembleDebug)',
    );
    console.log(`\n  APK : android/app/build/outputs/apk/debug/app-debug.apk`);
    console.log(
      '  installation AVD : adb install -r android/app/build/outputs/apk/debug/app-debug.apk && ' +
        'adb shell am start -n me.meeshy.app/.MainActivity',
    );
  }

  if (target !== 'android') {
    const udid = resolveShellSimulatorUdid(process.env);
    run(
      'xcodebuild',
      ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-destination', `id=${udid}`, 'build'],
      { cwd: APP, env: process.env },
      'construction iOS (xcodebuild)',
    );
    console.log(`\n  App.app : ios/App/Build/Products/Debug-iphonesimulator/App.app`);
    console.log(
      `  installation simulateur : xcrun simctl install ${udid} ` +
        'ios/App/Build/Products/Debug-iphonesimulator/App.app && ' +
        `xcrun simctl launch ${udid} me.meeshy.app`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\n  build-shells.mjs a échoué :', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
