// packages/shared/__tests__/ci/socket-payload-shape/seq-lockstep.ts
//
// « Qui ESTAMPILLE le curseur `_seq`, et qui l'OBSERVE ? » — les deux relevés
// que la règle de lockstep d'`emitWithSeq` exige, et que rien ne tenait.
//
// ─── La règle, et pourquoi elle a besoin d'un cliquet ──────────────────────
//
// `emitWithSeq` (`services/gateway/src/socketio/utils/emitWithSeq.ts`) écrit
// un curseur monotone PAR COMPTE sur les émissions user-scoped, et son
// doc-comment énonce la condition qui le rend sûr :
//
//   « le `_seq` est per-user GLOBAL, pas per-event. Un client qui n'observe
//     qu'un SOUS-ENSEMBLE des events estampillés voit un trou à chaque event
//     non observé. »
//
// Un curseur global observé partiellement est donc PIRE que pas de curseur :
// il fabrique des trous là où rien n'a été perdu, et chaque faux trou coûte
// une resynchronisation complète au client qui le croit.
//
// La règle est transverse au TRANSPORT, pas déclarée par événement — c'est
// exactement ce qui la met hors de portée des six cliquets de contrat socket,
// qui répondent tous « ce NOM existe-t-il de part et d'autre ? ». Aucun ne
// peut répondre « ce nom porte-t-il un curseur, et qui le lit ? ».
//
// ─── Les deux relevés ne sont PAS symétriques, et c'est voulu ──────────────
//
// Côté PASSERELLE, le relevé est fail-CLOSED : un site `emitWithSeq(` dont
// l'événement n'est pas résoluble est une ERREUR qui se nomme. Le compter
// comme « site sans événement » retirerait du périmètre le seul site qu'on
// n'a pas su lire — un cliquet qui s'amnistie sur ce qu'il ne comprend pas.
//
// Côté CLIENT, une occurrence du curseur qu'on ne sait pas lier à un événement
// est IGNORÉE. La différence tient à ce que chaque côté prouve : la passerelle
// a un site d'appel unique et nommé (`emitWithSeq`), donc tout site est un
// site d'estampillage ; un client cite son tracker aussi pour le construire,
// le remettre à zéro ou le passer en dépendance, et aucune de ces citations
// n'observe quoi que ce soit. La conséquence est écrite : un client qui
// DÉPLACE son observation hors de la portée du liage rend ce cliquet ROUGE,
// et c'est le bon comportement — il force à relire le liage plutôt qu'à le
// croire.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { CLIENT_EVENTS, SERVER_EVENTS } from '../../../types/socketio-events';
import { CLIENT_PLATFORM_ROOTS, CLIENT_PLATFORMS, type ClientPlatform } from './client-event-readers';
import { EVENT_NAMES_KT, REPO } from './mirror-contract';

const GATEWAY_ROOT = 'services/gateway/src';
const SWIFT_EVENT_ENUM = 'packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketEvent.swift';

/**
 * Les plateformes qui n'observent AUCUN curseur, avec leur raison et son
 * issue. L'inventaire est à DEUX sens (comme ses voisins) : une plateforme
 * qui gagne un observateur doit en SORTIR, sans quoi le cliquet rougit.
 *
 * Il ne porte aucun verdict de produit : décider si le web doit observer le
 * curseur appartient à #18601, pas à ce fichier.
 */
