import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import nextConfig from '../next.config';

const ROOT = join(__dirname, '..');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));

const at = (value: unknown, ...path: readonly string[]): unknown =>
  path.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), value);

const manifest = (): unknown => readJson('package.json');
const tsconfig = (): unknown => readJson('tsconfig.json');

describe('le paquet apps/web-v3', () => {
  it('porte un nom de workspace disjoint de celui du legacy', () => {
    expect(at(manifest(), 'name')).toBe('@meeshy/web-v3');
    expect(at(manifest(), 'private')).toBe(true);
  });

  it('sert le développement sur le port 3300', () => {
    expect(at(manifest(), 'scripts', 'dev')).toBe('next dev -p 3300');
  });

  it('démarre le build de production sur le port 3300', () => {
    expect(at(manifest(), 'scripts', 'start')).toBe('next start -p 3300 -H 0.0.0.0');
  });

  it('expose un build, un type-check et des tests', () => {
    expect(at(manifest(), 'scripts', 'build')).toContain('next build');
    expect(at(manifest(), 'scripts', 'type-check')).toBe('tsc --noEmit');
    expect(typeof at(manifest(), 'scripts', 'test')).toBe('string');
  });

  it("vérifie, au build, ce que next build a réellement PRODUIT", () => {
    expect(at(manifest(), 'scripts', 'build')).toContain('check-app-router-built.mjs');
  });

  it('pèse, au build, ce que chaque route expédie au navigateur', () => {
    expect(at(manifest(), 'scripts', 'build')).toContain('check-bundle-budget.mjs');
  });

  it("n'embarque aucune fonte d'icônes ni lucide-react", () => {
    const dependencies = at(manifest(), 'dependencies');
    const devDependencies = at(manifest(), 'devDependencies');
    const names = [
      ...(isRecord(dependencies) ? Object.keys(dependencies) : []),
      ...(isRecord(devDependencies) ? Object.keys(devDependencies) : []),
    ];

    expect(names).not.toContain('lucide-react');
    expect(names).not.toContain('@phosphor-icons/web');
    expect(names).not.toContain('next-themes');
  });
});

describe('la zone Next de la v3', () => {
  it('sert ses assets sous /__v3 pour ne pas disputer /_next au legacy', () => {
    expect(nextConfig.assetPrefix).toBe('/__v3');
  });

  it('ne pose aucun basePath — les URLs publiques restent identiques', () => {
    expect(nextConfig.basePath).toBeUndefined();
  });

  it('se construit en standalone pour son image Docker', () => {
    expect(nextConfig.output).toBe('standalone');
  });

  it('ne masque aucune erreur TypeScript au build', () => {
    expect(nextConfig.typescript?.ignoreBuildErrors).not.toBe(true);
  });

  it('ne masque aucune erreur ESLint au build', () => {
    expect(nextConfig.eslint?.ignoreDuringBuilds).not.toBe(true);
  });

  it("n'annonce pas le moteur qui la sert", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe('le tsconfig de la v3', () => {
  const flag = (name: string): unknown => at(tsconfig(), 'compilerOptions', name);

  it('active le mode strict', () => {
    expect(flag('strict')).toBe(true);
  });

  it('reprend les garde-fous des autres paquets TS du monorepo', () => {
    expect(flag('noUncheckedIndexedAccess')).toBe(true);
    expect(flag('noImplicitOverride')).toBe(true);
    expect(flag('noImplicitReturns')).toBe(true);
    expect(flag('noFallthroughCasesInSwitch')).toBe(true);
    expect(flag('noUnusedLocals')).toBe(true);
    expect(flag('noUnusedParameters')).toBe(true);
    expect(flag('forceConsistentCasingInFileNames')).toBe(true);
    expect(flag('allowUnreachableCode')).toBe(false);
    expect(flag('allowUnusedLabels')).toBe(false);
  });

  it("n'accepte pas de JavaScript non typé", () => {
    expect(flag('allowJs')).not.toBe(true);
  });
});
