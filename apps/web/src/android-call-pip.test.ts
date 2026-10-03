import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * L'APPEL VIDÉO FLOTTE QUAND ON QUITTE LA COQUE ANDROID (#8144).
 *
 * Sur le web, masquer l'onglet pendant un appel vidéo ouvre Document PiP.
 * Dans la coque, le service au premier plan gardait l'appel vivant mais
 * l'image disparaissait : l'activité n'était pas déclarée capable d'image
 * dans l'image et rien ne l'y faisait entrer. La règle qui décide vit dans
 * `CallShellRules.entersPictureInPicture` (témoins JVM) ; ici, le câblage.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(APP, 'android', 'app', 'src', 'main');
const lire = (...chemin: string[]): string => readFileSync(join(SOURCES, ...chemin), 'utf8');
const JAVA = ['java', 'me', 'meeshy', 'app'];

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
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

describe("l'image dans l'image d'un appel dans la coque Android (#8144)", () => {
  test("l'activité principale se déclare capable d'image dans l'image", () => {
    const manifeste = sansCommentaires(lire('AndroidManifest.xml'));
    const activite = manifeste.slice(manifeste.indexOf('android:name=".MainActivity"') - 300, manifeste.indexOf('</activity>'));
    expect(activite).toContain('android:supportsPictureInPicture="true"');
  });

  test("quitter l'app y entre quand le plugin d'appel le décide", () => {
    const code = sansCommentaires(lire(...JAVA, 'MainActivity.java'));
    const depart = corpsDe(code, 'void onUserLeaveHint(');
    expect(depart).toContain('floatsInPictureInPicture()');
    expect(depart).toContain('enterPictureInPictureMode(');
  });

  test('la page apprend chaque entrée et chaque sortie', () => {
    const code = sansCommentaires(lire(...JAVA, 'MainActivity.java'));
    expect(corpsDe(code, 'void onPictureInPictureModeChanged(')).toContain('pictureInPictureChanged(active)');
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshyCallPlugin.java'));
    expect(corpsDe(plugin, 'void pictureInPictureChanged(')).toContain('notifyListeners("pictureInPictureModeChanged"');
    expect(corpsDe(plugin, 'boolean floatsInPictureInPicture(')).toContain('CallShellRules.entersPictureInPicture(');
  });
});