export const PLATFORMS_WITHOUT_SEQ_CURSOR: ReadonlyMap<ClientPlatform, string> = new Map<ClientPlatform, string>([
  [
    'web',
    "#18601 — aucune occurrence de `_seq`, `observeSyncSeq`, `lastSeq` ni `checkpointSeq` au sens du SyncEngine sous `apps/web/src` ; l'observateur que trois doc-comments du dépôt nommaient (`notification-socketio.singleton.ts`) appartenait au web LEGACY, sorti du dépôt au #7668.",
  ],
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.kt', '.swift']);

/**
 * Un chemin de TEST ne prouve rien sur ce que le client fait en production :
 * un double construit un tracker et l'observe pour l'exercer. Les compter
 * crediterait une plateforme d'une observation qu'aucun utilisateur ne reçoit.
 */
const TEST_PATH_MARKERS: readonly string[] = [
  '/__tests__/',
  '/test/',
  '/androidTest/',
  '/Tests/',
  '.test.',
  '.spec.',
  'Tests.swift',
  'Test.swift',
  'Test.kt',
  'Tests.kt',
];

const isTestPath = (path: string): boolean => TEST_PATH_MARKERS.some((marker) => path.includes(marker));

const sources = (root: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (SOURCE_EXTENSIONS.has(extname(path)) && !isTestPath(path)) out.push(path);
  }
  return out;
};

/**
 * Sans dépouillement, un doc-comment qui CITE le curseur et un nom
 * d'événement — il y en a dans les trois plateformes, et ce sont justement
 * ceux qui disaient faux — créditerait l'observation que le commentaire
 * décrit au lieu de celle que le code fait.
 *
 * La garde `([^:])` avant `//` évite de tronquer une URL dans une chaîne.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const sharedConstants = (): ReadonlyMap<string, string> =>
  new Map<string, string>([
    ...Object.entries(SERVER_EVENTS).map(([key, value]) => [key, value] as const),
    ...Object.entries(CLIENT_EVENTS).map(([key, value]) => [key, value] as const),
  ]);

const kotlinConstants = (): ReadonlyMap<string, string> =>
  new Map(
    [
      ...stripComments(readFileSync(join(REPO, EVENT_NAMES_KT), 'utf8')).matchAll(
        /const\s+val\s+(\w+)\s*(?::\s*String\s*)?=\s*"([^"]+)"/g,
      ),
    ].map((match) => [match[1], match[2]] as const),
  );

/** `case notificationNew = "notification:new"` — la carte que les routes iOS épellent. */
const swiftEnumCases = (): ReadonlyMap<string, string> =>
  new Map(
    [...stripComments(readFileSync(join(REPO, SWIFT_EVENT_ENUM), 'utf8')).matchAll(/case\s+(\w+)\s*=\s*"([^"]+)"/g)].map(
      (match) => [match[1], match[2]] as const,
    ),
  );

