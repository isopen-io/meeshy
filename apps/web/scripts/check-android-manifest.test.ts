import { describe, expect, test } from 'bun:test';

import {
  auditCallComponents,
  auditManifestPermissions,
  formatViolations,
  REQUIRED_PERMISSIONS,
} from './check-android-manifest.mjs';

/**
 * LE TÉMOIN DU GATE DU MANIFESTE ANDROID (#7844, #7869).
 *
 * `check-android-manifest.mjs` prouve que la coque déclare EXACTEMENT UNE FOIS,
 * et de façon EFFECTIVE, chaque permission que le web consomme. Mesuré : la
 * fusion des deux lots de #7844 a laissé un doublon que rien n'avait signalé
 * (`996e392937`), et le premier correctif restait vert sur une balise mal
 * cassée, sur `tools:node="remove"` et sur `android:maxSdkVersion` — trois
 * formes où la permission n'est PAS accordée à l'app installée.
 *
 * `auditManifestPermissions` et `formatViolations` sont PURES — elles jugent
 * un XML déjà lu, jamais le disque. Le pilote (lecture du manifeste committé)
 * n'est testé qu'en l'exécutant (`node scripts/check-android-manifest.mjs`),
 * même discipline que `check-capacitor-config.test.ts` ; l'ÉTAT du manifeste
 * committé est la question de `src/android-manifest.test.ts`.
 */
const ACCESS_NETWORK_STATE = 'android.permission.ACCESS_NETWORK_STATE';
const INTERNET = 'android.permission.INTERNET';
const MANIFEST_PATH = '/coque/android/app/src/main/AndroidManifest.xml';

const declaration = (permission: string): string =>
  `    <uses-permission android:name="${permission}" />`;

const manifestWith = (lines: readonly string[]): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
    '    xmlns:tools="http://schemas.android.com/tools">',
    ...lines,
    '</manifest>',
  ].join('\n');

const othersThan = (permission: string): readonly string[] =>
  REQUIRED_PERMISSIONS.filter((required) => required !== permission).map(declaration);

const networkStateDeclaredAs = (line: string): string =>
  manifestWith([...othersThan(ACCESS_NETWORK_STATE), line]);

const networkStateAbsent = [{ permission: ACCESS_NETWORK_STATE, count: 0 }];

