// packages/shared/__tests__/ci/socket-event-name-gate.test.ts
//
// « Qui l'ÉMET ? » se pose séparément de « qui l'écoute ? » — et sur les deux
// clients qui épellent les noms d'événements EN CLAIR, personne ne posait ni
// l'une ni l'autre.
//
// ─── D'où vient cette garde ────────────────────────────────────────────────
//
// Le cycle 75 a trouvé un contrat écrit, un récepteur iOS complet et testé, et
// AUCUN émetteur serveur (`call:force-leave`). La leçon déposée
// (`tasks/lessons.md`, 2026-08-21) nommait déjà le remède : « pour tout
// événement serveur→client du contrat partagé, la question "qui l'ÉMET ?" se
// pose séparément de "qui l'écoute ?" ».
//
// Le cycle 76 a trouvé le défaut SYMÉTRIQUE, et deux fois : Android s'abonnait
// à `message:updated` et à `transcription:ready` — deux noms qui n'existent
// NULLE PART ailleurs dans le dépôt. Ni dans le contrat, ni dans la passerelle,
// ni chez les deux autres clients. En aval, tout était juste : le flow, le
// collecteur du ViewModel, le rafraîchissement du dépôt. Seule la chaîne de
// caractères était fausse, et rien ne pouvait s'en apercevoir — un abonnement
// Socket.IO à un nom que personne ne prononce ne rend aucune erreur, il se tait.
//
// Un test d'unité ne l'attrape pas : il injecte l'événement lui-même, donc il
// vérifie le décodage, jamais le NOM du canal. C'est exactement pourquoi les
// quatre tests iOS de `call:force-leave` étaient verts sur une fonction que le
// serveur n'avait jamais implémentée.
//
// ─── Ce que la garde vérifie ───────────────────────────────────────────────
//
// Tout nom d'événement Socket.IO épelé en clair par iOS ou Android — abonnement
// (`socket.on("…")` / `listen("…")`) comme émission (`socket.emit("…")` /
// `emit("…")`) — DOIT être une valeur déclarée du contrat partagé
// (`SERVER_EVENTS`, `CLIENT_EVENTS`, `CALL_EVENTS`).
//
// Les objets sont IMPORTÉS, jamais relus au motif d'expression régulière : le
// jeu déclaré est littéralement l'ensemble des valeurs à l'exécution. Une
// lecture textuelle du fichier ferait passer pour « déclaré » un nom qui n'y
// figure qu'en PROSE — or `message:updated` aurait pu être cité dans un
// commentaire, et la garde aurait béni le défaut qu'elle est écrite pour
// interdire.
//
// ─── Pourquoi iOS et Android, et pas le web ────────────────────────────────
//
// Le web importe `SERVER_EVENTS` et passe les constantes : `socket.on(SERVER_
// EVENTS.MESSAGE_EDITED, …)`. Un nom faux n'y compile pas — le typage tient
// déjà la garantie, et l'y rejouer ne prouverait rien. Swift et Kotlin n'ont
// pas ce contrat partagé à l'exécution : ils recopient la chaîne à la main.
// C'est cette recopie, et elle seule, que ce fichier surveille.
//
// ─── Placement ─────────────────────────────────────────────────────────────
//
// Même raison que `ios-pr-compile-gate.test.ts` et
// `lentille-tokens-consumption-gate.test.ts`, ses voisins de dossier :
// `packages/shared` tourne sur CHAQUE PR (`ci.yml`, matrice `test`), c'est donc
// le seul point d'observation commun aux deux plateformes. La suite Android ne
// tourne, elle, que dans son propre workflow — et ne pourrait de toute façon
// pas lire le contrat TypeScript.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join, relative } from 'node:path';

import { CLIENT_EVENTS, SERVER_EVENTS } from '../../types/socketio-events';
import { CALL_EVENTS } from '../../types/video-call';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const DECLARED_EVENT_NAMES: ReadonlySet<string> = new Set<string>([
  ...Object.values(SERVER_EVENTS),
  ...Object.values(CLIENT_EVENTS),
  ...Object.values(CALL_EVENTS),
]);

/**
 * Noms de TRANSPORT, appartenant à Socket.IO lui-même et non au produit :
 * aucune passerelle ne les émet, aucun contrat ne les déclare. Ils ne peuvent
 * pas dériver — c'est la bibliothèque qui les définit.
 *
 * Cette table n'est PAS un dépotoir à exceptions produit. Un nom d'événement
 * applicatif qui manque au contrat se corrige en l'ajoutant au contrat, jamais
 * en l'inscrivant ici.
 */
const TRANSPORT_EVENT_NAMES: ReadonlySet<string> = new Set<string>([
  'connect',
  'connect_error',
  'connecting',
  'disconnect',
  'error',
  'reconnect',
  'reconnect_attempt',
  'reconnect_error',
  'reconnect_failed',
  'ping',
  'pong',
]);

