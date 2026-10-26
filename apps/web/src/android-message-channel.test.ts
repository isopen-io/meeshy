import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE CANAL DES MESSAGES PARLE LA LANGUE DE L'UTILISATEUR (#13212).
 *
 * Dans les réglages d'Android, la coque liste ses canaux. Le muet (#8678) et le
 * jeu (#10266) y portent un nom et une description traduits ; le canal des
 * messages, créé par le JS, s'appelait « Meeshy » dans toutes les langues et
 * ne disait pas ce qu'il porte. Il est désormais créé en natif comme ses
 * voisins, et le JS ne le recrée plus : `createNotificationChannel` renomme un
 * canal existant, il écraserait le nom traduit.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(APP, 'android', 'app', 'src', 'main');
const JAVA = join(MAIN, 'java', 'me', 'meeshy', 'app');
const RES = join(MAIN, 'res');
const GATEWAY_CONFIG = join(APP, '..', '..', 'services', 'gateway', 'src', 'services', 'android-push-config.ts');
const SHELL_PUSH = join(APP, 'src', 'lib', 'push', 'shell-push.ts');
const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la coque Android crée le canal des messages dans sa langue (#13212)', () => {
  const canal = () => lire(join(JAVA, 'MessageNotificationChannel.java'));

  test('la passerelle et la coque nomment le même canal par défaut', () => {
    const id = canal().match(/static final String ID = "([^"]+)"/)?.[1];
    expect(id).toBe('meeshy_notifications');
    expect(lire(GATEWAY_CONFIG)).toContain(`ANDROID_DEFAULT_CHANNEL_ID = '${id}'`);
  });

  test('le canal affiche la bannière, sonne et vibre (#12566), contenu masqué sur l’écran verrouillé', () => {
    const source = canal();
    expect(source).toMatch(/NotificationManager\.IMPORTANCE_HIGH/);
    expect(source).toMatch(/\.enableVibration\(\s*true\s*\)/);
    expect(source).toMatch(/\.setLockscreenVisibility\(\s*Notification\.VISIBILITY_PRIVATE\s*\)/);
    expect(source).not.toMatch(/\.setSound\(/);
    expect(source).toMatch(/R\.string\.push_channel_messages_name/);
    expect(source).toMatch(/\.setDescription\(\s*context\.getString\(R\.string\.push_channel_messages_description\)\s*\)/);
    expect(source).toMatch(/createNotificationChannel\(/);
  });

  test('le canal est créé au démarrage de la coque, dans la langue de la coque', () => {
    const activite = lire(join(JAVA, 'MainActivity.java'));
    const pont = activite.indexOf('super.onCreate(savedInstanceState)');
    expect(activite.indexOf('MessageNotificationChannel.ensure(ShellLocale.wrap(this))', pont)).toBeGreaterThan(pont);
  });

  test('le JS ne recrée plus le canal, qui reprendrait le nom « Meeshy »', () => {
    expect(lire(SHELL_PUSH)).not.toMatch(/createChannel\(/);
  });

  test('son nom et sa description existent dans chaque langue de la coque', () => {
    const dossiers = readdirSync(RES).filter((nom) => /^values(-[a-z]{2})?$/.test(nom) && readdirSync(join(RES, nom)).includes('strings_push.xml'));
    expect(dossiers.length).toBeGreaterThanOrEqual(7);
    const manquants = dossiers.flatMap((dossier) => {
      const xml = readFileSync(join(RES, dossier, 'strings_push.xml'), 'utf8');
      return ['push_channel_messages_name', 'push_channel_messages_description']
        .filter((cle) => !new RegExp(`<string name="${cle}">[^<]+</string>`).test(xml))
        .map((cle) => `${dossier}:${cle}`);
    });
    expect(manquants).toEqual([]);
  });
});
