import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * DANS UN APPEL DEPUIS LA COQUE ANDROID, MA VOIX EST SOUS-TITRÉE (#9446).
 *
 * La WebView n'a pas `webkitSpeechRecognition` : la coque prête le
 * `SpeechRecognizer` du système par `MeeshySpeechPlugin`, que la page lit au
 * contrat de `SpeechRecognition` (`src/lib/calls/call-shell-speech.ts`). Ici,
 * le câblage natif ; la traduction des erreurs est tenue par
 * `SpeechRecognitionRulesTest.java`.
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

describe('la reconnaissance vocale de la coque Android (#9446)', () => {
  test('le manifeste rend visible le service de reconnaissance du système (API 30+)', () => {
    const manifeste = sansCommentaires(lire('AndroidManifest.xml'));
    const requetes = manifeste.slice(manifeste.indexOf('<queries>'), manifeste.indexOf('</queries>'));
    expect(requetes).toContain('<action android:name="android.speech.RecognitionService" />');
  });

  test('le micro est déclaré dans le manifeste', () => {
    expect(sansCommentaires(lire('AndroidManifest.xml'))).toContain('<uses-permission android:name="android.permission.RECORD_AUDIO" />');
  });

  test('le plugin expose ses deux méthodes et dit ses trois événements', () => {
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshySpeechPlugin.java'));
    expect(plugin).toContain('name = "MeeshySpeech"');
    expect(plugin).toContain('Manifest.permission.RECORD_AUDIO');
    expect(plugin).toMatch(/@PluginMethod\s+public void startListening\(/);
    expect(plugin).toMatch(/@PluginMethod\s+public void stopListening\(/);
    for (const evenement of ['speechResult', 'speechError', 'speechEnd']) expect(plugin).toContain(`notifyListeners("${evenement}"`);
  });

  test('la dictée demande les résultats partiels, dans la langue de la page', () => {
    const intention = corpsDe(sansCommentaires(lire(...JAVA, 'MeeshySpeechPlugin.java')), 'Intent intentFor(');
    expect(intention).toContain('RecognizerIntent.EXTRA_PARTIAL_RESULTS');
    expect(intention).toContain('RecognizerIntent.EXTRA_LANGUAGE,');
    expect(intention).toContain('RecognizerIntent.LANGUAGE_MODEL_FREE_FORM');
  });

  test('un micro refusé rend « not-allowed » puis la fin', () => {
    const refus = corpsDe(sansCommentaires(lire(...JAVA, 'MeeshySpeechPlugin.java')), 'void microphoneAnswered(');
    expect(refus).toContain('emitError(session, "not-allowed")');
    expect(refus).toContain('emitEnd(session)');
  });

  test('la page disparue ferme l’écoute', () => {
    expect(corpsDe(sansCommentaires(lire(...JAVA, 'MeeshySpeechPlugin.java')), 'void handleOnDestroy(')).toContain('close(');
  });

  test("l'activité enregistre le plugin avant de construire le pont", () => {
    const activite = sansCommentaires(lire(...JAVA, 'MainActivity.java'));
    const enregistrement = activite.indexOf('registerPlugin(MeeshySpeechPlugin.class)');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(activite.indexOf('super.onCreate('));
  });
});
