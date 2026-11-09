// packages/shared/__tests__/ci/libsignal-version-alignment.test.ts
//
// #17113 — un message scellé par libsignal sur une plateforme ne s'ouvre sur
// les autres que si toutes parlent la même version. Les quatre déclarations du
// dépôt (passerelle, shared, iOS, Android) et les vecteurs croisés qu'elles
// rejouent portent donc UNE version, épinglée à l'octet : une montée de l'une
// sans les autres rougit ici, sur la suite `shared` qui tourne à chaque PR.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');

type Manifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const npmPin = (path: string): string | undefined => {
  const manifest = JSON.parse(read(path)) as Manifest;
  return manifest.dependencies?.['@signalapp/libsignal-client'] ?? manifest.optionalDependencies?.['@signalapp/libsignal-client'];
};

const gradlePin = (): string | undefined => read('apps/android/gradle/libs.versions.toml').match(/^libsignal\s*=\s*"([^"]+)"/m)?.[1];

const declarations = (): Record<string, string | undefined> => ({
  'services/gateway/package.json': npmPin('services/gateway/package.json'),
  'packages/shared/package.json': npmPin('packages/shared/package.json'),
  'packages/LibSignalClient/LIBSIGNAL_VERSION': read('packages/LibSignalClient/LIBSIGNAL_VERSION').trim().replace(/^v/, ''),
  'apps/android/gradle/libs.versions.toml': gradlePin(),
  'packages/shared/fixtures/libsignal/cross-platform.vectors.json': (
    JSON.parse(read('packages/shared/fixtures/libsignal/cross-platform.vectors.json')) as { libsignal: string }
  ).libsignal,
});

describe('libsignal — une seule version sur la passerelle, shared, iOS, Android et les vecteurs croisés (#17113)', () => {
  it('chaque déclaration est une version EXACTE, sans plage', () => {
    Object.entries(declarations()).forEach(([path, version]) => {
      expect({ path, version }).toEqual({ path, version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
    });
  });

  it('toutes les déclarations portent la même version', () => {
    const versions = declarations();
    const reference = versions['packages/LibSignalClient/LIBSIGNAL_VERSION'];
    expect(versions).toEqual(Object.fromEntries(Object.keys(versions).map((path) => [path, reference])));
  });
});

const LIBSIGNAL_NPM_DIRECTORIES = ['/', '/services/gateway', '/packages/shared'] as const;

type DependabotEntry = { ecosystem: string; directory: string; body: string };

const dependabotEntries = (): readonly DependabotEntry[] =>
  read('.github/dependabot.yml')
    .split(/^ {2}- package-ecosystem:/m)
    .slice(1)
    .map((body) => ({
      ecosystem: body.match(/^\s*"([^"]+)"/)?.[1] ?? '',
      directory: body.match(/^ {4}directory:\s*"([^"]+)"/m)?.[1] ?? '',
      body,
    }));

const libsignalIgnoreRule = (body: string): string | undefined =>
  body.match(/^ {6}- dependency-name:\s*"@signalapp\/libsignal-client"\n(?: {8}\S.*\n)*/m)?.[0];

describe('libsignal — Dependabot ne monte jamais une seule plateforme (#17113)', () => {
  it('chaque entrée npm qui voit libsignal l\'exclut entièrement, correctifs compris', () => {
    const entries = dependabotEntries().filter(
      ({ ecosystem, directory }) => ecosystem === 'npm' && (LIBSIGNAL_NPM_DIRECTORIES as readonly string[]).includes(directory),
    );
    expect(entries.map(({ directory }) => directory).sort()).toEqual([...LIBSIGNAL_NPM_DIRECTORIES].sort());
    entries.forEach(({ directory, body }) => {
      expect({ directory, rule: libsignalIgnoreRule(body) }).toEqual({
        directory,
        rule: '      - dependency-name: "@signalapp/libsignal-client"\n',
      });
    });
  });
});
