import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { PONT_PARTAGE } from '@/lib/share-incoming/native-inbox';

import { auditShareIntentFilters } from '../scripts/check-android-manifest.mjs';

/**
 * UN CONTENU PARTAGÉ DEPUIS UNE AUTRE APPLICATION ARRIVE DANS LA COQUE ANDROID
 * (#8884).
 *
 * Le manifeste inscrit Meeshy dans la feuille de partage (`SEND`,
 * `SEND_MULTIPLE` — gardé par `scripts/check-android-manifest.mjs`), le pont
 * `MeeshyShareIntentPlugin` copie les contenus et les remet au web
 * (`lib/share-incoming/native-inbox.ts`). La coque ne se compile pas ici : ce
 * témoin lit le Java comme du texte, et garde les noms que les deux moitiés
 * doivent se partager — un nom de méthode qui diverge ne casse rien avant le
 * premier partage, sur un appareil.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la coque Android reçoit un partage (#8884)', () => {
  const plugin = lire(join(JAVA, 'MeeshyShareIntentPlugin.java'));

  test('le pont est enregistré avant la construction du pont Capacitor', () => {
    const activite = lire(join(JAVA, 'MainActivity.java'));
    const enregistrement = activite.indexOf('registerPlugin(MeeshyShareIntentPlugin.class)');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(activite.indexOf('super.onCreate(savedInstanceState)')).toBeGreaterThan(enregistrement);
  });

  test('le plugin porte le nom que le web appelle, et ses deux méthodes', () => {
    expect(plugin).toContain(`@CapacitorPlugin(name = "${PONT_PARTAGE}")`);
    expect(plugin).toMatch(/@PluginMethod\s+public void consume\(\s*PluginCall \w+\s*\)/);
    expect(plugin).toMatch(/@PluginMethod\s+public void release\(\s*PluginCall \w+\s*\)/);
  });

  test('il réveille le web par l’événement que le web écoute, retenu jusqu’à l’abonnement', () => {
    expect(plugin).toMatch(/notifyListeners\(\s*"shareReceived"\s*,\s*new JSObject\(\)\s*,\s*true\s*\)/);
    expect(readFileSync(join(APP, 'src', 'lib', 'share-incoming', 'native-inbox.ts'), 'utf8')).toContain("const EVENEMENT = 'shareReceived'");
  });

  test('il reçoit l’intent par onNewIntent, ne garde que SEND / SEND_MULTIPLE et neutralise l’intent lu', () => {
    expect(plugin).toMatch(/protected void handleOnNewIntent\(Intent \w+\)/);
    expect(plugin).toContain('ShareIntentRules.isShareAction(');
    expect(plugin).toContain('intent.setAction(Intent.ACTION_MAIN)');
    expect(plugin).toContain('intent.removeExtra(Intent.EXTRA_STREAM)');
  });

  test('il copie hors du fil principal, avec les bornes des règles pures', () => {
    expect(plugin).toContain('executor.execute(copy)');
    expect(plugin).toContain('ShareIntentRules.remainingBytes(');
    expect(plugin).toContain('ShareIntentRules.MAX_FILES');
    expect(plugin).toContain('ShareIntentRules.isAcceptedMime(');
    expect(plugin).toContain('ShareIntentRules.fileNameFor(');
  });

  test('le partage en attente est publié AVANT que la copie ne réveille le web', () => {
    expect(plugin.indexOf('pending = copy;')).toBeGreaterThan(-1);
    expect(plugin.indexOf('pending = copy;')).toBeLessThan(plugin.indexOf('executor.execute(copy)'));
  });

  test('la forme remise est celle que le web lit : files[{path,name,mimeType,size}], text, subject', () => {
    for (const cle of ['path', 'name', 'mimeType', 'size']) expect(plugin).toContain(`file.put("${cle}"`);
    expect(plugin).toContain('share.put("files"');
    expect(plugin).toContain('share.put("text"');
    expect(plugin).toContain('share.put("subject"');
  });

  test('les bornes du pont sont celles du service worker de la PWA', () => {
    const regles = lire(join(JAVA, 'ShareIntentRules.java'));
    const worker = readFileSync(join(APP, 'public', 'sw-share-target.js'), 'utf8');
    expect(regles).toContain('MAX_FILES = 10');
    expect(worker).toContain('SHARE_MAX_FILES = 10');
    expect(regles).toContain('MAX_TOTAL_BYTES = 100L * 1024 * 1024');
    expect(worker).toContain('SHARE_MAX_TOTAL_BYTES = 100 * 1024 * 1024');
  });

  test('le manifeste COMMITÉ inscrit l’app aux partages — la garde du gate, rejouée sur le vrai fichier', () => {
    const manifeste = readFileSync(join(APP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(auditShareIntentFilters({ manifest: manifeste })).toEqual([]);
  });
});
