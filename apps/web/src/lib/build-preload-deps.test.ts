import { describe, expect, test } from 'bun:test';

import { loadedPreloadDeps } from './build-preload-deps';

type FakeChunk = { readonly type: 'chunk'; readonly imports: readonly string[] };

const chunk = (imports: readonly string[] = []): FakeChunk => ({ type: 'chunk', imports });

const bundleOf = (entries: Record<string, FakeChunk>) => entries;

const resolveWith = (bundle: Record<string, FakeChunk>, host: string, deps: readonly string[]) => {
  const preload = loadedPreloadDeps();
  preload.capture(bundle);
  return preload.resolveDependencies('assets/screen.js', [...deps], { hostId: host, hostType: 'js' });
};

describe('loadedPreloadDeps — une dépendance déjà chargée par l’hôte ne se liste pas (#10974)', () => {
  test('retire ce que l’hôte importe statiquement, transitivement', () => {
    const bundle = bundleOf({
      'assets/index.js': chunk(['assets/core.js', 'assets/session.js']),
      'assets/session.js': chunk(['assets/storage.js']),
      'assets/core.js': chunk(),
      'assets/storage.js': chunk(),
      'assets/screen.js': chunk(['assets/core.js', 'assets/avatar.js']),
      'assets/avatar.js': chunk(),
    });
    expect(resolveWith(bundle, 'assets/index.js', ['assets/screen.js', 'assets/core.js', 'assets/storage.js', 'assets/avatar.js'])).toEqual([
      'assets/screen.js',
      'assets/avatar.js',
    ]);
  });

  test('garde tout ce que l’hôte n’a pas encore chargé', () => {
    const bundle = bundleOf({
      'assets/lazy-host.js': chunk(['assets/core.js']),
      'assets/core.js': chunk(),
      'assets/screen.js': chunk(),
    });
    expect(resolveWith(bundle, 'assets/lazy-host.js', ['assets/screen.js'])).toEqual(['assets/screen.js']);
  });

  test('sans paquet capturé, ne retire rien', () => {
    const preload = loadedPreloadDeps();
    expect(preload.resolveDependencies('assets/screen.js', ['assets/core.js'], { hostId: 'assets/index.js', hostType: 'js' })).toEqual([
      'assets/core.js',
    ]);
  });
});
