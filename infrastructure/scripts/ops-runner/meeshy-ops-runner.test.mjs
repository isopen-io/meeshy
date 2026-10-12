// Témoins du runner des opérations de l'administration (#10385, #10386) : il
// n'exécute qu'un fichier ORDINAIRE, petit, strict, de son environnement ; il
// déplace la demande AVANT d'exécuter ; il tient les délais ; il ne connaît que
// deux gestes, et la purge ne touche jamais un volume.
//
// Aucun Docker ni systemd réel : `docker` et `systemctl` sont des doubles posés
// en tête du PATH, qui journalisent leurs arguments.
//
//   node --test infrastructure/scripts/ops-runner/meeshy-ops-runner.test.mjs

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(here, 'meeshy-ops-runner.py');
const ID_A = '0b4f8a0e-6f43-4a4c-9a4b-2d2c7f7d1c11';
const ID_B = '1c5f8a0e-6f43-4a4c-9a4b-2d2c7f7d1c22';
const NOW = '2026-10-12T22:00:00.000Z';

const FAKES = {
  docker: `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
if [[ "$1 $2" == "system df" ]]; then
  echo '{"Active":"20","Reclaimable":"18.1GB (28%)","Size":"64.63GB","TotalCount":"64","Type":"Images"}'
  echo '{"Active":"20","Reclaimable":"0B (0%)","Size":"388.3MB","TotalCount":"25","Type":"Containers"}'
  echo '{"Active":"20","Reclaimable":"10.51GB (6%)","Size":"160.4GB","TotalCount":"87","Type":"Local Volumes"}'
  echo '{"Active":"0","Reclaimable":"0B","Size":"0B","TotalCount":"0","Type":"Build Cache"}'
  exit 0
fi
[[ "\${FAKE_FAIL:-}" == prune ]] && exit 1
if [[ "$1 $2" == "image prune" && "$3" == "-f" ]]; then echo "Total reclaimed space: 1.5GB"; fi
if [[ "$1 $2" == "image prune" && "$3" == "-af" ]]; then echo "Deleted Images:"; echo "Total reclaimed space: 512MB"; fi
if [[ "$1 $2" == "builder prune" ]]; then echo "Total:	0B"; fi
exit 0
`,
  systemctl: `#!/usr/bin/env bash
echo "systemctl $*" >> "$FAKE_LOG"
[[ "\${FAKE_FAIL:-}" == backup ]] && exit 3
if [[ -n "\${FAKE_VERDICT:-}" ]]; then printf '%s' "$FAKE_VERDICT" > "$OPS_BACKUP_STATUS_FILE"; fi
exit 0
`,
};

let root;
let env;
let base;

const opsState = () => JSON.parse(readFileSync(path.join(base, 'state', 'ops.json'), 'utf8'));
const calls = () => (existsSync(env.FAKE_LOG) ? readFileSync(env.FAKE_LOG, 'utf8').trim().split('\n').filter(Boolean) : []);
const run = (command = 'process', extra = {}) =>
  spawnSync('python3', ['-I', RUNNER, command, 'staging'], { env: { ...env, ...extra }, encoding: 'utf8' });

const request = (overrides = {}) => ({
  v: 1,
  id: ID_A,
  action: 'backup',
  environment: 'staging',
  requestedBy: 'jcnm',
  requestedAt: NOW,
  ...overrides,
});

const drop = (body, name = `${(typeof body === 'object' && body.id) || ID_A}.json`) => {
  const file = path.join(base, 'requests', name);
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};

