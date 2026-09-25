import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { auditManifestPermissions, formatViolations, REQUIRED_PERMISSIONS } from './check-android-manifest.mjs';

/**
 * LE TÉMOIN DU GATE DU MANIFESTE ANDROID (#7844 + résidu).
 *
 * `check-android-manifest.mjs` prouve que la coque déclare EXACTEMENT UNE FOIS
 * chaque permission que le web consomme — pas zéro, pas deux. Hors commentaires :
 * une ligne commentée ne compte pas (mesuré le 2026-09-24 : une fusion a laissé
 * un doublon que rien n'avait signalé).
 *
 * `auditManifestPermissions` et `formatViolations` sont PURES — elles jugent
 * un XML déjà lu, jamais un appel disque elles-mêmes. Le pilote (lecture réelle
 * du manifeste) n'est testé qu'en l'exécutant (`node scripts/check-android-manifest.mjs`),
 * même discipline que `check-capacitor-config.test.ts`.
 */
describe('auditManifestPermissions — les permissions que le web consomme, déclarées UNE fois', () => {
  test('chaque permission requise déclarée une fois → aucune violation', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
</manifest>`;
    const result = auditManifestPermissions({ manifest: xml });
    expect(result).toEqual([]);
  });

  test('une permission ABSENTE → une violation qui la NOMME', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
</manifest>`;
    const result = auditManifestPermissions({ manifest: xml });
    expect(result.length).toBe(1);
    expect(result[0].permission).toBe('android.permission.ACCESS_NETWORK_STATE');
    expect(result[0].count).toBe(0);
  });

  test('une permission déclarée DEUX fois → une violation nommant permission et compte', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
</manifest>`;
    const result = auditManifestPermissions({ manifest: xml });
    const violation = result.find((v: any) => v.permission === 'android.permission.INTERNET');
    expect(violation?.permission).toBe('android.permission.INTERNET');
    expect(violation?.count).toBe(2);
  });

  test('une déclaration EN COMMENTAIRE ne compte pas', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <!-- <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" /> -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
</manifest>`;
    const result = auditManifestPermissions({ manifest: xml });
    const violation = result.find((v: any) => v.permission === 'android.permission.ACCESS_NETWORK_STATE');
    expect(violation?.permission).toBe('android.permission.ACCESS_NETWORK_STATE');
    expect(violation?.count).toBe(0);
  });

  test('attributs dans un autre ordre et guillemets simples restent reconnus', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:required="true" android:name='android.permission.INTERNET' />
  <uses-permission android:name='android.permission.RECORD_AUDIO' android:required="false" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
</manifest>`;
    const result = auditManifestPermissions({ manifest: xml });
    expect(result).toEqual([]);
  });

  test('INTERNET ET ACCESS_NETWORK_STATE doublés ensemble', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
</manifest>`;
    const result = auditManifestPermissions({ manifest: xml });
    expect(result.length).toBe(2);
    const internet = result.find((v: any) => v.permission === 'android.permission.INTERNET');
    const network = result.find((v: any) => v.permission === 'android.permission.ACCESS_NETWORK_STATE');
    expect(internet?.count).toBe(2);
    expect(network?.count).toBe(2);
  });
});

describe('formatViolations — le message d\'erreur du gate', () => {
  test('absence = « manquante — ajouter »', () => {
    const violations = [
      { permission: 'android.permission.ACCESS_NETWORK_STATE', count: 0 },
    ];
    const msg = formatViolations({
      manifestPath: '/path/to/AndroidManifest.xml',
      violations,
    });
    expect(msg).toContain('android.permission.ACCESS_NETWORK_STATE');
    expect(msg).toContain('/path/to/AndroidManifest.xml');
  });

  test('doublon = « N fois — n\'en garder qu\'une »', () => {
    const violations = [
      { permission: 'android.permission.INTERNET', count: 2 },
    ];
    const msg = formatViolations({
      manifestPath: '/path/to/AndroidManifest.xml',
      violations,
    });
    expect(msg).toContain('android.permission.INTERNET');
    expect(msg).toContain('2');
  });

  test('plusieurs violations nommées dans le même message', () => {
    const violations = [
      { permission: 'android.permission.INTERNET', count: 0 },
      { permission: 'android.permission.RECORD_AUDIO', count: 2 },
    ];
    const msg = formatViolations({
      manifestPath: '/path/to/AndroidManifest.xml',
      violations,
    });
    expect(msg).toContain('android.permission.INTERNET');
    expect(msg).toContain('android.permission.RECORD_AUDIO');
  });
});
