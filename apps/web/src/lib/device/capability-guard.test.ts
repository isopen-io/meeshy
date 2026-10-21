import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **UN SEUL LECTEUR DES SIGNAUX DE L'APPAREIL** (W10, #11316) - la memoire, les
 * coeurs et `navigator.connection` se lisent dans `lib/device/capability-tier.ts`
 * et nulle part ailleurs : chaque consommateur lit le tier (ou la connexion
 * normalisee) au lieu de reinventer son seuil. Cette garde lit les sources.
 *
 * `links/click-context.ts` n'en decide rien : il releve ces valeurs BRUTES pour
 * la telemetrie d'un clic.
 */
const SRC = fileURLToPath(new URL('../..', import.meta.url));

const READS_RAW_SIGNALS: Readonly<Record<string, string>> = {
  'lib/device/capability-tier.ts': 'le lecteur unique',
  'lib/links/click-context.ts': 'la telemetrie d\'un clic : des valeurs brutes, aucune decision',
};

const SIGNAL = /\b(hardwareConcurrency|deviceMemory)\b|navigator\)?\.connection|['"]connection['"]/;

function sources(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('un seul lecteur des signaux de l\'appareil', () => {
  test('aucune source hors le lecteur unique ne lit memoire, coeurs ou connexion', () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path))
      .filter((path) => !(path in READS_RAW_SIGNALS))
      .filter((path) => SIGNAL.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('chaque exception de la liste existe encore', () => {
    for (const path of Object.keys(READS_RAW_SIGNALS)) expect(statSync(join(SRC, path)).isFile()).toBe(true);
  });
});
