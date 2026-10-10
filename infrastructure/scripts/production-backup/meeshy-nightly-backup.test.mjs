// Témoins du VERDICT publié par la sauvegarde nocturne (#9668) : etat.json est
// écrit en succès ET en échec — y compris quand l'échec arrive avant toute
// écriture, ou hors de tout `|| fail` —, la dernière réussite survit à un échec,
// et le fichier ne porte ni chemin d'hôte ni secret.
//
// Aucune base réelle : `docker`, `df`, `flock` et `rsync` sont des doubles posés
// en tête du PATH.
//
//   node --test infrastructure/scripts/production-backup/meeshy-nightly-backup.test.mjs

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'meeshy-nightly-backup.sh');
const SECRET = 'S3cr3t-0ps-Passw0rd';

const FAKES = {
  docker: `#!/usr/bin/env bash
all="$*"
case "$1" in
  inspect) [[ "\${FAKE_FAIL:-}" == inspect ]] && exit 1; echo mongo:8.0 ;;
  run) echo fake-container-id ;;
  rm) exit 0 ;;
  volume) echo "$FAKE_VOLUMES_DIR/\${!#}" ;;
  exec)
    if [[ "$all" == *mongorestore* ]]; then cat > /dev/null; [[ "\${FAKE_FAIL:-}" == restore ]] && { echo "restore boom" >&2; exit 1; }; exit 0; fi
    if [[ "$all" == *mongodump* ]]; then cat > /dev/null; [[ "\${FAKE_FAIL:-}" == mongodump ]] && { echo "dump boom" >&2; exit 1; }; printf 'FAKE-ARCHIVE-0123456789'; exit 0; fi
    if [[ "$all" == *countDocuments* ]]; then printf 'Message\\t5\\nUser\\t3\\n'; exit 0; fi
    if [[ "$all" == *getIndexes* ]]; then echo 7; exit 0; fi
    echo 1 ;;
esac
`,
  df: `#!/usr/bin/env bash
printf 'Avail\\n %sG\\n' "\${FAKE_DF_AVAIL:-500}"
`,
  flock: `#!/usr/bin/env bash
exit 0
`,
  rsync: `#!/usr/bin/env bash
args=("$@"); dest="\${args[\${#args[@]}-1]}"; src="\${args[\${#args[@]}-2]}"
mkdir -p "$dest" && cp -R "$src". "$dest"
`,
};

let root;
let env;

