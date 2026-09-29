import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * « SON » COUPÉ : LA COQUE ANDROID NE SONNE PLUS (#8678).
 *
 * Le web pose `silent: true`, iOS retire `aps.sound`. Sur Android 8+, le son
 * d'une bannière est celui de son CANAL : retirer la clé `sound` ne coupait
 * rien, `meeshy_notifications` est sonore. La coque crée donc un canal
 * haute importance SANS son ni vibration, et la passerelle y adresse les
 * notifications `muted` — le même identifiant des deux côtés.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const GATEWAY_CONFIG = join(APP, '..', '..', 'services', 'gateway', 'src', 'services', 'android-push-config.ts');
const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la coque Android a un canal muet pour les notifications sans son (#8678)', () => {
  const canal = lire(join(JAVA, 'SilentNotificationChannel.java'));

  test('la passerelle et la coque nomment le même canal muet', () => {
    const id = canal.match(/static final String ID = "([^"]+)"/)?.[1];
    expect(id).toBe('meeshy_notifications_silent');
    expect(lire(GATEWAY_CONFIG)).toContain(`'${id}'`);
  });

  test('le canal affiche la bannière sans son ni vibration', () => {
    expect(canal).toMatch(/NotificationManager\.IMPORTANCE_HIGH/);
    expect(canal).toMatch(/\.setSound\(\s*null\s*,\s*null\s*\)/);
    expect(canal).toMatch(/\.enableVibration\(\s*false\s*\)/);
    expect(canal).toMatch(/createNotificationChannel\(/);
  });

  test('le canal est créé au démarrage de la coque', () => {
    const activite = lire(join(JAVA, 'MainActivity.java'));
    const pont = activite.indexOf('super.onCreate(savedInstanceState)');
    expect(activite.indexOf('SilentNotificationChannel.ensure(this)', pont)).toBeGreaterThan(pont);
  });
});
