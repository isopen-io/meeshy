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
 * sous forme d'un `<uses-permission android:name="…" />` — pas zéro, pas deux,
 * jamais en commentaire. Un manifeste absent, illisible, ou une permission
 * manquante / dupliquée / commentée fait échouer ce gate avec le NOM de la
 * permission en défaut — jamais un message générique.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MANIFEST_PATH = join(APP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

/**
 * Permissions que le WEB consomme et que la coque doit donc déclarer.
 * `ACCESS_NETWORK_STATE` (#7844) : useOnline() / socket.ts / receipts.ts /
 * media-absent.ts. Les autres (`INTERNET`, `RECORD_AUDIO`,
 * `MODIFY_AUDIO_SETTINGS`) sont déjà posées (#5668) et restent gardées ici
 * pour que ce témoin soit la référence UNIQUE des permissions de la coque.
 */
export const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
];

/**
 * Ôte les commentaires XML du manifeste — une ligne commentée ne doit pas
 * être comptée comme une déclaration valide.
 */
function stripXmlComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Extrait toutes les occurrences d'une permission dans l'XML (commentaires ôtés).
 * Reconnaît les attributs dans n'importe quel ordre et les guillemets simple/double.
 */
function declaredPermissions(xml) {
  const cleaned = stripXmlComments(xml);
  const matches = [...cleaned.matchAll(
    /<uses-permission\b[^>]*\bandroid:name\s*=\s*["']([^"']+)["'][^>]*\/?>/gi,
  )];
  return matches.map((m) => m[1]);
}

/**
 * Juge si chaque permission requise est déclarée exactement une fois.
 * Retourne un tableau des violations : { permission, count }.
 * Un count !== 1 est une violation (0 = absent, ≥2 = dupliqué).
 */
export const auditManifestPermissions = ({ manifest, required = REQUIRED_PERMISSIONS }) => {
  return required
    .map((permission) => ({
      permission,
      count: declaredPermissions(manifest).filter((n) => n === permission).length,
    }))
    .filter(({ count }) => count !== 1);
};

/**
 * Compose le message d'erreur du gate.
 * Format : une ligne par violation, nommant la permission, son count,
 * et le chemin du manifeste.
 */
export const formatViolations = ({ manifestPath, violations }) => {
  if (violations.length === 0) {
    return '';
  }

  const lines = violations.map(({ permission, count }) => {
    if (count === 0) {
      return `  • ${permission} — manquante, ajouter <uses-permission android:name="${permission}" />`;
    }
    return `  • ${permission} — déclarée ${count} fois, n'en garder qu'une (cf. 996e392937)`;
  });

  return [
    `check-android-manifest: permission(s) manquante(s) ou dupliquée(s) dans ${manifestPath} :`,
    ...lines,
  ].join('\n');
};

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

// N'exécute main() que si ce module est lancé directement,
// pas s'il est importé par un test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