const statusFile = () => path.join(env.STATUS_DIR, 'etat.json');
const verdict = () => JSON.parse(readFileSync(statusFile(), 'utf8'));
const run = (extra = {}) => spawnSync('bash', [SCRIPT], { env: { ...env, ...extra }, encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nightly-backup-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  for (const [name, body] of Object.entries(FAKES)) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  const compose = path.join(root, 'production');
  mkdirSync(compose);
  writeFileSync(path.join(compose, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(path.join(compose, '.env'), `MONGO_OPS_PASSWORD=${SECRET}\n`);
  const volumes = path.join(root, 'volumes');
  for (const name of ['vol_a', 'vol_b']) {
    mkdirSync(path.join(volumes, name), { recursive: true });
    writeFileSync(path.join(volumes, name, 'media.bin'), 'x'.repeat(5000));
  }
  env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    COMPOSE_DIR: compose,
    BACKUP_ROOT: path.join(root, 'backups', 'nightly'),
    STATUS_DIR: path.join(root, 'backups', 'nightly-status'),
    LOCK_FILE: path.join(root, 'lock'),
    VOLUMES: 'vol_a vol_b',
    MIN_FREE_GB: '40',
    KEEP: '3',
    FAKE_VOLUMES_DIR: volumes,
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('le verdict d’une sauvegarde réussie', () => {
  it('publie etat.json avec le contenu de la sauvegarde', () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);

    const v = verdict();
    assert.equal(v.status, 'ok');
    assert.equal(v.reason, null);
    assert.match(v.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(v.lastSuccessAt, v.generatedAt);
    assert.deepEqual(
      { ...v.lastSuccess, durationSeconds: 0, volumes: v.lastSuccess.volumes.map((volume) => volume.name) },
      { documents: 8, collections: 2, mismatches: 0, indexes: 7, archiveBytes: 23, durationSeconds: 0, volumes: ['vol_a', 'vol_b'] },
    );
    assert.ok(v.lastSuccess.volumes.every((volume) => volume.bytes > 0));
    assert.ok(Number.isInteger(v.lastSuccess.durationSeconds));
  });

  it('écrit le fichier en 644 dans un dossier 755, alors que le script travaille en umask 077', () => {
    run();
    assert.equal(statSync(env.STATUS_DIR).mode & 0o777, 0o755);
    assert.equal(statSync(statusFile()).mode & 0o777, 0o644);
  });

  it('ne publie ni chemin d’hôte ni secret', () => {
    run();
    const raw = readFileSync(statusFile(), 'utf8');
    assert.ok(!raw.includes(SECRET));
    assert.ok(!raw.includes(root));
    assert.ok(!raw.includes('/opt/'));
  });

  it('garde DERNIER-ETAT', () => {
    run();
    assert.match(readFileSync(path.join(env.BACKUP_ROOT, 'DERNIER-ETAT'), 'utf8'), /^OK /);
  });
});

describe('le verdict d’un échec', () => {
  it('un mongodump en échec publie failed avec sa raison, et la dernière réussite SURVIT', () => {
    run();
    const success = verdict();
    const result = run({ FAKE_FAIL: 'mongodump' });
    assert.equal(result.status, 1);

    const v = verdict();
    assert.equal(v.status, 'failed');
    assert.match(v.reason, /mongodump/);
    assert.equal(v.lastSuccessAt, success.lastSuccessAt);
    assert.deepEqual(v.lastSuccess, success.lastSuccess);
    assert.ok(!readFileSync(statusFile(), 'utf8').includes(SECRET));
  });

  it('un échec AVANT toute écriture (espace libre) publie quand même, sans réussite connue', () => {
    const result = run({ FAKE_DF_AVAIL: '3' });
    assert.equal(result.status, 1);

    const v = verdict();
    assert.equal(v.status, 'failed');
    assert.match(v.reason, /espace libre 3 Go < 40 Go/);
    assert.equal(v.lastSuccessAt, null);
    assert.equal(v.lastSuccess, null);
    assert.equal(statSync(env.STATUS_DIR).mode & 0o777, 0o755);
  });

  it('un arrêt qu’aucun `|| fail` ne nomme publie aussi un échec, sans la commande', () => {
    const result = run({ FAKE_FAIL: 'inspect' });
    assert.notEqual(result.status, 0);

    const v = verdict();
    assert.equal(v.status, 'failed');
    assert.match(v.reason, /^arrêt inattendu \(code \d+, ligne \d+\)$/);
  });

  it('un KEEP invalide est un échec publié', () => {
    const result = run({ KEEP: 'zero' });
    assert.equal(result.status, 1);
    assert.match(verdict().reason, /KEEP/);
  });

  it('un ancien verdict illisible n’empêche pas de publier l’échec', () => {
    mkdirSync(env.STATUS_DIR, { recursive: true });
    writeFileSync(statusFile(), '{ pas du json');
    run({ FAKE_FAIL: 'restore' });

    const v = verdict();
    assert.equal(v.status, 'failed');
    assert.equal(v.lastSuccessAt, null);
  });

  it('un échec ne laisse ni dossier en cours ni fichier temporaire de verdict', () => {
    run({ FAKE_FAIL: 'mongodump' });
    assert.ok(existsSync(statusFile()));
    const leftovers = readFileSync(statusFile(), 'utf8') && spawnSync('ls', ['-A', env.STATUS_DIR], { encoding: 'utf8' }).stdout.trim().split('\n');
    assert.deepEqual(leftovers, ['etat.json']);
  });
});
