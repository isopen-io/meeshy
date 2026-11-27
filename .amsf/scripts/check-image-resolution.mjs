#!/usr/bin/env node
// Ce que l'image d'un service RÉSOUT, comparé aux épingles `overrides` de la racine (#20730).
//
// Les Dockerfiles de la passerelle, de l'agent et du web fabriquent un mini-workspace
// (le manifeste du service + packages/shared) et installent sans lockfile. Ce script rejoue
// cette installation dans un dossier temporaire et compare, pour chaque paquet épinglé à la
// racine, la version résolue à l'épingle. Il sort 1 dès qu'une version diverge.
//
// Usage :
//   node .amsf/scripts/check-image-resolution.mjs gateway
//   BUN=/chemin/vers/bun node .amsf/scripts/check-image-resolution.mjs agent web
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUN = process.env.BUN ?? 'bun';

const IMAGES = {
  gateway: { manifest: 'services/gateway/package.json', workspaces: ['packages/shared'] },
  agent: { manifest: 'services/agent/package.json', workspaces: ['packages/shared'] },
  web: { manifest: 'apps/web/package.json', workspaces: ['packages/design-tokens', 'packages/shared'] },
};

const tracked = (dir) =>
  execFileSync('git', ['ls-files', '--', dir], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);

const stage = (image) => {
  const { manifest, workspaces } = IMAGES[image];
  const dir = mkdtempSync(join(tmpdir(), `amsf-image-${image}-`));
  const pkg = JSON.parse(readFileSync(join(ROOT, manifest), 'utf8'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, workspaces }, null, 2));
  workspaces
    .flatMap(tracked)
    .filter((file) => existsSync(join(ROOT, file)))
    .forEach((file) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      cpSync(join(ROOT, file), join(dir, file));
    });
  return dir;
};

const resolved = (dir) => {
  const store = join(dir, 'node_modules', '.bun');
  const entries = existsSync(store) ? readdirSync(store) : [];
  return entries.reduce((versions, entry) => {
    const match = entry.match(/^(.+)@(\d[^+]*)/);
    if (!match) return versions;
    const name = match[1].replace('+', '/');
    return { ...versions, [name]: [...new Set([...(versions[name] ?? []), match[2]])].sort() };
  }, {});
};

const pins = Object.entries(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).overrides ?? {}).filter(
  ([name, version]) => !name.includes('@', 1) && /^\d/.test(version),
);

const check = (image) => {
  const dir = stage(image);
  try {
    execFileSync(BUN, ['install', '--no-save', '--ignore-scripts'], { cwd: dir, stdio: 'ignore' });
    const versions = resolved(dir);
    return pins
      .filter(([name]) => versions[name] !== undefined)
      .map(([name, pin]) => ({ image, name, pin, resolved: versions[name] }))
      .filter(({ pin, resolved: found }) => found.some((version) => version !== pin));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const requested = process.argv.slice(2);
const unknown = requested.filter((image) => !(image in IMAGES));
if (requested.length === 0 || unknown.length > 0) {
  console.error(`usage: check-image-resolution.mjs <${Object.keys(IMAGES).join('|')}>…`);
  process.exit(2);
}

const drift = requested.flatMap(check);
drift.forEach(({ image, name, pin, resolved: found }) =>
  console.log(`${image}\t${name}\tépingle ${pin}\timage ${found.join(', ')}`),
);
console.log(drift.length === 0 ? 'Aucun écart : les images résolvent les épingles racine.' : `${drift.length} écart(s).`);
process.exit(drift.length === 0 ? 0 : 1);