/**
 * Les sites où chaque client épelle un nom de canal en clair.
 *
 * Android fait transiter TOUS ses abonnements par des aides `listen("…", flow)`
 * par gestionnaire (`MessageSocketManager`, `CallSignalManager`,
 * `SocialSocketManager`, `CategorySocketManager`), qui appellent ensuite
 * `socketManager.on(event)` avec la variable — c'est donc le littéral passé à
 * `listen(` qui porte le nom, et lui seul.
 */
const LITERAL_PATTERNS: ReadonlyArray<{ readonly label: string; readonly regex: RegExp }> = [
  { label: 'socket.on', regex: /\bsocket\.on\(\s*"([^"]+)"/g },
  { label: 'socket.emit', regex: /\bsocket\.emit\(\s*"([^"]+)"/g },
  { label: 'emitWithAck', regex: /\bemitWithAck\(\s*"([^"]+)"/g },
  { label: 'listen', regex: /\blisten\(\s*"([^"]+)"/g },
  { label: 'emit', regex: /(?<![.\w])emit\(\s*"([^"]+)"/g },
];

const SCANNED_ROOTS: ReadonlyArray<{ readonly platform: string; readonly path: string }> = [
  { platform: 'iOS (SDK)', path: 'packages/MeeshySDK/Sources' },
  { platform: 'iOS (app)', path: 'apps/ios/Meeshy' },
  { platform: 'Android', path: 'apps/android' },
];

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.swift', '.kt']);

/**
 * Un test injecte l'événement lui-même : le nom qu'il épelle est une DONNÉE
 * d'entrée, pas un abonnement vivant. L'y soumettre transformerait la garde en
 * interdiction d'écrire un cas de régression sur un nom fautif — précisément le
 * témoin qui prouve qu'un défaut est corrigé.
 */
const TEST_PATH_MARKERS: ReadonlyArray<string> = [
  '/Tests/',
  '/test/',
  '/androidTest/',
  '__tests__',
  'Test.kt',
  'Tests.swift',
  'Test.swift',
];

function isTestPath(absolutePath: string): boolean {
  return TEST_PATH_MARKERS.some((marker) => absolutePath.includes(marker));
}

function collectSourceFiles(absoluteRoot: string): ReadonlyArray<string> {
  let entries: ReadonlyArray<string>;
  try {
    entries = readdirSync(absoluteRoot);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'build' || entry === '.git') return [];
    const absolute = join(absoluteRoot, entry);
    if (statSync(absolute).isDirectory()) return collectSourceFiles(absolute);
    if (!SCANNED_EXTENSIONS.has(extname(absolute))) return [];
    if (isTestPath(absolute)) return [];
    return [absolute];
  });
}

type Occurrence = {
  readonly platform: string;
  readonly file: string;
  readonly site: string;
  readonly eventName: string;
};

function collectOccurrences(): ReadonlyArray<Occurrence> {
  return SCANNED_ROOTS.flatMap(({ platform, path }) =>
    collectSourceFiles(join(REPO_ROOT, path)).flatMap((absolute) => {
      const source = readFileSync(absolute, 'utf8');
      const file = relative(REPO_ROOT, absolute);
      return LITERAL_PATTERNS.flatMap(({ label, regex }) =>
        [...source.matchAll(new RegExp(regex.source, regex.flags))].map((match) => ({
          platform,
          file,
          site: label,
          eventName: match[1],
        }))
      );
    })
  );
}

/**
 * Un nom d'événement du produit porte toujours `entity:action-word`
 * (`packages/shared/types/socketio-events.ts`, en-tête). Les littéraux qui n'en
 * portent pas — un nom de room, un identifiant, une clé — ne sont pas des
 * canaux et n'ont rien à faire dans la comparaison.
 */
const PRODUCT_EVENT_SHAPE = /^[a-z][a-z0-9-]*:[a-z0-9:-]+$/;

describe('socket event names spelled out by native clients', () => {
  const occurrences = collectOccurrences();

  // Sans ces deux témoins, un chemin déplacé, une aide renommée ou une
  // expression régulière cassée rendrait la garde VERTE en ne trouvant plus
  // rien à vérifier. Et le compte GLOBAL ne suffit pas : iOS pèse à lui seul
  // plus de cent littéraux, donc un scan Android muet passerait inaperçu
  // derrière lui. Le seuil se pose PAR PLATEFORME, très en dessous du compte
  // réel (~110 iOS, ~47 Android) — il atteste que le scan trouve encore
  // quelque chose, il ne fige pas un inventaire.
  it.each([
    ['iOS', 60],
    ['Android', 25],
  ])('still finds the literal event names spelled out by %s', (platform, floor) => {
    const found = occurrences.filter((o) => o.platform.startsWith(platform));
    expect(found.length).toBeGreaterThanOrEqual(floor);
  });

  it('only ever names a channel the shared contract declares', () => {
    const undeclared = occurrences.filter(
      (o) =>
        PRODUCT_EVENT_SHAPE.test(o.eventName) &&
        !DECLARED_EVENT_NAMES.has(o.eventName) &&
        !TRANSPORT_EVENT_NAMES.has(o.eventName)
    );

    expect(
      undeclared.map((o) => `${o.platform} — ${o.file} — ${o.site}("${o.eventName}")`).sort()
    ).toEqual([]);
  });
});
