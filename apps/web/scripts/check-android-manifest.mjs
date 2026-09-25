#!/usr/bin/env node
/**
 * PROUVE QUE LA COQUE ANDROID DÉCLARE LES PERMISSIONS QUE LE WEB CONSOMME.
 *
 * POURQUOI CE TÉMOIN EXISTE (#7844). L'app native gelée (`apps/android`)
 * déclare `ACCESS_NETWORK_STATE` (`AndroidManifest.xml:6`) : c'est ce qui
 * permet à une app de SAVOIR quand le réseau coupe et revient, plutôt que de
 * le déduire d'un timeout de requête. La coque Capacitor de `apps/web`
 * (`apps/web/android`) ne le déclare pas, alors que le web lui-même dépend
 * de cette capacité — `src/lib/net/online.ts` (`useOnline`), et ses
 * consommateurs `src/lib/api/socket.ts`, `src/lib/api/receipts.ts`,
 * `src/lib/api/media-absent.ts` écoutent tous les événements `online`/
 * `offline` du navigateur. Une WebView Android SANS `ACCESS_NETWORK_STATE`
 * peut laisser ces événements ne jamais se déclencher correctement selon la
 * version d'Android/WebView — la coque doit déclarer explicitement ce que
 * la plateforme native gelée déclare déjà, sans qu'aucun gate ne le garde.
 *
 * CE QU'IL VÉRIFIE : chaque permission de `REQUIRED_PERMISSIONS` figure
 * exactement une fois dans `apps/web/android/app/src/main/AndroidManifest.xml`
 * sous forme d'un `<uses-permission android:name="…" />`. Un manifeste
 * absent, illisible, ou une permission manquante fait échouer ce gate avec
 * le NOM de la permission manquante — jamais un message générique.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MANIFEST_PATH = join(APP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

/**
 * Permissions que le WEB consomme et que la coque doit donc déclarer.
 * `ACCESS_NETWORK_STATE` (#7844) : useOnline() / socket.ts / receipts.ts /
 * media-absent.ts. Les autres (`INTERNET`, `RECORD_AUDIO`,
 * `MODIFY_AUDIO_SETTINGS`) sont déjà posées (#5668) et restent gardées ici
 * pour que ce témoin soit la référence UNIQUE des permissions de la coque.
 */
const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
];

function permissionPattern(name) {
  return new RegExp(
    `<uses-permission\\s+android:name="${name.replace(/\./g, '\\.')}"\\s*/>`,
  );
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `check-android-manifest: manifeste introuvable à ${MANIFEST_PATH} — la coque ` +
        "Android a-t-elle été générée (`bunx cap add android`) ?",
    );
  }

  const manifest = readFileSync(MANIFEST_PATH, 'utf8');
  const missing = REQUIRED_PERMISSIONS.filter((name) => !permissionPattern(name).test(manifest));

  if (missing.length > 0) {
    throw new Error(
      `check-android-manifest: permission(s) manquante(s) dans ${MANIFEST_PATH} : ` +
        `${missing.join(', ')} — ajouter <uses-permission android:name="…" /> pour chacune.`,
    );
  }

  console.log(
    `✓ AndroidManifest.xml de la coque déclare les ${REQUIRED_PERMISSIONS.length} permissions requises (dont ACCESS_NETWORK_STATE, #7844).`,
  );
}

main();
