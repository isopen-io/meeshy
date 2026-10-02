import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'bun:test';
import { resolveConfig } from 'vite';

/**
 * **UN `.env` HÉRITÉ NE FAIT PLUS D'UN `vite build` UN BUILD DE DÉVELOPPEMENT**
 * (#9176).
 *
 * Le legacy Next.js a laissé sur les postes qui l'ont connu un
 * `apps/web/.env` non suivi portant `NODE_ENV=development`. Vite le lit, et
 * c'est la manière DOCUMENTÉE de demander un build de développement : le bundle
 * sortait en silence avec `import.meta.env.PROD` faux — sans service worker,
 * avec le harnais de développement — et faussait chaque gate local qui lit un
 * comportement de production (#9118).
 *
 * Le témoin résout la VRAIE configuration avec la fonction de Vite elle-même,
 * sur un répertoire d'environnement qui porte le fichier hérité.
 */

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(WEB, 'vite.config.ts');

const shellNodeEnv = process.env.NODE_ENV;
const directories: string[] = [];

function envDirWith(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'meeshy-env-'));
  directories.push(dir);
  Object.entries(files).forEach(([name, text]) => writeFileSync(join(dir, name), text));
  return dir;
}

async function resolveBuild(options: { readonly envDir: string; readonly shell?: string }) {
  delete process.env.VITE_USER_NODE_ENV;
  if (options.shell === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = options.shell;
  return resolveConfig({ configFile: CONFIG, envDir: options.envDir, logLevel: 'silent' }, 'build', 'production', 'production');
}

afterEach(() => {
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  delete process.env.VITE_USER_NODE_ENV;
  if (shellNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = shellNodeEnv;
});

describe('vite build — un NODE_ENV hérité d’un fichier .env', () => {
  test('sans fichier .env, le build est de production', async () => {
    const config = await resolveBuild({ envDir: envDirWith({}) });
    expect(config.isProduction).toBe(true);
  });

  test('le .env du legacy (NODE_ENV=development) ne retourne plus le build en développement', async () => {
    const config = await resolveBuild({
      envDir: envDirWith({ '.env': 'NODE_ENV=development\nNEXT_PUBLIC_API_URL=http://localhost:3000\n' }),
    });
    expect(config.isProduction).toBe(true);
    expect(config.env.PROD).toBe(true);
  });

  test('un .env.local hérité est neutralisé de la même façon', async () => {
    const config = await resolveBuild({ envDir: envDirWith({ '.env.local': 'export NODE_ENV="development"\n' }) });
    expect(config.isProduction).toBe(true);
  });

  test('les VITE_* du fichier restent lus — seul NODE_ENV est écarté', async () => {
    const config = await resolveBuild({
      envDir: envDirWith({ '.env': 'NODE_ENV=development\nVITE_SAMPLE_FLAG=gardé\n' }),
    });
    expect(config.env.VITE_SAMPLE_FLAG).toBe('gardé');
  });

  test('une demande EXPLICITE depuis le shell construit toujours en développement', async () => {
    const config = await resolveBuild({
      envDir: envDirWith({ '.env': 'NODE_ENV=development\n' }),
      shell: 'development',
    });
    expect(config.isProduction).toBe(false);
  });
});
