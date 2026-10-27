/**
 * LA MESURE DE L'IMMORTALISATION SE LANCE DANS LE CONTENEUR (D15, #10185 — lot L20 #10176). L'image de la passerelle ne
 * porte que `dist/` et les dépendances de production : ni `scripts/`, ni `tsx`. Le point d'entrée vit donc sous `src/`,
 * compilé, et le Dockerfile prouve à la construction qu'il s'y exécute (`verify-image`).
 */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { runPhotoMeasureCli, type PhotoMeasureCliDeps } from '../photoMomentsMeasureCli';
import type { PhotoMeasureReader } from '../photoMomentsMeasure';

const GATEWAY_ROOT = join(__dirname, '..', '..', '..', '..');
const ENTRY = join(__dirname, '..', 'photoMomentsMeasureCli.ts');
const NOW = new Date('2026-10-27T12:00:00.000Z');

const emptyReader: PhotoMeasureReader = {
  gamePhotoMoment: { findMany: () => Promise.resolve([]) },
  notification: { findMany: () => Promise.resolve([]) },
  user: { findMany: () => Promise.resolve([]) },
};

const harness = (): { readonly deps: PhotoMeasureCliDeps; readonly out: string[]; readonly err: string[]; readonly opened: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  const deps: PhotoMeasureCliDeps = {
    now: () => NOW,
    open: () => {
      opened.push('open');
      return {
        reader: emptyReader,
        close: async () => {
          opened.push('close');
        },
      };
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { deps, out, err, opened };
};

describe('le point d’entrée de la mesure photo', () => {
  it('verify-image : la loi partagée de la famille et le client Prisma se chargent depuis l’image, sans base', async () => {
    const { deps, out, opened } = harness();

    await expect(runPhotoMeasureCli(['verify-image'], deps)).resolves.toBe(0);

    expect(opened).toEqual([]);
    expect(out.join('\n')).toContain('mesure photo embarquée : famille rank');
  });

  it('sans argument : mesure la dernière semaine ISO close, rend du JSON, et referme la connexion', async () => {
    const { deps, out, opened } = harness();

    await expect(runPhotoMeasureCli([], deps)).resolves.toBe(0);

    expect(opened).toEqual(['open', 'close']);
    expect(JSON.parse(out.join('\n'))).toEqual({
      window: { week: '2026-W43', from: '2026-10-19T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' },
      minAccounts: 10,
      families: [],
      push: null,
      pushReadMeaning: 'ceiling-includes-carnet-visits',
      suppressed: 0,
    });
  });

  it('une fenêtre libre est refusée avant toute connexion', async () => {
    const { deps, err, opened } = harness();

    await expect(runPhotoMeasureCli(['--from', '2026-10-20', '--to', '2026-10-21'], deps)).resolves.toBe(1);

    expect(opened).toEqual([]);
    expect(err.join('\n')).toContain('unknown-argument');
  });

  it('vit sous src/, donc dans dist/ : le compilateur l’inclut et ne l’exclut pas', () => {
    const path = relative(GATEWAY_ROOT, ENTRY);
    const configPath = join(GATEWAY_ROOT, 'tsconfig.json');
    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const { fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, GATEWAY_ROOT, undefined, configPath);

    expect(path).toBe('src/services/game/photoMomentsMeasureCli.ts');
    expect(fileNames.map((file) => relative(GATEWAY_ROOT, file))).toContain(path);
  });

  it('le Dockerfile prouve à la construction que la mesure s’exécute dans l’image', () => {
    const dockerfile = readFileSync(join(GATEWAY_ROOT, 'Dockerfile'), 'utf8');

    expect(dockerfile).toMatch(/^RUN node dist\/src\/services\/game\/photoMomentsMeasureCli\.js verify-image$/m);
  });

  it('son mode d’emploi dit la commande de l’image, jamais tsx ni scripts/', () => {
    const source = readFileSync(ENTRY, 'utf8');

    expect(source).toContain('node dist/src/services/game/photoMomentsMeasureCli.js');
    expect(source).not.toMatch(/tsx|scripts\//);
  });
});
