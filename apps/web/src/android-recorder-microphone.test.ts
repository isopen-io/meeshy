import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * UN VOCAL CONTINUE D'ENTENDRE QUAND ON QUITTE LA COQUE ANDROID (#9238).
 *
 * Android coupe le micro d'une app en arrière-plan : sans service au premier
 * plan de type `microphone`, `MediaRecorder` enregistre du silence. Les appels
 * en ont un depuis #8049 ; le vocal reçoit le sien, piloté par
 * `src/lib/view/shell-microphone.ts`. Ici, le câblage natif.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(APP, 'android', 'app', 'src', 'main');
const lire = (...chemin: string[]): string => readFileSync(join(SOURCES, ...chemin), 'utf8');
const JAVA = ['java', 'me', 'meeshy', 'app'];
const LANGUES = ['values', 'values-fr', 'values-es', 'values-pt', 'values-de', 'values-it', 'values-ar'];

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

describe('le micro du vocal tenu au premier plan dans la coque Android (#9238)', () => {
  test('le service du vocal est déclaré, de type micro, et non exporté', () => {
    const manifeste = sansCommentaires(lire('AndroidManifest.xml'));
    const debut = manifeste.indexOf('android:name=".RecordingForegroundService"');
    expect(debut).toBeGreaterThan(-1);
    const service = manifeste.slice(manifeste.lastIndexOf('<service', debut), manifeste.indexOf('/>', debut));
    expect(service).toContain('android:foregroundServiceType="microphone"');
    expect(service).toContain('android:exported="false"');
  });

  test('le plugin tient et rend le micro, et le rend aussi quand la page disparaît', () => {
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshyRecorderPlugin.java'));
    expect(plugin).toContain('@CapacitorPlugin(name = "MeeshyRecorder")');
    expect(corpsDe(plugin, 'void holdMicrophone(')).toContain('RecordingForegroundService.start(');
    expect(corpsDe(plugin, 'void releaseMicrophone(')).toContain('RecordingForegroundService.stop(');
    expect(corpsDe(plugin, 'void handleOnDestroy(')).toContain('RecordingForegroundService.stop(');
  });

  test("l'activité enregistre le plugin", () => {
    expect(sansCommentaires(lire(...JAVA, 'MainActivity.java'))).toContain('registerPlugin(MeeshyRecorderPlugin.class)');
  });

  test('le service ne passe au premier plan qu’avec la permission micro accordée', () => {
    const service = sansCommentaires(lire(...JAVA, 'RecordingForegroundService.java'));
    expect(corpsDe(service, 'static void start(')).toContain('Manifest.permission.RECORD_AUDIO');
    expect(corpsDe(service, 'int onStartCommand(')).toContain('ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE');
  });

  test('sa notification parle les sept langues de l’app', () => {
    for (const dossier of LANGUES) {
      const chaines = lire('res', dossier, 'strings_recording.xml');
      expect(chaines).toContain('name="recording_channel_name"');
      expect(chaines).toContain('name="recording_ongoing"');
    }
  });
});
