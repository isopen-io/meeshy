import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * UNE VIDÉO EN PLEIN ÉCRAN FLOTTE QUAND ON QUITTE LA COQUE ANDROID (#9242).
 *
 * Dans Chrome Android, Accueil pendant une vidéo plein écran la fait passer en
 * image dans l'image. Dans la coque, le plein écran tient depuis #8594 (la vue
 * de la WebView posée sur l'activité) mais l'image disparaissait en quittant
 * l'app. La règle vit dans `FullscreenPictureInPicture.floats` (témoins JVM) ;
 * ici, le câblage : l'appel garde la priorité, puis la vue plein écran flotte.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (fichier: string): string => readFileSync(join(JAVA, fichier), 'utf8');

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

describe("la vidéo plein écran en image dans l'image dans la coque Android (#9242)", () => {
  test("quitter l'app fait flotter la vue plein écran quand la règle le décide", () => {
    const depart = corpsDe(sansCommentaires(lire('MainActivity.java')), 'void onUserLeaveHint(');
    expect(depart).toContain('FullscreenPictureInPicture.floats(');
    expect(depart).toContain('fullscreenView != null');
  });

  test("l'appel vidéo garde la priorité et ses boutons", () => {
    const depart = corpsDe(sansCommentaires(lire('MainActivity.java')), 'void onUserLeaveHint(');
    expect(depart.indexOf('floatsInPictureInPicture()')).toBeGreaterThan(-1);
    expect(depart.indexOf('floatsInPictureInPicture()')).toBeLessThan(depart.indexOf('FullscreenPictureInPicture.floats('));
  });

  test('la fenêtre flottante prend la forme de la vidéo que la page a transmise (#9845)', () => {
    const activite = sansCommentaires(lire('MainActivity.java'));
    const params = corpsDe(activite, 'PictureInPictureParams floatParams(');
    expect(params).toContain('setAspectRatio(');
    expect(corpsDe(activite, 'boolean enterFloat(')).toContain('floatParams()');
    expect(corpsDe(activite, 'void onUserLeaveHint(')).toContain('floatParams()');
    expect(corpsDe(activite, 'boolean floatVideo(')).toContain('FullscreenPictureInPicture.aspect(');
    expect(corpsDe(activite, 'void onHideCustomView(')).toContain('floatAspect = null');
    const plugin = corpsDe(sansCommentaires(lire('MeeshyPlaybackPlugin.java')), 'void floatVideo(');
    expect(plugin).toContain('call.getInt("width"');
    expect(plugin).toContain('call.getInt("height"');
  });
});

