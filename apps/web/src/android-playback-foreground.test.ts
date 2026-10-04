import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * UN VOCAL CONTINUE DE JOUER QUAND ON QUITTE LA COQUE ANDROID (#9257).
 *
 * Android gèle le processus d'une app mise en cache : sans service au premier
 * plan de type `mediaPlayback`, un vocal s'arrête quelques secondes après
 * qu'on a quitté l'app. Le service est piloté par
 * `src/lib/view/shell-playback.ts`, démarré au lancement par `main.tsx`.
 * Ici, le câblage natif et celui du démarrage.
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

describe('la lecture d’un vocal tenue au premier plan dans la coque Android (#9257)', () => {
  test('le service de lecture est déclaré, de type mediaPlayback, et non exporté', () => {
    const manifeste = sansCommentaires(lire('AndroidManifest.xml'));
    const debut = manifeste.indexOf('android:name=".PlaybackForegroundService"');
    expect(debut).toBeGreaterThan(-1);
    const service = manifeste.slice(manifeste.lastIndexOf('<service', debut), manifeste.indexOf('/>', debut));
    expect(service).toContain('android:foregroundServiceType="mediaPlayback"');
    expect(service).toContain('android:exported="false"');
    expect(manifeste).toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK');
  });

  test('le plugin tient et rend la lecture, et la rend aussi quand la page disparaît', () => {
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshyPlaybackPlugin.java'));
    expect(plugin).toContain('@CapacitorPlugin(name = "MeeshyPlayback")');
    expect(corpsDe(plugin, 'void holdPlayback(')).toContain('PlaybackForegroundService.start(');
    expect(corpsDe(plugin, 'void releasePlayback(')).toContain('PlaybackForegroundService.stop(');
    expect(corpsDe(plugin, 'void handleOnDestroy(')).toContain('PlaybackForegroundService.stop(');
  });

  test("l'activité enregistre le plugin", () => {
    expect(sansCommentaires(lire(...JAVA, 'MainActivity.java'))).toContain('registerPlugin(MeeshyPlaybackPlugin.class)');
  });

  test('le service passe au premier plan avec le type mediaPlayback', () => {
    const service = sansCommentaires(lire(...JAVA, 'PlaybackForegroundService.java'));
    expect(corpsDe(service, 'int onStartCommand(')).toContain('ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK');
  });

  test('sa notification parle les sept langues de l’app', () => {
    for (const dossier of LANGUES) {
      const chaines = lire('res', dossier, 'strings_playback.xml');
      expect(chaines).toContain('name="playback_channel_name"');
      expect(chaines).toContain('name="playback_ongoing"');
    }
  });

  test('la coque écoute la lecture dès le lancement, et le navigateur ne charge rien', () => {
    const main = readFileSync(join(APP, 'src', 'main.tsx'), 'utf8');
    const debut = main.indexOf("import('@/lib/view/shell-playback')");
    expect(debut).toBeGreaterThan(-1);
    const garde = main.lastIndexOf('if (__SHELL__)', debut);
    expect(garde).toBeGreaterThan(-1);
    expect(main.slice(garde, debut)).not.toMatch(/\n}\n/);
    expect(main.slice(debut, debut + 300)).toContain('holdWhileAudioPlays');
  });

  test('sa notification porte une « Pause » qui parvient à la page, en sept langues (#9301)', () => {
    const service = sansCommentaires(lire(...JAVA, 'PlaybackForegroundService.java'));
    const notification = corpsDe(service, 'Notification notification(');
    expect(notification).toContain('ACTION_PAUSE');
    expect(notification).toContain('PendingIntent.getService(');
    expect(notification).toContain('R.string.playback_pause');
    expect(corpsDe(service, 'int onStartCommand(')).toContain('MeeshyPlaybackPlugin.pauseRequested(');
    const plugin = sansCommentaires(lire(...JAVA, 'MeeshyPlaybackPlugin.java'));
    expect(corpsDe(plugin, 'static boolean pauseRequested(')).toContain('notifyListeners("pauseRequested"');
    for (const dossier of LANGUES) expect(lire('res', dossier, 'strings_playback.xml')).toContain('name="playback_pause"');
  });

  test('le bouton du casque met le vocal en pause, par la même voie que la notification (#9344)', () => {
    const service = sansCommentaires(lire(...JAVA, 'PlaybackForegroundService.java'));
    const creation = corpsDe(service, 'public void onCreate(');
    expect(creation).toContain('new MediaSession(');
    expect(creation).toContain('setActive(true)');
    expect(creation).toContain('PlaybackState.STATE_PLAYING');
    expect(creation).toContain('PlaybackState.ACTION_PAUSE');
    expect(corpsDe(service, 'public void onPause(')).toContain('MeeshyPlaybackPlugin.pauseRequested(');
    expect(corpsDe(service, 'public void onDestroy(')).toContain('.release()');
  });

  test('sa notification est un lecteur lié à la session, pilotable écran verrouillé, comme dans Chrome (#9367)', () => {
    const service = sansCommentaires(lire(...JAVA, 'PlaybackForegroundService.java'));
    const notification = corpsDe(service, 'Notification notification(');
    expect(notification).toContain('new Notification.MediaStyle()');
    expect(notification).toContain('.setMediaSession(session.getSessionToken())');
    expect(notification).toContain('.setShowActionsInCompactView(0)');
  });
});
