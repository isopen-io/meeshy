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

import { EVENT_NAMES_KT, REPO, withoutComments } from './mirror-contract';

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

/**
 * Le répertoire des noms partagés — `event-names.ts` ET les dix-huit cartes de
 * DOMAINE qu'il répand (`relation-event-names.ts`, `talkie-event-names.ts`,
 * `battery-event-names.ts`, …). Le `CLAUDE.md` de `packages/shared` les
 * prescrit : « sauf pour les domaines que le web lit dès sa première peinture,
 * leur nom va dans `*-event-names.ts`, que les deux cartes répandent, pour que
 * le socle n'importe pas la carte entière (#9966) ».
 *
 * **Un client s'abonne par la carte de DOMAINE**
 * (`RELATION_SERVER_EVENTS.RELATION_LEVEL_RAISED`,
 * `TALKIE_SERVER_EVENTS.TALKIE_CHUNK`), et les trois formes d'avant ne
 * résolvaient que `SERVER_EVENTS` / `CLIENT_EVENTS` / `SocketEventNames` :
 * l'abonnement RÉEL était invisible, et ce qui sauvait ces événements du
 * verdict « personne ne le lit » était un nom épelé ailleurs — le plus souvent
 * dans un DOC-COMMENT (#20267).
 */
const SHARED_EVENT_NAMES_DIR = 'packages/shared/types/socketio-events';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.kt', '.swift', '.js']);

const sources = (root: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (SOURCE_EXTENSIONS.has(extname(path))) out.push(path);
  }
  return out;
};

/** Les fichiers de NOMS partagés : la carte générale et toutes les cartes de domaine. */
const sharedEventNameFiles = (): readonly string[] =>
  readdirSync(join(REPO, SHARED_EVENT_NAMES_DIR))
    .filter((entry) => entry === 'event-names.ts' || entry.endsWith('-event-names.ts'))
    .map((entry) => join(REPO, SHARED_EVENT_NAMES_DIR, entry));

/**
 * `NOM: 'entity:action'`, de TOUTES les cartes partagées et du miroir Kotlin —
 * et le nom des objets qui les portent, pour n'accepter `X.CLÉ` que sous un
 * porteur de noms d'événements. Résoudre `n'importe.CLÉ` ferait d'une
 * propriété homonyme une citation.
 */
const constantValues = (): { readonly values: ReadonlyMap<string, string>; readonly holders: readonly string[] } => {
  const values = new Map<string, string>();
  const holders = new Set<string>(['SERVER_EVENTS', 'CLIENT_EVENTS', 'SocketEventNames']);
  for (const file of sharedEventNameFiles()) {
    const source = withoutComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/export const (\w+)\s*=\s*\{/g)) holders.add(match[1]);
    for (const match of source.matchAll(/(\w+):\s*'([^']+)'/g)) values.set(match[1], match[2]);
  }
  for (const match of withoutComments(readFileSync(join(REPO, EVENT_NAMES_KT), 'utf8')).matchAll(
    /const\s+val\s+(\w+)\s*(?::\s*String\s*)?=\s*"([^"]+)"/g,
  )) {
    values.set(match[1], match[2]);
  }
  return { values, holders: [...holders] };
};

/**
 * Les noms d'événements qu'un client CITE, dans son CODE.
 *
 * « Cite » et non « écoute » : la distinction est assumée. Prouver qu'un nom
 * est branché à un gestionnaire demanderait de suivre le flot de chaque client ;
 * la citation est la condition NÉCESSAIRE, et elle suffit à trouver ce que
 * personne ne connaît. Un nom cité sans être branché resterait invisible ici —
 * c'est une limite, pas un silence : elle est écrite.
 *
 * **Et elle a une TAILLE, mesurée sur le web au cycle 207** (#20267), parce
 * qu'une limite assumée sans chiffre ne dit pas s'il y a un trou d'un site ou
 * de quatre-vingt-dix : sur les 167 événements que le CODE de `apps/web/src`
 * cite, 163 ont un branchement reconnaissable sous l'une de quatre formes
 * (`socket.on(NOM, h)`, une table de couples `[NOM, h]`, une carte
 * `{ [NOM]: h }`, une LISTE de noms parcourue), et les quatre restants sont des
 * listes EXPORTÉES que leur hôte parcourt dans un AUTRE fichier
 * (`COMMUNITY_MEMBER_EVENTS`, `CALL_LIVE_FRAME_SERVER_EVENTS`,
 * `CALL_RECORDING_SERVER_EVENTS`) — donc branchés. **La classe est vide pour le
 * web aujourd'hui** ; iOS et Android ne sont pas mesurés. Un relevé de
 * BRANCHEMENTS serait un lot à lui : son premier essai, qui ne voyait que
 * `socket.on(`, rendait soixante faux positifs — il a été JETÉ, pas gelé
 * (cycle 107).
 *
 * **Les COMMENTAIRES sont retirés d'abord** (#20267). Sans cela, la phrase qui
 * dit « cet onglet n'écoute pas l'événement » compte comme un lecteur : six
 * citations du relevé étaient des doc-comments, dont DEUX qui NIAIENT l'écoute
 * — `battery:pull-requested` côté web (« le web REÇOIT, il n'émet pas … cet
 * onglet n'écoute pas l'événement ») et `user:preferences-community-reordered`
 * côté Android (« stays unheard: measured, nothing under `apps/android` caches
 * a community-preference row »). Une NÉGATION lue comme une affirmation rend
 * invisible exactement ce que ces deux gardes cherchent, et c'est le sens
 * d'erreur qui ne crie pas. `withoutComments` vit dans le module voisin, déjà
 * exporté, et déjà employé par les relevés de contrat.
 */
const namedUnder = (
  roots: readonly string[],
  constants: { readonly values: ReadonlyMap<string, string>; readonly holders: readonly string[] },
): ReadonlySet<string> => {
  const named = new Set<string>();
  const holder = new RegExp(`\\b(?:${constants.holders.join('|')})\\.(\\w+)`, 'g');
  for (const root of roots) {
    for (const file of sources(join(REPO, root))) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/['"`]([a-z][\w-]*:[a-z][\w-]*(?::[\w-]+)?)['"`]/g)) named.add(match[1]);
      for (const match of source.matchAll(holder)) {
        const value = constants.values.get(match[1]);
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
