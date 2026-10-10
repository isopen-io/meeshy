import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

import { SHARE_PATH, SHARE_TARGET } from './share-target';

/**
 * LA PWA S'INSCRIT DANS LA FEUILLE DE PARTAGE DU SYSTÈME (#8884) — et les cinq
 * pièces qui portent le partage s'accordent sur UNE adresse : le manifeste, le
 * worker qui reçoit le POST, la route qui le montre.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lire = (...chemin: string[]) => readFileSync(join(APP, ...chemin), 'utf8');

describe('le share_target du manifeste', () => {
  test('poste en multipart sur l’adresse de la route', () => {
    expect(SHARE_TARGET.method).toBe('POST');
    expect(SHARE_TARGET.enctype).toBe('multipart/form-data');
    expect(SHARE_TARGET.action).toBe(SHARE_PATH);
    expect(ROUTES.share.pattern).toBe(SHARE_PATH);
  });

  test('accepte images et vidéos — ce que la feuille d’envoi sait envoyer', () => {
    expect(SHARE_TARGET.params.files).toEqual([{ name: 'media', accept: ['image/*', 'video/*'] }]);
  });

  test('l’adresse est celle que le worker intercepte', () => {
    expect(lire('public', 'sw-share-target.js')).toContain(`const SHARE_PATH = '${SHARE_PATH}';`);
  });

  test('vite.config.ts le publie dans le manifeste et charge le worker, sans le précacher', () => {
    const config = lire('vite.config.ts');
    expect(config).toMatch(/share_target:\s*SHARE_TARGET/);
    expect(config).toMatch(/SERVICE_WORKER_SCRIPTS\s*=\s*\[[^\]]*'sw-share-target\.js'/);
    const ignores = config.slice(config.indexOf('globIgnores: ['));
    expect(ignores.slice(0, ignores.indexOf(']'))).toContain("'sw-share-target.js'");
  });
});
