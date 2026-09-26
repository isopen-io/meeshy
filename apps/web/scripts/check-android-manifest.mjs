#!/usr/bin/env node
/**
 * PROUVE QUE LA COQUE ANDROID DÉCLARE LES PERMISSIONS QUE LE WEB CONSOMME.
 *
 * POURQUOI CE TÉMOIN EXISTE (#7844). L'app native gelée (`apps/android`)
 * déclare `ACCESS_NETWORK_STATE` (`AndroidManifest.xml:6`) : c'est ce qui
 * permet à une app de SAVOIR quand le réseau coupe et revient, plutôt que de
 * le déduire d'un timeout de requête. La coque Capacitor de `apps/web`
 * (`apps/web/android`) ne la déclarait pas, alors que le web lui-même dépend
 * de cette capacité — `src/lib/net/online.ts` (`useOnline`), et ses
 * consommateurs `src/lib/api/socket.ts`, `src/lib/api/receipts.ts`,
 * `src/lib/api/media-absent.ts` écoutent tous les événements `online`/
 * `offline` du navigateur, que la WebView Android ne lève pas sans elle.
 *
 * CE QU'IL VÉRIFIE (#7869) : chaque permission de `REQUIRED_PERMISSIONS`
 * figure exactement une fois dans `apps/web/android/app/src/main/AndroidManifest.xml`
 * sous forme d'un `<uses-permission android:name="…" />` EFFECTIF — pas zéro,
 * pas deux. Ne comptent pas : une déclaration en commentaire, une balise
 * d'un autre nom ou d'une autre casse (le manifeste est sensible à la casse),
 * `tools:node="remove"` (la fusion du manifeste la RETIRE) et
 * `android:maxSdkVersion` (l'octroi s'arrête à ce niveau d'API). Un manifeste
 * absent ou une permission en défaut fait échouer ce gate avec le NOM de la
 * permission — jamais un message générique.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isEntryPoint } from './lib/entry-point.mjs';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MANIFEST_PATH = join(APP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

/**
 * Permissions que le WEB consomme et que la coque doit donc déclarer.
 * `ACCESS_NETWORK_STATE` (#7844) : useOnline() / socket.ts / receipts.ts /
 * media-absent.ts. `POST_NOTIFICATIONS` (#7307) : la bannière d'un push FCM
 * (`src/lib/push/shell-push.ts`) sur Android 13+. `ACCESS_COARSE_LOCATION` et
 * `ACCESS_FINE_LOCATION` (#8007) : la tuile « Position » du composeur
 * (`src/lib/view/use-location-request.ts`). Les autres (`INTERNET`, `RECORD_AUDIO`,
 * `MODIFY_AUDIO_SETTINGS`) sont déjà posées (#5668) et restent gardées ici
 * pour que ce témoin soit la référence UNIQUE des permissions de la coque.
 * `FOREGROUND_SERVICE` (+ `_MICROPHONE`, `_CAMERA`), `USE_FULL_SCREEN_INTENT`,
 * `BLUETOOTH_CONNECT`, `WAKE_LOCK`, `VIBRATE` (#8049) : l'appel natif de la
 * coque (`src/lib/calls/shell-call.ts`, `MeeshyCallPlugin.java`).
 */
export const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.CAMERA',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
];

const XML_COMMENT = /<!--[\s\S]*?-->/g;
const USES_PERMISSION_ELEMENT = /<uses-permission(?=[\s/>])([^>]*)>/g;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const REMOVING_MERGE_RULES = new Set(['remove', 'removeAll']);

const attributesOf = (source) =>
  new Map(
    [...source.matchAll(ATTRIBUTE)].map(([, name, doubleQuoted, singleQuoted]) => [
      name,
      doubleQuoted ?? singleQuoted,
    ]),
  );

const grantedOnEveryDevice = (attributes) =>
  !REMOVING_MERGE_RULES.has(attributes.get('tools:node')) &&
  !attributes.has('android:maxSdkVersion');

const effectiveDeclarations = (manifest) =>
  [...manifest.replace(XML_COMMENT, '').matchAll(USES_PERMISSION_ELEMENT)]
    .map(([, source]) => attributesOf(source))
    .filter(grantedOnEveryDevice)
    .map((attributes) => attributes.get('android:name'))
    .filter((permission) => permission !== undefined);

/**
 * Les permissions de `required` qui ne sont pas déclarées EXACTEMENT une fois
 * de façon effective : `count` 0 = absente ou neutralisée, ≥ 2 = doublée.
 */
