import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-lockfile-alignment.mjs');

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
};

const misalignedRepository = () => {
  const root = mkdtempSync(join(tmpdir(), 'lockfile-alignment-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(SCRIPT, join(root, 'scripts', 'check-lockfile-alignment.mjs'));
  writeJson(join(root, 'package.json'), { name: 'sonde', workspaces: ['apps/*'] });
  writeJson(join(root, 'apps', 'web', 'package.json'), {
    name: '@sonde/web',
    version: '1.0.0',
    dependencies: { 'left-pad': '^1.3.0' },
  });
  writeJson(join(root, 'bun.lock'), {
    lockfileVersion: 1,
    workspaces: { '': { name: 'sonde' }, 'apps/web': { name: '@sonde/web', dependencies: {} } },
    packages: {},
  });
  writeFileSync(
    join(root, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\n\nimporters:\n\n  apps/web:\n    dependencies:\n      other:\n        specifier: ^1.0.0\n        version: 1.0.0\n",
  );
  return root;
};

const run = (root, ...args) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'check-lockfile-alignment.mjs'), ...args], {
    encoding: 'utf8',
  });

test("le self-test reste vert quand le dépôt est désaligné : il juge le vérificateur, pas le dépôt", () => {
  const root = misalignedRepository();
  try {
    const selfTest = run(root, '--self-test');
    assert.equal(selfTest.status, 0, selfTest.stderr);
    assert.match(selfTest.stdout, /self-test : \d+\/\d+ sondes correctes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('le run réel, lui, rougit sur ce même dépôt désaligné et nomme le désalignement', () => {
  const root = misalignedRepository();
  try {
    const real = run(root);
    assert.equal(real.status, 1);
    assert.match(real.stderr, /left-pad/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const withMutatedVerifier = (search, replacement, assertOn) => {
  const root = misalignedRepository();
  const copy = join(root, 'scripts', 'check-lockfile-alignment.mjs');
  const source = readFileSync(copy, 'utf8');
  assert.ok(source.includes(search), `mutation introuvable : ${search}`);
  writeFileSync(copy, source.replace(search, replacement));
  try {
    assertOn(run(root, '--self-test'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('le self-test rougit quand le vérificateur compare de nouveau la version (sonde tolérée rendue bruyante)', () => {
  withMutatedVerifier("['name'].flatMap((field) =>", "['name', 'version'].flatMap((field) =>", (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /TROP STRICT/);
  });
});

test('le self-test rougit quand le vérificateur ne voit plus un workspace fantôme (sonde détectée rendue silencieuse)', () => {
  withMutatedVerifier('.filter((directory) => !onDisk.has(directory))', '.filter(() => false)', (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AVEUGLE : « un workspace loqué mais absent du disque »/);
  });
});