const verdict = (generatedAt, status = 'ok') =>
  JSON.stringify({ generatedAt, status, reason: null, lastSuccessAt: generatedAt, lastSuccess: null });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'ops-runner-'));
  base = path.join(root, 'ops');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(path.join(base, 'requests'), { recursive: true });
  for (const [name, body] of Object.entries(FAKES)) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  env = {
    PATH: `${bin}:${process.env.PATH}`,
    OPS_BASE_DIR: base,
    OPS_BACKUP_STATUS_FILE: path.join(root, 'etat.json'),
    OPS_NOW: NOW,
    FAKE_LOG: path.join(root, 'calls.log'),
    FAKE_VERDICT: verdict('2026-10-12T22:03:00Z'),
  };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('une demande de sauvegarde valide', () => {
  it('part vers done/ avant l’exécution, démarre l’unité de sauvegarde et publie le succès', () => {
    drop(request());
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(path.join(base, 'requests')), []);
    assert.deepEqual(readdirSync(path.join(base, 'done')), [`${ID_A}.json`]);
    assert.deepEqual(calls(), ['systemctl start --wait meeshy-staging-backup.service']);
    const state = opsState();
    assert.equal(state.v, 1);
    assert.equal(state.lastAcceptedAt.backup, NOW);
    assert.equal(state.lastAcceptedAt['image-prune'], null);
    assert.equal(state.runs.backup.status, 'succeeded');
    assert.equal(state.runs.backup.requestId, ID_A);
    assert.equal(state.runs.backup.requestedBy, 'jcnm');
    assert.equal(state.runs.backup.code, null);
    assert.equal(state.runs['image-prune'], null);
  });

  it('un second appel avant six heures est retenu par le délai, sans rien exécuter', () => {
    drop(request());
    run();
    drop(request({ id: ID_B }));
    run('process', { OPS_NOW: '2026-10-13T03:59:00.000Z' });
    assert.equal(calls().length, 1);
    assert.equal(opsState().runs.backup.status, 'throttled');
    assert.equal(opsState().runs.backup.code, 'cooldown');
    assert.equal(opsState().lastAcceptedAt.backup, NOW);
  });

  it('une unité qui échoue est publiée en échec, sous une clé fixe', () => {
    drop(request());
    run('process', { FAKE_FAIL: 'backup' });
    assert.equal(opsState().runs.backup.status, 'failed');
    assert.equal(opsState().runs.backup.code, 'backup-failed');
  });

  it('un verdict de sauvegarde en échec ou antérieur au lancement rend l’opération en échec', () => {
    drop(request());
    run('process', { FAKE_VERDICT: verdict('2026-10-12T22:03:00Z', 'failed') });
    assert.equal(opsState().runs.backup.code, 'verdict-failed');

    rmSync(path.join(base, 'state', 'ops.json'));
    drop(request({ id: ID_B }));
    run('process', { FAKE_VERDICT: verdict('2026-10-12T21:00:00Z') });
    assert.equal(opsState().runs.backup.code, 'verdict-stale');
  });
});

describe('la purge des images', () => {
  it('ne lance que les trois purges fixes, jamais un volume ni system prune, et compte l’espace rendu', () => {
    drop(request({ action: 'image-prune' }));
    run();
    const log = calls();
    assert.deepEqual(log.slice(0, 3), [
      'docker image prune -f',
      'docker image prune -af --filter until=168h',
      'docker builder prune -f',
    ]);
    assert.ok(!log.some((line) => /volume|system prune|--volumes/.test(line)));
    const state = opsState();
    assert.equal(state.runs['image-prune'].status, 'succeeded');
    assert.equal(state.runs['image-prune'].reclaimedBytes, 1_500_000_000 + 512_000_000);
    assert.ok(existsSync(path.join(base, 'state', 'docker.json')));
  });

  it('une purge en échec est publiée en échec', () => {
    drop(request({ action: 'image-prune' }));
    run('process', { FAKE_FAIL: 'prune' });
    assert.equal(opsState().runs['image-prune'].status, 'failed');
    assert.equal(opsState().runs['image-prune'].code, 'prune-failed');
  });
});