export const auditManifestPermissions = ({ manifest, required = REQUIRED_PERMISSIONS }) => {
  const declared = effectiveDeclarations(manifest);
  return required
    .map((permission) => ({
      permission,
      count: declared.filter((name) => name === permission).length,
    }))
    .filter(({ count }) => count !== 1);
};

const PLUGIN_MESSAGING_SERVICE = 'com.capacitorjs.plugins.pushnotifications.MessagingService';
const COMPONENT_ELEMENT = /<(service|receiver)(?=[\s/>])([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;

const componentsOf = (manifest) =>
  [...manifest.replace(XML_COMMENT, '').matchAll(COMPONENT_ELEMENT)].map(([, tag, source, , body]) => ({
    tag,
    attributes: attributesOf(source),
    body: body ?? '',
  }));

const named = (components, tag, name) =>
  components.find((component) => component.tag === tag && component.attributes.get('android:name') === name);

/**
 * LES COMPOSANTS DE L'APPEL NATIF (#8049) — les violations, une phrase chacune.
 * FCM ne remet un message qu'à UN service `MESSAGING_EVENT` : celui du plugin
 * doit être RETIRÉ à la fusion, sans quoi le nôtre (qui l'étend et lui remet
 * tout ce qui n'est pas un appel) ne reçoit rien. Le service au premier plan
 * porte micro ET caméra (un appel vidéo coupe sinon la caméra écran éteint),
 * et le récepteur de refus n'est pas exporté (sinon n'importe quelle app
 * raccrocherait un appel au nom de l'utilisateur).
 */
export const auditCallComponents = ({ manifest }) => {
  const components = componentsOf(manifest);
  const plugin = named(components, 'service', PLUGIN_MESSAGING_SERVICE);
  const messaging = named(components, 'service', '.MeeshyMessagingService');
  const foreground = named(components, 'service', '.CallForegroundService');
  const decline = named(components, 'receiver', '.DeclineCallReceiver');
  const types = new Set((foreground?.attributes.get('android:foregroundServiceType') ?? '').split('|'));
  return [
    plugin?.attributes.get('tools:node') === 'remove'
      ? null
      : `${PLUGIN_MESSAGING_SERVICE} — non retiré (tools:node="remove") : deux services MESSAGING_EVENT se concurrencent`,
    messaging?.body.includes('com.google.firebase.MESSAGING_EVENT') === true
      ? null
      : '.MeeshyMessagingService — absent ou sans com.google.firebase.MESSAGING_EVENT',
    types.has('microphone') && types.has('camera')
      ? null
      : '.CallForegroundService — foregroundServiceType doit porter microphone ET camera',
    decline?.attributes.get('android:exported') === 'false' ? null : '.DeclineCallReceiver — absent ou exporté',
  ].filter((violation) => violation !== null);
};

const violationLine = ({ permission, count }) =>
  count === 0
    ? `  • ${permission} — manquante (commentée, tools:node="remove" ou android:maxSdkVersion ne comptent pas), ajouter <uses-permission android:name="${permission}" />`
    : `  • ${permission} — déclarée ${count} fois, n'en garder qu'une (cf. 996e392937)`;

export const formatViolations = ({ manifestPath, violations }) =>
  [
    `check-android-manifest: permission(s) manquante(s) ou dupliquée(s) dans ${manifestPath} :`,
    ...violations.map(violationLine),
  ].join('\n');

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `check-android-manifest: manifeste introuvable à ${MANIFEST_PATH} — la coque ` +
        "Android a-t-elle été générée (`bunx cap add android`) ?",
    );
  }

  const manifest = readFileSync(MANIFEST_PATH, 'utf8');
  const violations = auditManifestPermissions({ manifest });

  if (violations.length > 0) {
    throw new Error(formatViolations({ manifestPath: MANIFEST_PATH, violations }));
  }

  const componentViolations = auditCallComponents({ manifest });
  if (componentViolations.length > 0) {
    throw new Error(
      [
        `check-android-manifest: composant(s) de l'appel natif en défaut dans ${MANIFEST_PATH} :`,
        ...componentViolations.map((violation) => `  • ${violation}`),
      ].join('\n'),
    );
  }

  console.log(
    `✓ AndroidManifest.xml de la coque déclare les ${REQUIRED_PERMISSIONS.length} permissions requises (dont ACCESS_NETWORK_STATE, #7844).`,
  );
}

if (isEntryPoint({ moduleUrl: import.meta.url, invokedPath: process.argv[1] })) {
  main();
}
