#!/usr/bin/env node
// Garde de la reprise de résolution SPM iOS [#6545]
//
// LE DÉFAUT REJOUÉ
//
// Le run iOS déclenché à la main sur `promote/main-39224d5fc9` (34856187098)
// est tombé avant toute compilation : `xcodebuild -resolvePackageDependencies`
// échouait quatre fois de suite avec la MÊME erreur —
//
//   failed downloading '…WebRTC-M146.xcframework.zip' which is required by
//   binary target 'WebRTC':
//   /Users/runner/Library/Caches/org.swift.swiftpm/artifacts/…
//   already exists in file system
//
// — une entrée déjà présente dans le cache d'artefacts SwiftPM DU RUNNER, pas
// une panne réseau. La boucle de reprise de l'étape (`ios.yml`, « Resolve SPM
// packages ») attendait 15/30/45 s et rejouait la MÊME commande sur le MÊME
// cache en collision : elle ne pouvait pas en sortir, et son avertissement
// (« transient network? ») nommait la mauvaise cause.
//
// CE QUE CE GARDE VÉRIFIE
//
// La logique de reprise a quitté `ios.yml` pour `scripts/ci/resolve-spm-packages.sh`,
// rejouable sans macOS : `xcodebuild` et `sleep` sont de simples commandes
// résolues par `PATH`, remplaçables par de faux binaires shell. Trois scénarios,
// chacun un faux `xcodebuild` :
//
//   1. COLLISION récupérable — le premier essai pose un fichier « déjà
//      présent » et imprime l'erreur réelle en la nommant ; le script doit le
//      PURGER (jamais dormir) et réussir au second essai.
//   2. panne réseau réellement TRANSITOIRE — échoue trois fois avec un
//      message distinct, réussit à la quatrième ; le script doit dormir entre
//      les essais (comportement HISTORIQUE, à ne pas perdre) et réussir.
//   3. échec PERMANENT (erreur de résolution réelle) — le script doit finir
//      en échec après 4 essais, jamais boucler indéfiniment.
//
// `--self-test` rejoue le scénario 1 contre une variante du script où la
// branche de collision (bornée par les commentaires sentinelles
// `collision-branch:start/end`) a été retirée — la régression exacte que ce
// garde ferme — et vérifie que cette variante reste bloquée en collision,
// preuve que le scénario 1 aurait attrapé le défaut d'origine.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts/ci/resolve-spm-packages.sh');
const WORKFLOW_PATH = join(REPO_ROOT, '.github/workflows/ios.yml');

const STALE_ARTIFACT_RELATIVE = 'org.swift.swiftpm/artifacts/WebRTC-M146.xcframework.zip';

const FAKE_XCODEBUILD = {
  // Le fichier « déjà présent » est un ÉTAT PRÉEXISTANT du runner (le cache
  // en collision), pas quelque chose que cet essai crée : `runScenario` le
  // sème avant le premier appel. Tant qu'il existe, chaque essai reproduit
  // l'erreur réelle ; purgé, l'essai suivant réussit — c'est exactement le
  // comportement qu'une purge doit produire.
  collision: `#!/usr/bin/env bash
set -euo pipefail
STALE="$FAKE_STATE_DIR/${STALE_ARTIFACT_RELATIVE}"
if [ -f "$STALE" ]; then
  echo "failed downloading 'https://github.com/stasel/WebRTC/releases/download/146.0.0/WebRTC-M146.xcframework.zip'"
  echo "which is required by binary target 'WebRTC':"
  echo "$STALE"
  echo "already exists in file system"
  exit 1
fi
echo "Resolved source packages"
exit 0
`,
  transientNetwork: `#!/usr/bin/env bash
set -euo pipefail
STATE="$FAKE_STATE_DIR/count"
count=0
[ -f "$STATE" ] && count=$(cat "$STATE")
count=$((count + 1))
echo "$count" > "$STATE"
if [ "$count" -lt 4 ]; then
  echo "xcodebuild: error: The network connection was lost." >&2
  exit 74
fi
echo "Resolved source packages"
exit 0
`,
  permanentFailure: `#!/usr/bin/env bash
echo "xcodebuild: error: no such module 'Foo'" >&2
exit 65
`,
};

const FAKE_SLEEP = `#!/usr/bin/env bash
echo "$1" >> "$FAKE_SLEEP_LOG"
exit 0
`;

const write = (path, content, mode = 0o644) => {
  writeFileSync(path, content);
  chmodSync(path, mode);
};

