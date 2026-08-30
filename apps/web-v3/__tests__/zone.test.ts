import config from '../next.config';
import manifest from '../package.json';

describe('la zone v3 ne se dispute rien avec la zone legacy', () => {
  it('sert ses actifs sous son propre prefixe', () => {
    expect(config.assetPrefix).toBe('/__v3');
  });

  it('ne pose aucun basePath, pour que les URLs publiques restent identiques', () => {
    expect(config.basePath).toBeUndefined();
  });

  it('se construit en standalone, comme les autres images du monorepo', () => {
    expect(config.output).toBe('standalone');
  });

  it('nait a zero erreur de type et de lint : aucune erreur n est ignoree au build', () => {
    expect(config.typescript?.ignoreBuildErrors).not.toBe(true);
    expect(config.eslint?.ignoreDuringBuilds).not.toBe(true);
  });
});

describe('le port de la zone v3', () => {
  it('est 3300 en developpement comme en production', () => {
    expect(manifest.scripts.dev).toContain('3300');
    expect(manifest.scripts.start).toContain('3300');
  });

  it('n est jamais celui de la zone legacy', () => {
    expect(manifest.scripts.dev).not.toContain('3100');
    expect(manifest.scripts.start).not.toContain('3100');
  });
});
