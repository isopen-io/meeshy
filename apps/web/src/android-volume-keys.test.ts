import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LES TOUCHES DE VOLUME RÈGLENT LES MÉDIAS, COMME DANS CHROME (#10375).
 *
 * Chrome pose `STREAM_MUSIC` sur son activité. La coque ne posait rien : tant
 * qu'aucun son ne jouait, les touches réglaient la SONNERIE, et baisser le
 * volume pouvait mettre le téléphone en vibreur. Pendant un appel, le flux
 * revient au système, qui règle la voix. La règle vit dans `VolumeStreamRules`
 * (JUnit), ce témoin garde son branchement.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
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

describe('les touches de volume de la coque suivent Chrome (#10375)', () => {
  test('l’activité pose le flux des médias dès sa création', () => {
    const code = sansCommentaires(readFileSync(join(JAVA, 'MainActivity.java'), 'utf8'));
    const creation = corpsDe(code, 'protected void onCreate(Bundle savedInstanceState)');
    expect(creation).toContain('setVolumeControlStream(VolumeStreamRules.streamFor(false))');
  });

  test('un appel rend les touches à la voix, sa fin les rend aux médias', () => {
    const code = sansCommentaires(readFileSync(join(JAVA, 'MeeshyCallPlugin.java'), 'utf8'));
    expect(corpsDe(code, 'public void startCallService(PluginCall call)')).toContain('volumeKeys(true)');
    expect(corpsDe(code, 'private void release()')).toContain('volumeKeys(false)');
    expect(corpsDe(code, 'private void volumeKeys(boolean inCall)')).toContain('setVolumeControlStream(VolumeStreamRules.streamFor(inCall))');
  });
});
