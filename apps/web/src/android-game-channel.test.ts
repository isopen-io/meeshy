import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * « MOMENTS À IMMORTALISER » SE COUPE DANS LES RÉGLAGES D'ANDROID (#10266, § 5.16.4).
 *
 * Depuis Android 8, une alerte se coupe par CANAL. Tant que le jeu partageait
 * `meeshy_notifications` avec les messages, couper le jeu dans les réglages du
 * système coupait aussi les messages. La coque crée donc un canal « Jeu », et
 * la passerelle y adresse toute notification du jeu — le même identifiant des
 * deux côtés. Le canal sonne et vibre comme le canal par défaut : seule la
 * possibilité de le couper change.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(APP, 'android', 'app', 'src', 'main');
const JAVA = join(MAIN, 'java', 'me', 'meeshy', 'app');
const RES = join(MAIN, 'res');
const GATEWAY_CONFIG = join(APP, '..', '..', 'services', 'gateway', 'src', 'services', 'android-push-config.ts');
const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la coque Android a un canal « Jeu » (#10266)', () => {
  const canal = lire(join(JAVA, 'GameNotificationChannel.java'));

  test('la passerelle et la coque nomment le même canal du jeu', () => {
    const id = canal.match(/static final String ID = "([^"]+)"/)?.[1];
    expect(id).toBe('meeshy_game');
    expect(lire(GATEWAY_CONFIG)).toContain(`ANDROID_GAME_CHANNEL_ID = '${id}'`);
  });

  test('le canal affiche la bannière, sonne et vibre comme le canal par défaut', () => {
    expect(canal).toMatch(/NotificationManager\.IMPORTANCE_HIGH/);
    expect(canal).toMatch(/\.enableVibration\(\s*true\s*\)/);
    expect(canal).toMatch(/\.setLockscreenVisibility\(\s*Notification\.VISIBILITY_PRIVATE\s*\)/);
    expect(canal).not.toMatch(/\.setSound\(/);
    expect(canal).toMatch(/createNotificationChannel\(/);
  });

  test('le canal est créé au démarrage de la coque, dans la langue de la coque', () => {
    const activite = lire(join(JAVA, 'MainActivity.java'));
    const pont = activite.indexOf('super.onCreate(savedInstanceState)');
    expect(activite.indexOf('GameNotificationChannel.ensure(ShellLocale.wrap(this))', pont)).toBeGreaterThan(pont);
  });

  test('son nom et sa description existent dans chaque langue de la coque', () => {
    const dossiers = readdirSync(RES).filter((nom) => /^values(-[a-z]{2})?$/.test(nom) && readdirSync(join(RES, nom)).includes('strings_push.xml'));
    expect(dossiers.length).toBeGreaterThanOrEqual(7);
    const manquants = dossiers.flatMap((dossier) => {
      const xml = readFileSync(join(RES, dossier, 'strings_push.xml'), 'utf8');
      return ['push_channel_game_name', 'push_channel_game_description']
        .filter((cle) => !new RegExp(`<string name="${cle}">[^<]+</string>`).test(xml))
        .map((cle) => `${dossier}:${cle}`);
    });
    expect(manquants).toEqual([]);
  });
});