/** Exécute `scriptPath` sous un faux `xcodebuild` (et un faux `sleep`, instantané). */
const runScenario = (scriptPath, fakeXcodebuild, { seedStaleArtifact = false } = {}) => {
  const workdir = mkdtempSync(join(tmpdir(), 'spm-resolve-'));
  const bin = join(workdir, 'bin');
  const state = join(workdir, 'state');
  const sleepLog = join(workdir, 'sleep.log');
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  write(join(bin, 'xcodebuild'), fakeXcodebuild, 0o755);
  write(join(bin, 'sleep'), FAKE_SLEEP, 0o755);
  if (seedStaleArtifact) {
    const stale = join(state, STALE_ARTIFACT_RELATIVE);
    mkdirSync(dirname(stale), { recursive: true });
    writeFileSync(stale, '');
  }

  const result = spawnSync(
    scriptPath,
    ['apps/ios/Meeshy.xcodeproj', 'Meeshy', `${workdir}/DerivedData`, `${workdir}/spm`],
    {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: workdir,
        FAKE_STATE_DIR: state,
        FAKE_SLEEP_LOG: sleepLog,
        SWIFTPM_ARTIFACTS_ROOT: join(state, 'org.swift.swiftpm/artifacts'),
      },
      encoding: 'utf8',
      timeout: 15_000,
    },
  );

  const sleptFor = (() => {
    try {
      return readFileSync(sleepLog, 'utf8').trim().split('\n').filter(Boolean).map(Number);
    } catch {
      return [];
    }
  })();

  rmSync(workdir, { recursive: true, force: true });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`, sleptFor };
};

const scenarioChecks = (scriptPath) => {
  const collision = runScenario(scriptPath, FAKE_XCODEBUILD.collision, { seedStaleArtifact: true });
  const network = runScenario(scriptPath, FAKE_XCODEBUILD.transientNetwork);
  const permanent = runScenario(scriptPath, FAKE_XCODEBUILD.permanentFailure);

  return [
    collision.status === 0
      ? []
      : [`collision : devrait réussir après purge, code de sortie ${collision.status}`],
    collision.sleptFor.length === 0
      ? []
      : [`collision : a dormi (${collision.sleptFor.join(',')}s) au lieu de purger le cache`],
    network.status === 0
      ? []
      : [`panne réseau transitoire : devrait réussir au 4e essai, code de sortie ${network.status}`],
    network.sleptFor.length === 3
      ? []
      : [`panne réseau transitoire : attendu 3 pauses avant le 4e essai, observé ${network.sleptFor.length}`],
    permanent.status === 1
      ? []
      : [`échec permanent : devrait échouer (code 1) après 4 essais, code de sortie ${permanent.status}`],
    permanent.output.includes('SPM resolve failed after 4 attempts')
      ? []
      : ["échec permanent : le journal ne nomme pas « SPM resolve failed after 4 attempts »"],
  ].flat();
};

const workflowCallsTheScript = () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  return workflow.includes('scripts/ci/resolve-spm-packages.sh')
    ? []
    : [
        `${WORKFLOW_PATH} n'appelle plus scripts/ci/resolve-spm-packages.sh — la boucle de reprise est-elle repassée en ligne ?`,
      ];
};

/** Retire la branche de collision (bornée par les sentinelles) — la régression exacte de #6545. */
const withoutCollisionBranch = (source) => {
  const start = source.indexOf('# --- collision-branch:start ---');
  const end = source.indexOf('# --- collision-branch:end ---');
  if (start === -1 || end === -1) {
    throw new Error('sentinelles collision-branch introuvables dans resolve-spm-packages.sh');
  }
  return source.slice(0, start) + source.slice(end + '# --- collision-branch:end ---'.length);
};

const selfTest = () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const regressedDir = mkdtempSync(join(tmpdir(), 'spm-resolve-regressed-'));
  const regressedPath = join(regressedDir, 'resolve-spm-packages.sh');
  write(regressedPath, withoutCollisionBranch(source), 0o755);

  const regressed = runScenario(regressedPath, FAKE_XCODEBUILD.collision, { seedStaleArtifact: true });
  rmSync(regressedDir, { recursive: true, force: true });

  // La variante régressée n'a plus de branche de purge : elle doit RESTER
  // bloquée en collision (code de sortie 1) — sinon le scénario 1 est AVEUGLE
  // au défaut d'origine, et ce garde ne vaudrait rien.
  if (regressed.status === 0) {
    console.error(
      'AVEUGLE : le scénario « collision » réussit encore sans la branche de purge — il ne détecterait pas #6545.',
    );
    return 1;
  }
  console.log('self-test : le scénario « collision » attrape bien la régression #6545 (script sans purge reste bloqué).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) {
    return selfTest();
  }
  const failures = [...workflowCallsTheScript(), ...scenarioChecks(SCRIPT_PATH)];
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) dans la reprise de résolution SPM iOS.`);
    return 1;
  }
  console.log('scripts/ci/resolve-spm-packages.sh distingue collision de cache et panne réseau (3/3 scénarios).');
  return 0;
};

process.exit(main());
