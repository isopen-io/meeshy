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
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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
// La purge n'est permise que de 02:00 à 06:00, heure de Paris (#11452) : NOW tombe à
// minuit à Paris, NIGHT à 03:00 (heure d'été, UTC+2).
const NIGHT = '2026-10-13T01:00:00.000Z';

const FAKES = {
  docker: `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
if [[ "$1" == "ps" ]]; then
  [[ "\${FAKE_FAIL:-}" == containers ]] && exit 1
  [[ -n "\${FAKE_PS:-}" ]] && cat "$FAKE_PS"
  exit 0
fi
if [[ "$1" == "inspect" ]]; then [[ "\${FAKE_INSPECT_EMPTY:-}" == 1 ]] || cat "$FAKE_INSPECT"; exit "\${FAKE_INSPECT_EXIT:-0}"; fi
if [[ "$1 $2" == "image inspect" ]]; then [[ -n "\${FAKE_IMAGES:-}" ]] && cat "$FAKE_IMAGES"; exit "\${FAKE_IMAGES_EXIT:-0}"; fi
if [[ "$1" == "stats" ]]; then cat "$FAKE_STATS"; exit "\${FAKE_STATS_EXIT:-0}"; fi
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

const prune = (overrides = {}) => request({ action: 'image-prune', requestedAt: NIGHT, ...overrides });

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
    OPS_PROMOTION_LOCK: path.join(root, 'meeshy-promotion.lock'),
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
    assert.deepEqual(calls(), ['systemctl start --wait meeshy-staging-backup@on-demand.service']);
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
    drop(request({ id: ID_B, requestedAt: '2026-10-13T03:58:00.000Z' }));
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
    drop(prune());
    run('process', { OPS_NOW: NIGHT });
    const log = calls();
    assert.deepEqual(log.slice(0, 3), [
      'docker image prune -f',
      'docker image prune -af --filter until=168h',
      'docker builder prune -f',
    ]);
    assert.ok(!log.some((line) => /volume|system prune|container prune|--volumes|^docker (container )?rmi? /.test(line)));
    const state = opsState();
    assert.equal(state.runs['image-prune'].status, 'succeeded');
    assert.equal(state.runs['image-prune'].reclaimedBytes, 1_500_000_000 + 512_000_000);
    assert.ok(existsSync(path.join(base, 'state', 'docker.json')));
  });

  it('la liste blanche ne connaît ni container prune, ni system prune, ni rm : l’épingle de retour arrière de la production est un conteneur arrêté (#11452)', () => {
    const listed = spawnSync('python3', ['-I', '-c', `import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('runner', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps([list(command) for command in module.PRUNE_COMMANDS]))`, RUNNER], { encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    const commands = JSON.parse(listed.stdout);
    assert.ok(commands.length > 0);
    for (const command of commands) {
      assert.equal(command[0], 'docker', command.join(' '));
      assert.ok(['image', 'builder'].includes(command[1]), command.join(' '));
      assert.equal(command[2], 'prune', command.join(' '));
      assert.ok(!command.some((word) => /^(rm|rmi|container|system|volume)$/.test(word) || /--volumes/.test(word)), command.join(' '));
    }
  });

  it('une purge en échec est publiée en échec', () => {
    drop(prune());
    run('process', { FAKE_FAIL: 'prune', OPS_NOW: NIGHT });
    assert.equal(opsState().runs['image-prune'].status, 'failed');
    assert.equal(opsState().runs['image-prune'].code, 'prune-failed');
  });
});

describe('la purge et la promotion de la production partagent l’hôte', () => {
  const holdLock = async (file) => {
    const holder = spawn('python3', ['-I', '-c', `import fcntl,sys,time
f=open(sys.argv[1],'a')
fcntl.flock(f, fcntl.LOCK_EX)
print('held', flush=True)
time.sleep(30)`, file], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve) => holder.stdout.once('data', resolve));
    return holder;
  };

  it('n’efface aucune image tant qu’une promotion tient son verrou : la purge échoue sous une clé fixe', async () => {
    const holder = await holdLock(env.OPS_PROMOTION_LOCK);
    try {
      drop(prune());
      const result = run('process', { OPS_PROMOTION_LOCK_WAIT: '1', OPS_NOW: NIGHT });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(calls().filter((call) => call.includes('prune')).length, 0);
      const state = opsState();
      assert.equal(state.runs['image-prune'].status, 'failed');
      assert.equal(state.runs['image-prune'].code, 'promotion-in-progress');
    } finally {
      holder.kill();
    }
  });

  it('purge sous le verrou de promotion quand personne ne le tient', () => {
    drop(prune());
    const result = run('process', { OPS_NOW: NIGHT });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(opsState().runs['image-prune'].status, 'succeeded');
    assert.ok(existsSync(env.OPS_PROMOTION_LOCK));
  });
});

describe('la purge n’est permise qu’aux heures creuses : de 02:00 à 06:00, heure de Paris (#11452)', () => {
  it('la fenêtre et le délai d’attente du runner sont ceux de la passerelle (packages/shared, confrontés)', () => {
    // Sans ce témoin, changer la fenêtre d'un seul côté laisse tous les tests verts, et
    // le runner refuse en silence ce que la passerelle accepte (audit de #12743).
    const python = spawnSync(
      'python3',
      ['-I', '-c', 'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("r", sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps({"windows": {k: list(v) for k, v in m.WINDOWS.items()}, "cooldownSeconds": m.COOLDOWN_SECONDS}))', RUNNER],
      { encoding: 'utf8' },
    );
    assert.equal(python.status, 0, python.stderr);
    const typescript = spawnSync(
      'bun',
      ['-e', `import { SERVER_OPERATIONS, SERVER_OPERATION_WINDOWS, SERVER_OPERATION_COOLDOWN_MS } from '${path.join(here, '../../../packages/shared/types/admin-ops.ts')}'; const windows = {}; const cooldownSeconds = {}; for (const op of SERVER_OPERATIONS) { const w = SERVER_OPERATION_WINDOWS[op]; if (w) windows[op] = [w.timeZone, w.startHour, w.endHour]; cooldownSeconds[op] = SERVER_OPERATION_COOLDOWN_MS[op] / 1000; } console.log(JSON.stringify({ windows, cooldownSeconds }));`],
      { encoding: 'utf8' },
    );
    // En CI, bun est installé : son absence y est un échec, jamais un témoin sauté.
    if (typescript.error?.code === 'ENOENT' && !process.env.CI) return;
    assert.equal(typescript.status, 0, typescript.stdout + typescript.stderr);
    assert.deepEqual(JSON.parse(python.stdout), JSON.parse(typescript.stdout));
  });

  const pruned = () => calls().some((call) => call.includes('prune'));
  const outcome = ({ requestedAt, at }) => {
    rmSync(path.join(base, 'state'), { recursive: true, force: true });
    rmSync(env.FAKE_LOG, { force: true });
    drop(prune({ requestedAt }));
    const result = run('process', { OPS_NOW: at });
    assert.equal(result.status, 0, result.stderr);
    const state = opsState();
    return { status: state.runs['image-prune'].status, code: state.runs['image-prune'].code, pruned: pruned(), accepted: state.lastAcceptedAt['image-prune'] };
  };

  it('dans la fenêtre, la purge part', () => {
    assert.equal(outcome({ requestedAt: NIGHT, at: NIGHT }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-13T00:00:00.000Z', at: '2026-10-13T00:00:00.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-13T03:59:59.000Z', at: '2026-10-13T03:59:59.000Z' }).status, 'succeeded');
  });

  it('hors fenêtre, la demande est refusée, archivée dans rejected/ et nommée, sans rien purger ni armer le délai — une passerelle ancienne qui ignore la fenêtre est arrêtée ici', () => {
    drop(prune({ requestedAt: NOW }));
    run();
    assert.deepEqual(readdirSync(path.join(base, 'requests')), []);
    assert.equal(readdirSync(path.join(base, 'rejected')).length, 1);
    assert.equal(existsSync(path.join(base, 'done')), false);
    assert.deepEqual(calls(), []);
    assert.equal(opsState().runs['image-prune'].status, 'rejected');
    assert.equal(opsState().runs['image-prune'].code, 'outside-window');
    assert.equal(opsState().lastAcceptedAt['image-prune'], null);

    assert.deepEqual(outcome({ requestedAt: '2026-10-12T23:59:59.000Z', at: '2026-10-12T23:59:59.000Z' }), { status: 'rejected', code: 'outside-window', pruned: false, accepted: null });
    assert.equal(outcome({ requestedAt: '2026-10-13T04:00:00.000Z', at: '2026-10-13T04:00:00.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-10-13T12:00:00.000Z', at: '2026-10-13T12:00:00.000Z' }).code, 'outside-window');
  });

  it('une demande datée dans la fenêtre garde dix minutes de tolérance après 06:00 ; une demande datée après 06:00 n’en a aucune', () => {
    assert.equal(outcome({ requestedAt: '2026-10-13T03:59:58.000Z', at: '2026-10-13T04:00:30.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-13T03:59:58.000Z', at: '2026-10-13T04:10:00.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-13T03:59:58.000Z', at: '2026-10-13T04:10:01.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-10-13T04:00:01.000Z', at: '2026-10-13T04:00:30.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-10-12T23:59:00.000Z', at: '2026-10-13T00:01:00.000Z' }).status, 'succeeded', 'traitée dans la fenêtre, elle part');
  });

  it('une demande datée dans le futur n’ouvre jamais la fenêtre avant 02:00 (audit de #12743)', () => {
    assert.equal(outcome({ requestedAt: '2026-10-13T00:04:59.000Z', at: '2026-10-12T23:59:59.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-10-13T00:00:00.000Z', at: '2026-10-12T23:55:00.000Z' }).code, 'outside-window');
  });

  it('passage à l’heure d’été (dimanche 29 mars 2026, 02:00 → 03:00) : la fenêtre va de 01:00 à 04:00 UTC', () => {
    assert.equal(outcome({ requestedAt: '2026-03-29T00:59:59.000Z', at: '2026-03-29T00:59:59.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-03-29T01:00:00.000Z', at: '2026-03-29T01:00:00.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-03-29T03:59:59.000Z', at: '2026-03-29T03:59:59.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-03-29T04:00:00.000Z', at: '2026-03-29T04:00:00.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-03-28T04:30:00.000Z', at: '2026-03-28T04:30:00.000Z' }).status, 'succeeded', 'la veille, à l’heure d’hiver, 05:30 à Paris');
    assert.equal(outcome({ requestedAt: '2026-03-28T05:00:00.000Z', at: '2026-03-28T05:00:00.000Z' }).code, 'outside-window');
  });

  it('retour à l’heure d’hiver (dimanche 25 octobre 2026, 03:00 → 02:00) : la fenêtre va de 00:00 à 05:00 UTC, l’heure de 02:00 vécue deux fois', () => {
    assert.equal(outcome({ requestedAt: '2026-10-24T23:59:59.000Z', at: '2026-10-24T23:59:59.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-10-25T00:00:00.000Z', at: '2026-10-25T00:00:00.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-25T01:30:00.000Z', at: '2026-10-25T01:30:00.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-25T04:59:59.000Z', at: '2026-10-25T04:59:59.000Z' }).status, 'succeeded');
    assert.equal(outcome({ requestedAt: '2026-10-25T05:00:00.000Z', at: '2026-10-25T05:00:00.000Z' }).code, 'outside-window');
    assert.equal(outcome({ requestedAt: '2026-10-25T04:59:58.000Z', at: '2026-10-25T05:10:00.000Z' }).status, 'succeeded', 'la tolérance suit la fermeture de 06:00 CET');
    assert.equal(outcome({ requestedAt: '2026-10-25T04:59:58.000Z', at: '2026-10-25T05:10:01.000Z' }).code, 'outside-window');
  });

  it('la sauvegarde n’a pas de fenêtre : elle part à minuit à Paris', () => {
    drop(request({ requestedAt: NOW }));
    run();
    assert.equal(opsState().runs.backup.status, 'succeeded');
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

  it('une demande REMPLACÉE par une FIFO entre lstat et open ne bloque jamais le runner : refusée, sans rien exécuter (#10459 point 2)', () => {
    const fifo = path.join(base, 'requests', `${ID_A}.json`);
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    const small = path.join(root, 'petit.json');
    writeFileSync(small, JSON.stringify(request()));
    // Une passerelle compromise (uid 1001) qui échange le fichier contre une FIFO
    // APRÈS le lstat : on rejoue la course en faisant mentir lstat, pas open.
    const result = spawnSync('python3', ['-I', '-c', `import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('runner', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
regular = os.lstat(sys.argv[3])
module.os.lstat = lambda _path: regular
state = module.empty_state()
module.handle_request(module.Paths('staging'), 'staging', os.path.basename(sys.argv[2]), state)
`, RUNNER, fifo, small], { env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.signal, null, 'le runner a bloqué sur la FIFO');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /not-regular-file/);
    assert.deepEqual(readdirSync(path.join(base, 'requests')), []);
    assert.equal(readdirSync(path.join(base, 'rejected')).length, 1);
    assert.deepEqual(calls(), []);
  });

  it('une demande plus vieille que l’horizon (2 h) ou datée du futur est refusée et nommée : un runner réveillé tard n’exécute pas un geste que personne ne tient plus (#10459)', () => {
    drop(request({ requestedAt: '2026-10-12T19:59:59.000Z' }));
    run();
    refusedWithoutEffect();
    assert.equal(opsState().runs.backup.status, 'rejected');
    assert.equal(opsState().runs.backup.code, 'stale-request');
    assert.equal(opsState().lastAcceptedAt.backup, null);

    drop(request({ id: ID_B, requestedAt: '2026-10-12T22:06:00.000Z' }));
    run();
    assert.deepEqual(calls(), []);
    assert.equal(opsState().runs.backup.code, 'future-request');

    drop(request({ id: ID_B, requestedAt: '2026-10-12T20:00:01.000Z' }));
    run();
    assert.equal(opsState().runs.backup.status, 'succeeded');
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

describe('docker-df publie les conteneurs de SON environnement (#11441)', () => {
  const GATEWAY_ID = 'a'.repeat(64);
  const MONGO_ID = 'b'.repeat(64);
  const SECRET = 'JWT_SECRET=ne-doit-jamais-sortir';
  const WORKING_DIR = 'com.docker.compose.project.working_dir';

  const inspect = () => [
    {
      Id: GATEWAY_ID,
      Name: '/meeshy-gateway-staging',
      Image: 'sha256:3f1c2a9e8b7d6c5b4a3f1c2a9e8b7d6c5b4a3f1c2a9e8b7d6c5b4a3f1c2a9e8b',
      RestartCount: 2,
      State: {
        Status: 'running',
        ExitCode: 0,
        StartedAt: '2026-10-11T20:00:00.123456789Z',
        FinishedAt: '0001-01-01T00:00:00Z',
        Health: { Status: 'healthy' },
      },
      Config: {
        Image: 'isopen/meeshy-gateway:dev',
        Env: [SECRET],
        Cmd: ['node', 'server.js'],
        Labels: { 'com.docker.compose.service': 'gateway-staging', [WORKING_DIR]: '/opt/meeshy/staging', 'traefik.http.routers.x.rule': 'Host(`secret`)' },
      },
      HostConfig: { Memory: 2147483648 },
      Mounts: [{ Source: '/opt/meeshy/staging/.env' }],
      NetworkSettings: {
        Networks: { 'meeshy-staging-network': { IPAddress: '172.20.0.5' } },
        Ports: { '3000/tcp': null, '443/tcp': [{ HostIp: '0.0.0.0', HostPort: '8443' }, { HostIp: '::', HostPort: '8443' }] },
      },
    },
    {
      Id: MONGO_ID,
      Name: '/meeshy-database-staging',
      Image: 'sha256:9e8b7d6c5b4a3f1c2a9e8b7d6c5b4a3f1c2a9e8b7d6c5b4a3f1c2a9e8b7d6c5b',
      RestartCount: 0,
      State: { Status: 'exited', ExitCode: 137, StartedAt: '2026-10-10T08:00:00Z', FinishedAt: '2026-10-12T21:00:00.5Z' },
      Config: { Image: 'mongo:8.0', Env: [], Labels: { 'com.docker.compose.service': 'database-staging', [WORKING_DIR]: '/opt/meeshy/staging' } },
      HostConfig: { Memory: 0 },
      NetworkSettings: { Networks: { 'meeshy-staging-network': { IPAddress: '' } }, Ports: {} },
    },
  ];
  const images = () => [
    { Id: 'sha256:3f1c2a9e8b7d6c5b4a3f1c2a9e8b7d6c5b4a3f1c2a9e8b7d6c5b4a3f1c2a9e8b', Created: '2026-10-11T19:40:00.987654321Z' },
  ];
  const stats = () =>
    [{ ID: GATEWAY_ID, CPUPerc: '3.20%', MemUsage: '256MiB / 2GiB', NetIO: '1.2MB / 3.4MB', BlockIO: '0B / 4.1kB', PIDs: '24' }]
      .map((row) => JSON.stringify(row))
      .join('\n');

  const stage = (overrides = {}) => {
    const files = {
      FAKE_PS: path.join(root, 'ps.txt'),
      FAKE_INSPECT: path.join(root, 'inspect.json'),
      FAKE_IMAGES: path.join(root, 'images.json'),
      FAKE_STATS: path.join(root, 'stats.txt'),
    };
    writeFileSync(files.FAKE_PS, overrides.ps ?? `${GATEWAY_ID}\n${MONGO_ID}\n`);
    writeFileSync(files.FAKE_INSPECT, JSON.stringify(overrides.inspect ?? inspect()));
    writeFileSync(files.FAKE_IMAGES, JSON.stringify(images()));
    writeFileSync(files.FAKE_STATS, overrides.stats ?? stats());
    return files;
  };
  const published = () => JSON.parse(readFileSync(path.join(base, 'state', 'containers.json'), 'utf8'));

  it('ne demande que les conteneurs du projet compose de l’environnement (staging ne voit pas la production)', () => {
    const result = run('docker-df', stage());
    assert.equal(result.status, 0, result.stderr);
    const ps = calls().find((line) => line.startsWith('docker ps'));
    assert.equal(ps, 'docker ps -a -q --no-trunc --filter label=com.docker.compose.project.working_dir=/opt/meeshy/staging');
  });

  it('publie chaque conteneur à la forme du contrat : image et sa date, état, santé, démarrage, consommation, réseaux, ports', () => {
    run('docker-df', stage());
    assert.deepEqual(published(), {
      measuredAt: NOW,
      containers: [
        {
          name: 'meeshy-database-staging',
          service: 'database-staging',
          image: 'mongo:8.0',
          imageId: '9e8b7d6c5b4a',
          imageCreatedAt: null,
          state: 'exited',
          health: 'none',
          startedAt: '2026-10-10T08:00:00.000Z',
          finishedAt: '2026-10-12T21:00:00.500Z',
          restartCount: 0,
          exitCode: 137,
          stats: null,
          networks: [{ name: 'meeshy-staging-network', ipAddress: '' }],
          ports: [],
        },
        {
          name: 'meeshy-gateway-staging',
          service: 'gateway-staging',
          image: 'isopen/meeshy-gateway:dev',
          imageId: '3f1c2a9e8b7d',
          imageCreatedAt: '2026-10-11T19:40:00.987Z',
          state: 'running',
          health: 'healthy',
          startedAt: '2026-10-11T20:00:00.123Z',
          finishedAt: null,
          restartCount: 2,
          exitCode: 0,
          stats: {
            cpuPercent: 3.2,
            memoryUsedBytes: 268_435_456,
            memoryLimitBytes: 2_147_483_648,
            netRxBytes: 1_200_000,
            netTxBytes: 3_400_000,
            blockReadBytes: 0,
            blockWriteBytes: 4_100,
            pids: 24,
          },
          networks: [{ name: 'meeshy-staging-network', ipAddress: '172.20.0.5' }],
          ports: [
            { containerPort: 3000, protocol: 'tcp', hostIp: null, hostPort: null },
            { containerPort: 443, protocol: 'tcp', hostIp: '0.0.0.0', hostPort: 8443 },
          ],
        },
      ],
    });
  });

  it('ne publie AUCUN secret : ni variable d’environnement, ni label, ni commande, ni montage', () => {
    run('docker-df', stage());
    const raw = readFileSync(path.join(base, 'state', 'containers.json'), 'utf8');
    for (const leak of ['JWT_SECRET', 'ne-doit-jamais-sortir', 'traefik', 'server.js', '.env', 'Mounts', 'Env']) {
      assert.equal(raw.includes(leak), false, `« ${leak} » a traversé`);
    }
  });

  it('un échec de la collecte des conteneurs ne retient pas l’usage Docker, et garde la dernière publication', () => {
    run('docker-df', stage());
    const before = readFileSync(path.join(base, 'state', 'containers.json'), 'utf8');
    const result = run('docker-df', { ...stage(), FAKE_FAIL: 'containers' });
    assert.equal(result.status, 1);
    assert.ok(existsSync(path.join(base, 'state', 'docker.json')));
    assert.equal(readFileSync(path.join(base, 'state', 'containers.json'), 'utf8'), before);
  });

  it('une image disparue (inspect partiel, code 1) laisse sa date à null sans perdre les autres', () => {
    run('docker-df', { ...stage(), FAKE_IMAGES_EXIT: '1' });
    const gateway = published().containers.find((c) => c.name === 'meeshy-gateway-staging');
    assert.equal(gateway.imageCreatedAt, '2026-10-11T19:40:00.987Z');
  });

  it('un état inconnu de Docker ou un nom démesuré ne fait pas rejeter le fichier par la passerelle', () => {
    const odd = inspect();
    odd[0].State.Status = 'zombie';
    odd[0].Name = `/${'x'.repeat(300)}`;
    run('docker-df', stage({ inspect: odd }));
    const first = published().containers.find((c) => c.service === 'gateway-staging');
    assert.equal(first.state, 'dead');
    assert.equal(first.name.length, 128);
  });

  it('la publication passe le schéma partagé que la passerelle applique (les deux productions, confrontées)', () => {
    run('docker-df', stage());
    const check = spawnSync(
      'bun',
      ['-e', `import { opsContainersFileSchema } from '${path.join(here, '../../../packages/shared/types/admin-ops-containers.ts')}'; const r = opsContainersFileSchema.safeParse(JSON.parse(await Bun.file(process.argv[1]).text())); console.log(r.success ? 'OK' : JSON.stringify(r.error.issues)); process.exit(r.success ? 0 : 1);`, path.join(base, 'state', 'containers.json')],
      { encoding: 'utf8' },
    );
    // En CI, bun est installé : son absence y est un échec, jamais un témoin sauté.
    if (check.error?.code === 'ENOENT' && !process.env.CI) return;
    assert.equal(check.error, undefined, String(check.error));
    assert.equal(check.status, 0, check.stdout + check.stderr);
  });

  it('revérifie l’étiquette de CHAQUE conteneur : un conteneur de la production rendu par ps n’est jamais publié', () => {
    const PROD_ID = 'c'.repeat(64);
    const mixed = [
      ...inspect(),
      {
        Id: PROD_ID,
        Name: '/meeshy-gateway',
        Image: 'sha256:' + 'd'.repeat(64),
        State: { Status: 'running', StartedAt: '2026-10-01T00:00:00Z' },
        Config: { Image: 'isopen/meeshy-gateway:prod', Labels: { 'com.docker.compose.service': 'gateway', [WORKING_DIR]: '/opt/meeshy/production' } },
        NetworkSettings: { Networks: { 'meeshy_meeshy-network': { IPAddress: '172.18.0.9' } }, Ports: {} },
      },
    ];
    run('docker-df', stage({ ps: `${GATEWAY_ID}\n${MONGO_ID}\n${PROD_ID}\n`, inspect: mixed }));
    assert.deepEqual(published().containers.map((c) => c.name), ['meeshy-database-staging', 'meeshy-gateway-staging']);
    assert.equal(calls().find((line) => line.startsWith('docker stats')).includes(PROD_ID), false);
  });

  it('un conteneur retiré entre ps et inspect (code 1) ou des stats illisibles ne perdent pas les autres', () => {
    const result = run('docker-df', { ...stage({ stats: `pas du json\n${stats()}\n` }), FAKE_INSPECT_EXIT: '1', FAKE_STATS_EXIT: '1' });
    assert.equal(result.status, 0, result.stderr);
    const gateway = published().containers.find((c) => c.name === 'meeshy-gateway-staging');
    assert.equal(gateway.stats.pids, 24);
  });

  it('un inspect en échec qui n’imprime rien garde la dernière publication (jamais une liste vidée)', () => {
    run('docker-df', stage());
    const before = readFileSync(path.join(base, 'state', 'containers.json'), 'utf8');
    const result = run('docker-df', { ...stage(), FAKE_INSPECT_EXIT: '1', FAKE_INSPECT_EMPTY: '1' });
    assert.equal(result.status, 1);
    assert.equal(readFileSync(path.join(base, 'state', 'containers.json'), 'utf8'), before);
  });

  it('reste sous le plafond de lecture de la passerelle (256 Ko), même à 64 conteneurs pleins', () => {
    const ports = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${10000 + i}/tcp`, [{ HostIp: '0'.repeat(64), HostPort: String(20000 + i) }]]));
    const networks = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${'n'.repeat(120)}${i}`, { IPAddress: 'f'.repeat(64) }]));
    const many = Array.from({ length: 64 }, (_, i) => ({
      Id: String(i).padStart(64, '0'),
      Name: `/${'x'.repeat(120)}${String(i).padStart(3, '0')}`,
      Image: 'sha256:' + 'e'.repeat(64),
      State: { Status: 'exited', ExitCode: 0, StartedAt: '2026-10-01T00:00:00Z', FinishedAt: '2026-10-02T00:00:00Z' },
      Config: { Image: 'i'.repeat(300), Labels: { 'com.docker.compose.service': 's'.repeat(200), [WORKING_DIR]: '/opt/meeshy/staging' } },
      NetworkSettings: { Networks: networks, Ports: ports },
    }));
    const result = run('docker-df', stage({ ps: many.map((c) => c.Id).join('\n'), inspect: many }));
    assert.equal(result.status, 0, result.stderr);
    const size = statSync(path.join(base, 'state', 'containers.json')).size;
    assert.ok(size <= 256 * 1024, `containers.json pèse ${size} octets`);
    assert.ok(published().containers.length > 0);
  });

  it('sans aucun conteneur, la liste est vide et la commande réussit', () => {
    const result = run('docker-df');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(published(), { measuredAt: NOW, containers: [] });
  });
});
