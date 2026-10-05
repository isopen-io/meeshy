import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA COQUE ANDROID VOIT LE RÉSEAU COUPER ET REVENIR (#7844).
 *
 * `useOnline`, la reconnexion du socket, le renvoi des accusés et la remise à
 * zéro des médias absents écoutent `navigator.onLine` et les événements
 * `online` / `offline`. La WebView Android n'active la détection des
 * changements de réseau que si l'application détient `ACCESS_NETWORK_STATE`
 * (Chromium, `WebViewChromiumAwInit.doNetworkInitializations`) : sans elle,
 * `navigator.onLine` reste `true` et aucun des deux événements ne part, là où
 * le web les reçoit. Permission normale : accordée à l'installation, sans
 * demande à l'utilisateur.
 */

const MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);

function declaredPermissions(xml: string): readonly string[] {
  return [...xml.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('le manifeste de la coque Android (#7844)', () => {
  const permissions = declaredPermissions(readFileSync(MANIFEST, 'utf8'));

  test('la WebView reçoit les changements de réseau', () => {
    expect(permissions).toContain('android.permission.ACCESS_NETWORK_STATE');
  });

  test('et garde l’accès au réseau', () => {
    expect(permissions).toContain('android.permission.INTERNET');
  });
});

/**
 * LA TUILE « POSITION » DEMANDE LA PERMISSION AU LIEU D'ÊTRE REFUSÉE (#8007).
 *
 * `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` (Capacitor 8.5.1)
 * demande `ACCESS_COARSE_LOCATION` et `ACCESS_FINE_LOCATION` à l'exécution :
 * non déclarées, Android les refuse sans dialogue et `getCurrentPosition`
 * rend `PERMISSION_DENIED`, là où le web affiche sa demande.
 */
describe('le manifeste de la coque Android (#8007)', () => {
  const permissions = declaredPermissions(readFileSync(MANIFEST, 'utf8'));

  test('la WebView peut demander la position approximative', () => {
    expect(permissions).toContain('android.permission.ACCESS_COARSE_LOCATION');
  });

  test('et la position précise', () => {
    expect(permissions).toContain('android.permission.ACCESS_FINE_LOCATION');
  });
});

/**
 * LA BANNIÈRE FCM DE LA COQUE, APP FERMÉE (#7307). Le SDK Firebase la rend
 * seul, sans le JS : sa petite icône et son canal viennent du manifeste. Sans
 * eux, la barre d'état montre un carré blanc (l'icône de lancement, opaque).
 */
describe('la bannière d’un push de la coque (#7307)', () => {
  const xml = readFileSync(MANIFEST, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const metaData = (name: string): string | null =>
    new RegExp(`<meta-data\\s+android:name="${name.replace(/\./g, '\\.')}"\\s+android:(?:resource|value)="([^"]+)"`).exec(xml)?.[1] ?? null;

  test('porte une petite icône monochrome, pas l’icône de lancement', () => {
    expect(metaData('com.google.firebase.messaging.default_notification_icon')).toBe('@drawable/ic_stat_meeshy');
    const icon = readFileSync(join(dirname(MANIFEST), 'res', 'drawable', 'ic_stat_meeshy.xml'), 'utf8');
    expect(icon).toContain('<vector');
  });

  test('tombe dans le canal que la passerelle nomme', () => {
    expect(metaData('com.google.firebase.messaging.default_notification_channel_id')).toBe('meeshy_notifications');
  });
});