describe('les demandes refusées', () => {
  const refusedWithoutEffect = () => {
    assert.deepEqual(readdirSync(path.join(base, 'requests')), []);
    assert.equal(readdirSync(path.join(base, 'rejected')).length, 1);
    assert.deepEqual(calls(), []);
  };

  it('un lien n’est jamais suivi', () => {
    const target = path.join(root, 'cible.json');
    writeFileSync(target, JSON.stringify(request()));
    symlinkSync(target, path.join(base, 'requests', `${ID_A}.json`));
    run();
    refusedWithoutEffect();
    assert.ok(existsSync(target));
  });

  it('un fichier de plus de 1024 octets est refusé', () => {
    drop(request({ requestedBy: 'x'.repeat(1100) }));
    run();
    refusedWithoutEffect();
  });

  it('une clé en trop, une action hors liste, un nom qui ne porte pas l’uuid, un JSON non strict : refusés', () => {
    for (const body of [
      request({ command: 'rm -rf /' }),
      request({ action: 'system-prune' }),
      request({ v: true }),
      `{"v":1,"v":1,"id":"${ID_A}","action":"backup","environment":"staging","requestedBy":"x","requestedAt":"${NOW}"}`,
    ]) {
      drop(body);
      run();
      assert.deepEqual(calls(), []);
    }
    drop(request(), `${ID_B}.json`);
    run();
    assert.deepEqual(calls(), []);
    assert.equal(readdirSync(path.join(base, 'rejected')).length, 5);
  });

  it('une demande d’un autre environnement est refusée et nommée, sans rien exécuter', () => {
    drop(request({ environment: 'production' }));
    run();
    refusedWithoutEffect();
    assert.equal(opsState().runs.backup.status, 'rejected');
    assert.equal(opsState().runs.backup.code, 'wrong-environment');
  });

  it('le contenu d’une demande invalide n’est jamais recopié dans l’état publié', () => {
    drop(request({ requestedBy: 'secret-token-XYZ', extra: 1 }));
    run();
    assert.ok(!readFileSync(path.join(base, 'state', 'ops.json'), 'utf8').includes('secret-token-XYZ'));
  });

  it('un fichier temporaire récent est laissé, un vieux est retiré', () => {
    const fresh = path.join(base, 'requests', `.${ID_A}.json.tmp`);
    const stale = path.join(base, 'requests', `.${ID_B}.json.tmp`);
    writeFileSync(fresh, '{}');
    writeFileSync(stale, '{}');
    const old = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(stale, old, old);
    run();
    assert.deepEqual(readdirSync(path.join(base, 'requests')), [`.${ID_A}.json.tmp`]);
    assert.deepEqual(calls(), []);
  });
});

describe('docker-df et init', () => {
  it('publie l’usage Docker à la forme du contrat', () => {
    const result = run('docker-df');
    assert.equal(result.status, 0, result.stderr);
    const usage = JSON.parse(readFileSync(path.join(base, 'state', 'docker.json'), 'utf8'));
    assert.deepEqual(usage, {
      measuredAt: NOW,
      images: { count: 64, activeCount: 20, totalBytes: 64_630_000_000, reclaimableBytes: 18_100_000_000 },
      buildCache: { totalBytes: 0, reclaimableBytes: 0 },
      volumes: { count: 87, totalBytes: 160_400_000_000, reclaimableBytes: 10_510_000_000 },
    });
  });

  it('init pose un état vide sans écraser un état existant', () => {
    run('init');
    assert.deepEqual(opsState(), {
      v: 1,
      runs: { backup: null, 'image-prune': null },
      lastAcceptedAt: { backup: null, 'image-prune': null },
    });
    drop(request());
    run();
    run('init');
    assert.equal(opsState().runs.backup.status, 'succeeded');
  });

  it('refuse un environnement ou une commande inconnus', () => {
    const result = spawnSync('python3', ['-I', RUNNER, 'shell', 'staging'], { env, encoding: 'utf8' });
    assert.equal(result.status, 2);
    const other = spawnSync('python3', ['-I', RUNNER, 'process', 'qa'], { env, encoding: 'utf8' });
    assert.equal(other.status, 2);
  });
});
