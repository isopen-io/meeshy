import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA PWA INSTALLÉE TOURNE COMME LES COQUES (#7877).
 *
 * Le même code web tourne en paysage dans la coque Android (aucun
 * `screenOrientation`) et dans la coque iOS (`UISupportedInterfaceOrientations`
 * porte le paysage, comme l'app iOS de référence). Un manifeste web qui
 * déclarerait `orientation: 'portrait'` verrouillerait la seule PWA installée :
 * une vidéo, un reel ou un appel ne pourraient plus y passer en paysage.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...chemin: string[]) => readFileSync(join(APP, ...chemin), 'utf8');

function orientationDuManifesteWeb(config: string): string | null {
  const bloc = config.slice(config.indexOf('manifest: {'));
  return /orientation:\s*'([^']+)'/.exec(bloc.slice(0, bloc.indexOf('icons:')))?.[1] ?? null;
}

describe('l’orientation de la PWA suit celle des coques (#7877)', () => {
  test('la coque iOS accepte le paysage', () => {
    expect(lire('ios', 'App', 'App', 'Info.plist')).toContain('UIInterfaceOrientationLandscapeLeft');
  });

  test('la coque Android ne verrouille aucune orientation', () => {
    expect(lire('android', 'app', 'src', 'main', 'AndroidManifest.xml')).not.toContain('android:screenOrientation');
  });

  test('le manifeste web ne verrouille pas le portrait', () => {
    const orientation = orientationDuManifesteWeb(lire('vite.config.ts'));
    expect(orientation === null || orientation === 'any').toBe(true);
  });
});
