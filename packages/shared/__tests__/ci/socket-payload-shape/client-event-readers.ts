// packages/shared/__tests__/ci/socket-payload-shape/client-event-readers.ts
//
// QUI LIT un événement du contrat — la question que les trois gardes de NOMS ne
// posent pas (#18342).
//
// Elles vérifient qu'aucun client n'écoute HORS contrat. L'inverse — un
// événement du contrat que personne ne lit — n'était gardé par rien, et il
// coûte des deux côtés : la passerelle construit une charge, résout une
// audience et traverse l'adaptateur Redis pour personne, pendant que le nom
// se lit comme une feature existante dans les miroirs et les gardes.
//
// ─── Pourquoi la lecture doit résoudre les CONSTANTES ─────────────────────
//
// Un balayage LITTÉRAL seul se trompe, et c'est mesuré : le web écoute
// `friend-request:accepted` par `SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED`, sans
// jamais épeler le nom. Une garde bâtie sur les littéraux l'aurait déclaré
// orphelin — et un outil qui crie à tort finit désarmé (cycle 107, balayage
// JETÉ plutôt que gelé).
//
// Trois formes de citation comptent donc, et elles suffisent parce que les
// trois gardes de noms interdisent la quatrième (un nom construit) :
//
//   · le littéral, où qu'il soit (l'enum Swift `SocketEvent` en vit) ;
//   · `SERVER_EVENTS.X` / `CLIENT_EVENTS.X`, résolus par `event-names.ts` ;
//   · `SocketEventNames.X`, résolu par le miroir Kotlin.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { EVENT_NAMES_KT, REPO } from './mirror-contract';

/**
 * Les racines PAR PLATEFORME. iOS en a deux — le SDK et l'application — et
 * c'est une plateforme, pas deux : un événement cité dans l'un des deux est
 * connu d'iOS.
 */
export const CLIENT_PLATFORM_ROOTS = {
  web: ['apps/web/src'],
  android: ['apps/android'],
  ios: ['packages/MeeshySDK/Sources', 'apps/ios/Meeshy'],
} as const;

export type ClientPlatform = keyof typeof CLIENT_PLATFORM_ROOTS;

export const CLIENT_PLATFORMS = Object.keys(CLIENT_PLATFORM_ROOTS) as readonly ClientPlatform[];

export const CLIENT_ROOTS = Object.values(CLIENT_PLATFORM_ROOTS).flat() as readonly string[];

export const SHARED_EVENT_NAMES_TS = 'packages/shared/types/socketio-events/event-names.ts';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.kt', '.swift', '.js']);

const sources = (root: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (SOURCE_EXTENSIONS.has(extname(path))) out.push(path);
  }
  return out;
};

/** `NOM: 'entity:action'`, des deux cartes partagées et du miroir Kotlin. */
const constantValues = (): ReadonlyMap<string, string> => {
  const shared = readFileSync(join(REPO, SHARED_EVENT_NAMES_TS), 'utf8');
  const kotlin = readFileSync(join(REPO, EVENT_NAMES_KT), 'utf8');
  return new Map([
    ...[...shared.matchAll(/(\w+):\s*'([^']+)'/g)].map((match) => [match[1], match[2]] as const),
    ...[...kotlin.matchAll(/const\s+val\s+(\w+)\s*(?::\s*String\s*)?=\s*"([^"]+)"/g)].map(
      (match) => [match[1], match[2]] as const,
    ),
  ]);
};

/**
 * Les noms d'événements qu'un client CITE, sous l'une des trois formes.
 *
 * « Cite » et non « écoute » : la distinction est assumée. Prouver qu'un nom
 * est branché à un gestionnaire demanderait de suivre le flot de chaque client ;
 * la citation est la condition NÉCESSAIRE, et elle suffit à trouver ce que
 * personne ne connaît. Un nom cité sans être branché resterait invisible ici —
 * c'est une limite, pas un silence : elle est écrite.
 */
const namedUnder = (roots: readonly string[], constants: ReadonlyMap<string, string>): ReadonlySet<string> => {
  const named = new Set<string>();
  for (const root of roots) {
    for (const file of sources(join(REPO, root))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/['"`]([a-z][\w-]*:[a-z][\w-]*(?::[\w-]+)?)['"`]/g)) named.add(match[1]);
      for (const match of source.matchAll(/\b(?:SERVER_EVENTS|CLIENT_EVENTS|SocketEventNames)\.(\w+)/g)) {
        const value = constants.get(match[1]);
        if (value) named.add(value);
      }
    }
  }
  return named;
};

/**
 * Le même relevé, PAR PLATEFORME (#18342, cycle 161).
 *
 * `eventsNamedByClients` répond « au moins un client connaît ce nom » — ce qui
 * suffit à trouver l'orphelin TOTAL, et masque par construction l'asymétrie :
 * un événement que deux clients lisent et que le troisième ignore y est
 * indiscernable d'un événement lu par les trois. C'est la limite que #18342
 * s'écrivait (« elle ne dit rien des événements écoutés par un seul client là
 * où trois devraient l'être »), et cette fonction est ce qui permet de la
 * mesurer.
 *
 * Les deux relevés partagent leur BALAYAGE : `eventsNamedByClients` est
 * désormais l'union de celui-ci, et ne peut plus en diverger.
 */
export const eventsNamedByPlatform = (): ReadonlyMap<ClientPlatform, ReadonlySet<string>> => {
  const constants = constantValues();
  return new Map(
    CLIENT_PLATFORMS.map((platform) => [platform, namedUnder(CLIENT_PLATFORM_ROOTS[platform], constants)] as const),
  );
};

export const eventsNamedByClients = (): ReadonlySet<string> => {
  const union = new Set<string>();
  for (const named of eventsNamedByPlatform().values()) for (const event of named) union.add(event);
  return union;
};
