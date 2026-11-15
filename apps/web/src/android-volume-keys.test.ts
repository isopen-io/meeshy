import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LES TOUCHES DE VOLUME RÈGLENT LES MÉDIAS (#10375).
 *
 * Chrome pose `setVolumeControlStream(STREAM_MUSIC)` : monter le volume avant
 * de lancer un vocal règle les médias, jamais la sonnerie. La règle vit dans
 * `VolumeStreamRules` (JUnit) ; ce témoin garde son branchement — l'activité
 * la pose dès sa création, l'appel la rend à la voix puis aux médias.
 */

const SOURCES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'android',
  'app',
  'src',
  'main',
  'java',
  'me',
  'meeshy',
  'app',
);

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function lire(fichier: string): string {
  return sansCommentaires(readFileSync(join(SOURCES, fichier), 'utf8'));
}

function corpsDe(code: string, signature: string): string {
  const debut = code.indexOf(signature);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = code.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouverture; i < code.length; i += 1) {
    if (code[i] === '{') profondeur += 1;
    if (code[i] === '}') profondeur -= 1;
    if (profondeur === 0) return code.slice(ouverture, i + 1);
  }
  return code.slice(ouverture);
}

describe('les touches de volume règlent les médias, comme dans Chrome (#10375)', () => {
  test('l’activité pose le flux des médias dès sa création', () => {
    const creation = corpsDe(lire('MainActivity.java'), 'protected void onCreate(Bundle savedInstanceState)');
    expect(creation).toMatch(/setVolumeControlStream\(VolumeStreamRules\.stream\(false\)\)/);
  });

  test('un appel rend les touches à la voix, puis aux médias à sa fin', () => {
    const appel = lire('MeeshyCallPlugin.java');
    expect(corpsDe(appel, 'public void startCallService(PluginCall call)')).toMatch(/volumeKeys\(true\)/);
    expect(corpsDe(appel, 'private void release()')).toMatch(/volumeKeys\(false\)/);
    expect(corpsDe(appel, 'private void volumeKeys(boolean inCall)')).toMatch(
      /setVolumeControlStream\(VolumeStreamRules\.stream\(inCall\)\)/,
    );
  });
});
