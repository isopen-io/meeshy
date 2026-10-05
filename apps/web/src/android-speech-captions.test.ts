import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * MA VOIX EST SOUS-TITRÉE DEPUIS LA COQUE ANDROID, COMME DEPUIS CHROME (#9446).
 *
 * La WebView n'a pas `webkitSpeechRecognition`. Chrome Android l'implémente
 * avec le `SpeechRecognizer` du système, en mode dictée et avec résultats
 * partiels ; le plugin `MeeshySpeech` fait de même, et
 * `src/lib/calls/shell-speech.ts` le présente à la page sous le contrat de
 * `SpeechRecognition`. Ici, le câblage natif.
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

describe('la reconnaissance vocale de la coque Android pour les sous-titres d’appel (#9446)', () => {
  test("l'activité enregistre le plugin", () => {
    expect(sansCommentaires(lire(...JAVA, 'MainActivity.java'))).toContain('registerPlugin(MeeshySpeechPlugin.class)');
  });

  test('il écoute comme Chrome : dictée, résultats partiels, dans la langue de la page, micro vérifié', () => {
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshySpeechPlugin.java'));
    expect(plugin).toContain('@CapacitorPlugin(name = "MeeshySpeech")');
    const ecoute = corpsDe(plugin, 'public void startListening(');
    expect(ecoute).toContain('Manifest.permission.RECORD_AUDIO');
    expect(ecoute).toContain('SpeechRecognizer.isRecognitionAvailable(');
    expect(ecoute).toContain('SpeechRecognizer.createSpeechRecognizer(');
    const intention = corpsDe(plugin, 'Intent intent(');
    expect(intention).toContain('RecognizerIntent.EXTRA_PARTIAL_RESULTS');
    expect(intention).toContain('RecognizerIntent.EXTRA_LANGUAGE');
    expect(intention).toContain('"android.speech.extra.DICTATION_MODE"');
    expect(corpsDe(plugin, 'public void stopListening(')).toContain('release()');
    expect(corpsDe(plugin, 'protected void handleOnDestroy(')).toContain('release()');
  });

  test('il rend résultats, erreurs au vocabulaire Web Speech, puis la fin', () => {
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshySpeechPlugin.java'));
    expect(plugin).toContain('notifyListeners("speechResult"');
    expect(corpsDe(plugin, 'public void onError(')).toContain('SpeechErrors.webError(');
    expect(plugin).toContain('notifyListeners("speechError"');
    expect(corpsDe(plugin, 'private void finish(')).toContain('notifyListeners("speechEnd"');
  });

  test('le service de reconnaissance est visible depuis l’API 30', () => {
    const manifeste = sansCommentaires(lire('AndroidManifest.xml'));
    const requetes = manifeste.slice(manifeste.indexOf('<queries>'), manifeste.indexOf('</queries>'));
    expect(requetes).toContain('android:name="android.speech.RecognitionService"');
  });

  test('la page prend la reconnaissance de la coque quand elle existe', () => {
    const runtime = readFileSync(join(APP, 'src', 'lib', 'calls', 'call-captions-runtime.ts'), 'utf8');
    expect(runtime).toContain('shellRecognition()');
  });
});