describe('auditManifestPermissions — chaque permission consommée, déclarée UNE fois et de façon effective', () => {
  test('chaque permission requise déclarée une fois → aucune violation', () => {
    expect(auditManifestPermissions({ manifest: manifestWith(REQUIRED_PERMISSIONS.map(declaration)) })).toEqual([]);
  });

  test('une permission ABSENTE → une violation qui la NOMME, compte 0', () => {
    expect(auditManifestPermissions({ manifest: manifestWith(othersThan(ACCESS_NETWORK_STATE)) })).toEqual(
      networkStateAbsent,
    );
  });

  test('la permission de notification est requise : sans elle, aucune bannière FCM sur Android 13+ (#7307)', () => {
    const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';
    expect(auditManifestPermissions({ manifest: manifestWith(othersThan(POST_NOTIFICATIONS)) })).toEqual([
      { permission: POST_NOTIFICATIONS, count: 0 },
    ]);
  });

  test('une permission déclarée DEUX fois → une violation qui la nomme, compte 2', () => {
    const manifest = manifestWith([...REQUIRED_PERMISSIONS.map(declaration), declaration(ACCESS_NETWORK_STATE)]);
    expect(auditManifestPermissions({ manifest })).toEqual([{ permission: ACCESS_NETWORK_STATE, count: 2 }]);
  });

  test('deux permissions doublées → deux violations, dans l ordre de REQUIRED_PERMISSIONS', () => {
    const manifest = manifestWith([
      ...REQUIRED_PERMISSIONS.map(declaration),
      declaration(ACCESS_NETWORK_STATE),
      declaration(INTERNET),
    ]);
    expect(auditManifestPermissions({ manifest })).toEqual([
      { permission: INTERNET, count: 2 },
      { permission: ACCESS_NETWORK_STATE, count: 2 },
    ]);
  });

  test('une déclaration EN COMMENTAIRE ne compte pas', () => {
    const manifest = networkStateDeclaredAs(`    <!-- ${declaration(ACCESS_NETWORK_STATE).trim()} -->`);
    expect(auditManifestPermissions({ manifest })).toEqual(networkStateAbsent);
  });

  test('un commentaire qui CITE la permission avant sa déclaration ne la double pas', () => {
    const manifest = networkStateDeclaredAs(
      [
        '    <!-- #7844 — sans elle, la WebView ne lève jamais online / offline :',
        `         ${declaration(ACCESS_NETWORK_STATE).trim()} -->`,
        declaration(ACCESS_NETWORK_STATE),
      ].join('\n'),
    );
    expect(auditManifestPermissions({ manifest })).toEqual([]);
  });

  test('une balise mal cassée n est pas une déclaration — le manifeste Android est sensible à la casse', () => {
    const manifest = networkStateDeclaredAs(`    <uses-Permission android:name="${ACCESS_NETWORK_STATE}" />`);
    expect(auditManifestPermissions({ manifest })).toEqual(networkStateAbsent);
  });

  test('un autre élément préfixé par uses-permission n est pas une déclaration <uses-permission>', () => {
    const manifest = networkStateDeclaredAs(`    <uses-permission-sdk-23 android:name="${ACCESS_NETWORK_STATE}" />`);
    expect(auditManifestPermissions({ manifest })).toEqual(networkStateAbsent);
  });

  test('tools:node="remove" RETIRE la permission à la fusion du manifeste — elle ne compte pas', () => {
    const manifest = networkStateDeclaredAs(
      `    <uses-permission android:name="${ACCESS_NETWORK_STATE}" tools:node="remove" />`,
    );
    expect(auditManifestPermissions({ manifest })).toEqual(networkStateAbsent);
  });

  test('android:maxSdkVersion borne l octroi aux vieux Android — la déclaration ne compte pas', () => {
    const manifest = networkStateDeclaredAs(
      `    <uses-permission android:maxSdkVersion="22" android:name="${ACCESS_NETWORK_STATE}" />`,
    );
    expect(auditManifestPermissions({ manifest })).toEqual(networkStateAbsent);
  });

  test('attributs dans un autre ordre, guillemets simples et balise non auto-fermante restent reconnus', () => {
    const manifest = networkStateDeclaredAs(
      `    <uses-permission tools:ignore="ProtectedPermissions" android:name='${ACCESS_NETWORK_STATE}'></uses-permission>`,
    );
    expect(auditManifestPermissions({ manifest })).toEqual([]);
  });

  test('required restreint le jugement aux permissions nommées', () => {
    const manifest = manifestWith([declaration(INTERNET)]);
    expect(auditManifestPermissions({ manifest, required: [INTERNET] })).toEqual([]);
  });
});

describe('formatViolations — le message du gate NOMME chaque permission en défaut', () => {
  test('absente → la permission, le chemin du manifeste et la ligne à ajouter', () => {
    const message = formatViolations({ manifestPath: MANIFEST_PATH, violations: networkStateAbsent });
    expect(message).toContain(MANIFEST_PATH);
    expect(message).toContain(`${ACCESS_NETWORK_STATE} — manquante`);
    expect(message).toContain(`ajouter <uses-permission android:name="${ACCESS_NETWORK_STATE}" />`);
  });

  test('doublée → la permission et son compte', () => {
    const message = formatViolations({
      manifestPath: MANIFEST_PATH,
      violations: [{ permission: INTERNET, count: 3 }],
    });
    expect(message).toContain(`${INTERNET} — déclarée 3 fois, n'en garder qu'une`);
  });

  test('plusieurs violations → une ligne chacune, sous un seul en-tête', () => {
    const message = formatViolations({
      manifestPath: MANIFEST_PATH,
      violations: [
        { permission: INTERNET, count: 0 },
        { permission: ACCESS_NETWORK_STATE, count: 2 },
      ],
    });
    const lines = message.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(INTERNET);
    expect(lines[2]).toContain(ACCESS_NETWORK_STATE);
  });
});

