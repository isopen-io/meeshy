// packages/shared/__tests__/ci/libsignal-version-alignment.test.ts
//
// #17113 — un message scellé par libsignal sur une plateforme ne s'ouvre sur
// les autres que si toutes parlent la même version. Les quatre déclarations du
// dépôt (passerelle, shared, iOS, Android) et les vecteurs croisés qu'elles
// rejouent portent donc UNE version, épinglée à l'octet : une montée de l'une
// sans les autres rougit ici, sur la suite `shared` qui tourne à chaque PR.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

const withoutSwiftComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const onlyOne = (values: readonly string[]): string | undefined =>
  values.length === 1 ? values[0] : `${values.length} occurrences : ${values.join(', ')}`;

const ffiReleaseVersion = (packageSwift: string): string | undefined =>
  onlyOne([...withoutSwiftComments(packageSwift).matchAll(/releases\/download\/libsignal-ffi-v([^/"]+)\//g)].map((match) => match[1]));

const ffiSymbolVersion = (ffiVersionSwift: string): string | undefined =>
  onlyOne(
    [...withoutSwiftComments(ffiVersionSwift).matchAll(/signal_ffi_version_(\w+?)\(/g)].map((match) => match[1].split('_').join('.')),
  );

const withoutTomlComments = (toml: string): string =>
  toml
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');

const tomlEntries = (toml: string): readonly string[] =>
  withoutTomlComments(toml)
    .split(/^(?=\s*\[)/m)
    .flatMap((section) =>
      /^\s*\[libraries\.[^\]]+\]/.test(section) ? [section] : section.split('\n').filter((line) => line.trim() !== ''),
    );

const SIGNAL_COORDINATE = /(["'])org\.signal(?::[^"']*)?\1/;
const LIBSIGNAL_REF = /^version\.ref\s*=\s*(["'])libsignal\1$/;

/** Les entrées du catalogue qui visent `org.signal` sans passer par `version.ref = "libsignal"`. */
const signalLibrariesOffTheRef = (toml: string): readonly string[] =>
  tomlEntries(toml)
    .filter((entry) => SIGNAL_COORDINATE.test(entry))
    .filter((entry) => {
      const versions = [...entry.matchAll(/\bversion(?:\.ref)?\s*=\s*(?:\{[^}]*\}|(["'])[^"']*\1)/g)].map((match) =>
        match[0].replace(/\s+/g, ' ').replace(/^version\.ref ?= ?/, 'version.ref = '),
      );
      return versions.length !== 1 || !LIBSIGNAL_REF.test(versions[0]);
    })
    .map((entry) => entry.trim());

const signalCoordinatesWithVersion = (source: string): readonly string[] =>
  [...source.matchAll(/(["'])org\.signal:[^"':]+:\d[^"']*\1/g)].map((match) => match[0]);

const gradleScripts = (directory: string): readonly string[] =>
  readdirSync(join(REPO, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return ['build', '.gradle', 'node_modules'].includes(entry.name) ? [] : gradleScripts(path);
    return entry.name.endsWith('.gradle.kts') ? [path] : [];
  });

const JVM_CHECK = 'apps/android/scripts/jvm-check/build.gradle.kts';

const gradlePin = (): string | undefined => read('apps/android/gradle/libs.versions.toml').match(/^libsignal\s*=\s*"([^"]+)"/m)?.[1];

const declarations = (): Record<string, string | undefined> => ({
  'services/gateway/package.json': npmPin('services/gateway/package.json'),
  'packages/shared/package.json': npmPin('packages/shared/package.json'),
  'packages/LibSignalClient/LIBSIGNAL_VERSION': read('packages/LibSignalClient/LIBSIGNAL_VERSION').trim().replace(/^v/, ''),
  'packages/LibSignalClient/Package.swift (release SignalFfi)': ffiReleaseVersion(read('packages/LibSignalClient/Package.swift')),
  'packages/LibSignalClient/Sources/LibSignalClient/FfiVersion.swift': ffiSymbolVersion(
    read('packages/LibSignalClient/Sources/LibSignalClient/FfiVersion.swift'),
  ),
  'apps/android/gradle/libs.versions.toml': gradlePin(),
  'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/licenses/LicenseNotice.kt': read(
    'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/licenses/LicenseNotice.kt',
  ).match(/VERSION: String = "([^"]+)"/)?.[1],
  [JVM_CHECK]: onlyOne(signalCoordinatesWithVersion(read(JVM_CHECK)).map((coordinate) => coordinate.split(':')[2].slice(0, -1))),
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

  it('toute bibliothèque org.signal du catalogue Gradle suit la version « libsignal », jamais une version en dur', () => {
    const toml = read('apps/android/gradle/libs.versions.toml');
    expect(tomlEntries(toml).filter((entry) => SIGNAL_COORDINATE.test(entry)).length).toBeGreaterThan(0);
    expect(signalLibrariesOffTheRef(toml)).toEqual([]);
  });

  it('aucun script Gradle d’Android ne déclare une dépendance org.signal en dur, hors du catalogue', () => {
    const offCatalog = gradleScripts('apps/android')
      .filter((path) => path !== JVM_CHECK)
      .flatMap((path) => signalCoordinatesWithVersion(read(path)).map((coordinate) => `${path} ${coordinate}`));
    expect(offCatalog).toEqual([]);
  });

  it('toutes les déclarations portent la même version', () => {
    const versions = declarations();
    const reference = versions['packages/LibSignalClient/LIBSIGNAL_VERSION'];
    expect(versions).toEqual(Object.fromEntries(Object.keys(versions).map((path) => [path, reference])));
  });
});

const CATALOG = 'libsignal-android = { module = "org.signal:libsignal-android", version.ref = "libsignal" }\n';

describe('libsignal — la garde voit les contournements connus (#17113, second audit)', () => {
  it.each([
    ['group et name', 'libsignal-client = { group = "org.signal", name = "libsignal-client", version = "0.105.4" }'],
    ['guillemets simples', "libsignal-client = { module = 'org.signal:libsignal-client', version = '0.105.4' }"],
    ['commentaire qui imite la référence', 'libsignal-client = { module = "org.signal:libsignal-client", version = "0.105.4" } # version.ref = "libsignal"'],
    ['autre clé de version', 'libsignal-client = { module = "org.signal:libsignal-client", version.ref = "libsignalOld" }'],
    ['table de version', 'libsignal-client = { module = "org.signal:libsignal-client", version = { strictly = "0.105.4" } }'],
    ['référence et version en dur', 'libsignal-client = { module = "org.signal:libsignal-client", version.ref = "libsignal", version = "0.105.4" }'],
    ['table sur plusieurs lignes', '[libraries.libsignal-client]\nmodule = "org.signal:libsignal-client"\nversion = "0.105.4"'],
  ])('catalogue Gradle : %s', (_label, entry) => {
    expect(signalLibrariesOffTheRef(`[libraries]\n${CATALOG}${entry}\n`)).toHaveLength(1);
  });

  it('catalogue Gradle : la forme du dépôt passe, guillemets simples compris', () => {
    expect(signalLibrariesOffTheRef(`[libraries]\n${CATALOG}libsignal-client = { module = 'org.signal:libsignal-client', version.ref = 'libsignal' }\n`)).toEqual([]);
  });

  it('Package.swift : une URL en commentaire avant la vraie ne la masque pas, et deux URL actives sont refusées', () => {
    const url = (version: string) => `url: "https://github.com/isopen-io/meeshy/releases/download/libsignal-ffi-v${version}/SignalFfi.xcframework.zip",`;
    expect(ffiReleaseVersion(`// ${url('0.106.2')}\n/* ${url('0.106.2')} */\n${url('0.106.1')}`)).toBe('0.106.1');
    expect(ffiReleaseVersion(`${url('0.106.2')}\n${url('0.106.1')}`)).not.toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('FfiVersion.swift : un symbole en commentaire ne masque pas le vrai, et deux symboles actifs sont refusés', () => {
    expect(ffiSymbolVersion('// signal_ffi_version_0_106_2()\nsignal_ffi_version_0_105_4()')).toBe('0.105.4');
    expect(ffiSymbolVersion('signal_ffi_version_0_106_2()\nsignal_ffi_version_0_105_4()')).not.toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('scripts Gradle : une coordonnée org.signal versionnée se voit, guillemets simples ou doubles', () => {
    expect(signalCoordinatesWithVersion('implementation("org.signal:libsignal-android:0.105.4")')).toHaveLength(1);
    expect(signalCoordinatesWithVersion("implementation('org.signal:libsignal-client:0.105.4')")).toHaveLength(1);
    expect(signalCoordinatesWithVersion('includeGroup("org.signal")')).toEqual([]);
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

  it('une entrée Gradle, si elle existe, exclut entièrement org.signal', () => {
    dependabotEntries()
      .filter(({ ecosystem }) => ecosystem === 'gradle')
      .forEach(({ directory, body }) => {
        expect({ directory, excludesSignal: /^ {6}- dependency-name:\s*"org\.signal:\*"\n(?! {8}update-types)/m.test(body) }).toEqual({
          directory,
          excludesSignal: true,
        });
      });
  });
});

const LEGACY = 'packages/shared/fixtures/libsignal/legacy';

const sealedBy = (path: string): string => (JSON.parse(read(path)) as { libsignal: string }).libsignal;

const legacyVersions = (): readonly string[] =>
  existsSync(join(REPO, LEGACY))
    ? readdirSync(join(REPO, LEGACY))
        .filter((name) => name.endsWith('.vectors.json'))
        .map((name) => sealedBy(`${LEGACY}/${name}`))
    : [];

const semver = (version: string): readonly number[] => version.split('.').map(Number);

const isOlder = (candidate: string, reference: string): boolean => {
  const [a, b] = [semver(candidate), semver(reference)];
  const index = a.findIndex((part, position) => part !== b[position]);
  return index !== -1 && a[index] < b[index];
};

describe('libsignal — une session persistée avant une montée survit à la montée (#9231)', () => {
  it('le jeu scellé en 0.105.4, la version des sessions déjà persistées, est gardé dans legacy/', () => {
    expect(legacyVersions()).toContain('0.105.4');
  });

  it('chaque jeu de legacy/ est scellé par une version ANTÉRIEURE à celle des vecteurs courants', () => {
    const current = sealedBy('packages/shared/fixtures/libsignal/cross-platform.vectors.json');
    legacyVersions().forEach((version) => {
      expect({ version, olderThanCurrent: isOlder(version, current) }).toEqual({ version, olderThanCurrent: true });
    });
  });
});
