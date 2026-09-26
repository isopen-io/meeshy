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
 */
export const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
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

  console.log(
    `✓ AndroidManifest.xml de la coque déclare les ${REQUIRED_PERMISSIONS.length} permissions requises (dont ACCESS_NETWORK_STATE, #7844).`,
  );
}

if (isEntryPoint({ moduleUrl: import.meta.url, invokedPath: process.argv[1] })) {
  main();
}