describe('les permissions de l appel natif de la coque (#8049)', () => {
  const CALL_PERMISSIONS = [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.FOREGROUND_SERVICE_CAMERA',
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.WAKE_LOCK',
    'android.permission.VIBRATE',
  ];

  test.each(CALL_PERMISSIONS)('%s est requise : son absence est une violation nommée', (permission) => {
    expect(REQUIRED_PERMISSIONS).toContain(permission);
    expect(auditManifestPermissions({ manifest: manifestWith(othersThan(permission)) })).toEqual([
      { permission, count: 0 },
    ]);
  });
});

const CALL_COMPONENTS: readonly string[] = [
  '    <application>',
  '        <service android:name="com.capacitorjs.plugins.pushnotifications.MessagingService" tools:node="remove" />',
  '        <service android:name=".MeeshyMessagingService" android:exported="false">',
  '            <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter>',
  '        </service>',
  '        <service android:name=".CallForegroundService" android:exported="false" android:foregroundServiceType="microphone|camera" />',
  '        <receiver android:name=".DeclineCallReceiver" android:exported="false" />',
  '    </application>',
];

const callComponentsWhere = (edit: (line: string) => string | null): string =>
  manifestWith(CALL_COMPONENTS.map(edit).filter((line): line is string => line !== null));

describe('auditCallComponents — la coque déclare les composants de l appel natif (#8049)', () => {
  test('les quatre déclarations présentes → aucune violation', () => {
    expect(auditCallComponents({ manifest: callComponentsWhere((line) => line) })).toEqual([]);
  });

  test('le service du plugin NON retiré → deux services MESSAGING_EVENT se concurrencent', () => {
    const manifest = callComponentsWhere((line) => line.replace(' tools:node="remove"', ''));
    expect(auditCallComponents({ manifest })).toEqual([
      'com.capacitorjs.plugins.pushnotifications.MessagingService — non retiré (tools:node="remove") : deux services MESSAGING_EVENT se concurrencent',
    ]);
  });

  test('le service de messagerie de la coque absent → l appel app tuée ne sonne pas', () => {
    const manifest = manifestWith(CALL_COMPONENTS.filter((line) => !line.includes('MeeshyMessagingService')));
    expect(auditCallComponents({ manifest })).toEqual([
      '.MeeshyMessagingService — absent ou sans com.google.firebase.MESSAGING_EVENT',
    ]);
  });

  test('le service au premier plan sans le type caméra → violation nommée', () => {
    const manifest = callComponentsWhere((line) => line.replace('microphone|camera', 'microphone'));
    expect(auditCallComponents({ manifest })).toEqual([
      '.CallForegroundService — foregroundServiceType doit porter microphone ET camera',
    ]);
  });

  test('le récepteur de refus exporté → n importe quelle app pourrait refuser un appel', () => {
    const manifest = callComponentsWhere((line) =>
      line.includes('DeclineCallReceiver') ? line.replace('"false"', '"true"') : line,
    );
    expect(auditCallComponents({ manifest })).toEqual(['.DeclineCallReceiver — absent ou exporté']);
  });

  test('un composant en commentaire ne compte pas', () => {
    const manifest = callComponentsWhere((line) =>
      line.includes('DeclineCallReceiver') ? `<!-- ${line.trim()} -->` : line,
    );
    expect(auditCallComponents({ manifest })).toEqual(['.DeclineCallReceiver — absent ou exporté']);
  });
});