/** L'index du `)` qui ferme le `(` ouvert à `open`, ou `-1`. */
const matchingParen = (source: string, open: number): number => {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

export type StampSite = {
  readonly file: string;
  readonly event: string | null;
};

/**
 * Les sites qui estampillent le curseur, relevés dans les ARGUMENTS du site
 * d'appel — bornés par la parenthèse fermante, jamais par un nombre de
 * caractères : un appel sur plusieurs lignes (il y en a) serait tronqué, et
 * une fenêtre trop large attribuerait à un appel l'événement de l'instruction
 * SUIVANTE. Le bornage syntaxique ne peut faire ni l'un ni l'autre.
 */
export const seqStampSites = (): readonly StampSite[] => {
  const shared = sharedConstants();
  const wireNames = new Set(shared.values());
  const sites: StampSite[] = [];

  for (const file of sources(join(REPO, GATEWAY_ROOT))) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/(?<![\w.])emitWithSeq\s*\(/g)) {
      const open = match.index + match[0].length - 1;
      // La DÉCLARATION n'estampille rien : elle décrit le paramètre.
      if (/\b(?:function|declare)\s+$/.test(source.slice(Math.max(0, match.index - 20), match.index))) continue;
      const close = matchingParen(source, open);
      const args = close === -1 ? source.slice(open) : source.slice(open, close);
      const token = /\b(?:SERVER_EVENTS|CLIENT_EVENTS)\.(\w+)/.exec(args);
      const literal = [...args.matchAll(/['"`]([a-z][\w-]*:[a-z][\w-]*(?::[\w-]+)?)['"`]/g)].find((candidate) =>
        wireNames.has(candidate[1]),
      );
      const event = token ? shared.get(token[1]) ?? null : literal ? literal[1] : null;
      sites.push({ file: file.slice(REPO.length + 1), event });
    }
  }

  return sites;
};

export const seqStampedEvents = (): ReadonlySet<string> =>
  new Set(seqStampSites().flatMap((site) => (site.event === null ? [] : [site.event])));

/**
 * Ce qui compte comme une OBSERVATION, et rien d'autre : un appel à `observe`
 * sur le tracker, ou le relais web `observeSyncSeq`. Citer `SyncSeqTracker`
 * pour le construire, le remettre à zéro (`reset()`) ou le passer en
 * dépendance n'observe aucun curseur — et ces citations existent sur les deux
 * plateformes qui en ont un, donc les accepter créditerait l'événement que le
 * hasard du voisinage aurait placé devant elles.
 */
const OBSERVATION =
  /(?:\bobserveSyncSeq\s*\(|(?:SyncSeqTracker\s*\.\s*shared|\bsyncSeqTracker)\s*\.\s*observe\s*\()/g;

/**
 * La fenêtre amont dans laquelle l'événement de la route est cherché. Le liage
 * prend le DERNIER nom résoluble qui précède l'observation : celui de la route
 * qui l'englobe. Prendre le premier, ou balayer en aval, attribuerait à
 * l'observation les routes voisines — et les familles d'événements sont
 * déclarées en listes contiguës sur les trois plateformes.
 */
const UPSTREAM_WINDOW = 400;

const resolveLast = (
  window: string,
  pattern: RegExp,
  resolve: (key: string) => string | undefined,
): { readonly at: number; readonly event: string } | null => {
  let best: { at: number; event: string } | null = null;
  for (const match of window.matchAll(pattern)) {
    const event = resolve(match[1]);
    if (event !== undefined) best = { at: match.index, event };
  }
  return best;
};

export type ObservationSite = {
  readonly file: string;
  readonly event: string | null;
};

/**
 * Les sites d'OBSERVATION sous ces racines, chacun portant l'événement de sa
 * route — ou `null` quand le liage n'a rien trouvé.
 *
 * UN seul relevé, dont tout le reste dérive : les trois questions du cliquet
 * (quels événements sont observés ? cette plateforme en observe-t-elle un ?
 * un site échappe-t-il au liage ?) sont trois lectures du MÊME relevé, jamais
 * trois balayages. Deux relevés du même fait gardés séparément sont la forme
 * que ce dépôt a déjà payée plusieurs fois (cycles 161 et 162).
 */
const observationSitesUnder = (roots: readonly string[]): readonly ObservationSite[] => {
  const shared = sharedConstants();
  const kotlin = kotlinConstants();
  const swift = swiftEnumCases();
  const wireNames = new Set(shared.values());
  const sites: ObservationSite[] = [];

  for (const root of roots) {
    for (const file of sources(join(REPO, root))) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(OBSERVATION)) {
        const window = source.slice(Math.max(0, match.index - UPSTREAM_WINDOW), match.index);
        const candidates = [
          resolveLast(window, /\b(?:SERVER_EVENTS|CLIENT_EVENTS)\.(\w+)/g, (key) => shared.get(key)),
          resolveLast(window, /\bSocketEventNames\s*\.\s*(\w+)/g, (key) => kotlin.get(key)),
          resolveLast(window, /\.(\w+)/g, (key) => swift.get(key)),
          resolveLast(window, /['"`]([a-z][\w-]*:[a-z][\w-]*(?::[\w-]+)?)['"`]/g, (key) =>
            wireNames.has(key) ? key : undefined,
          ),
        ].flatMap((candidate) => (candidate === null ? [] : [candidate]));
        const nearest = candidates.sort((left, right) => right.at - left.at)[0];
        sites.push({ file: file.slice(REPO.length + 1), event: nearest?.event ?? null });
      }
    }
  }

  return sites;
};

export const seqObservationSitesByPlatform = (): ReadonlyMap<ClientPlatform, readonly ObservationSite[]> =>
  new Map(
    CLIENT_PLATFORMS.map((platform) => [platform, observationSitesUnder(CLIENT_PLATFORM_ROOTS[platform])] as const),
  );

export const seqObservedByPlatform = (): ReadonlyMap<ClientPlatform, ReadonlySet<string>> =>
  new Map(
    [...seqObservationSitesByPlatform()].map(
      ([platform, sites]) =>
        [platform, new Set(sites.flatMap((site) => (site.event === null ? [] : [site.event])))] as const,
    ),
  );
