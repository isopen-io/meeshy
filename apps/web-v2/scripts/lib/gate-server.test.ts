import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { distCandidates, startDistServer } from './gate-server.mjs';

/**
 * LE SERVEUR DES GATES NE DÉGUISE PLUS UNE PANNE EN PAGE (#6988).
 *
 * Vingt-neuf gates recopiaient le même serveur, dont le dernier candidat était
 * TOUJOURS `index.html`. Une requête `/assets/realtime-xxx.js` dont la lecture
 * échouait — pour n'importe quelle raison, le `catch` les avalant toutes —
 * recevait donc `index.html` avec `content-type: text/html`. Le navigateur
 * recevait du HTML là où il attendait un module ES, et rendait « Failed to
 * fetch dynamically imported module ».
 *
 * Le job « Peaux web-v2 » a rougi trois fois en trois heures sur ce motif, sous
 * DEUX symptômes qui n'avaient pas l'air liés : un `waitForSelector` qui expire
 * (l'écran attendu était lui-même un chunk paresseux) et deux modules
 * introuvables. Les chunks existaient dans le `dist` à chaque fois.
 *
 * La règle : **le repli SPA appartient aux ROUTES.** Un chemin qui porte une
 * extension de fichier est une demande de FICHIER — il rend un 404 franc, qui
 * se diagnostique, plutôt qu'un 200 `text/html` qui se diagnostique mal.
 */

describe('les candidats servis pour un chemin', () => {
  test("une ROUTE retombe sur index.html — c'est la navigation d'une application à page unique", () => {
    expect(distCandidates('links/share')).toEqual(['links/share', 'links/share.html', 'links/share/index.html', 'index.html']);
  });

  test("la racine retombe sur index.html", () => {
    expect(distCandidates('')).toContain('index.html');
  });

  test("un ASSET ne retombe JAMAIS sur index.html — c'est le défaut qui a coûté trois enquêtes", () => {
    expect(distCandidates('assets/realtime-Du7HKDs8.js')).toEqual(['assets/realtime-Du7HKDs8.js']);
    expect(distCandidates('assets/app-B1QqZCS0.css')).not.toContain('index.html');
    expect(distCandidates('brand/logo.png')).not.toContain('index.html');
  });

  test('un chemin à extension INCONNUE reste un fichier — la règle porte sur la forme, pas sur une liste', () => {
    expect(distCandidates('assets/donnees.wasm')).toEqual(['assets/donnees.wasm']);
  });
});

const root = await mkdtemp(join(tmpdir(), 'dist-server-'));
await writeFile(join(root, 'index.html'), '<!doctype html><title>coquille</title>');
await mkdir(join(root, 'assets'), { recursive: true });
await writeFile(join(root, 'assets', 'present.js'), 'export const a = 1;\n');

const served = await startDistServer(root);
afterAll(() => served.close());

describe('le serveur des gates', () => {
  test('sert un asset présent avec son type', async () => {
    const response = await fetch(`${served.base}/assets/present.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toContain('export const a');
  });

  test("un asset ABSENT rend 404 — jamais 200 text/html", async () => {
    const response = await fetch(`${served.base}/assets/absent-Du7HKDs8.js`);

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  test('une route rend la coquille, pour que la navigation fonctionne', async () => {
    const response = await fetch(`${served.base}/links/share/new`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('coquille');
  });

  test("une erreur de lecture AUTRE qu'absente rend 500 et NOMME son code — une saturation doit se voir", async () => {
    const saturé = await startDistServer(root, {
      readFile: () => Promise.reject(Object.assign(new Error('too many open files'), { code: 'EMFILE' })),
    });
    try {
      const response = await fetch(`${saturé.base}/assets/present.js`);

      expect(response.status).toBe(500);
      expect(await response.text()).toContain('EMFILE');
    } finally {
      saturé.close();
    }
  });
});
