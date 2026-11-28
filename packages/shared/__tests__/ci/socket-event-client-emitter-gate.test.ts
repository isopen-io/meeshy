// packages/shared/__tests__/ci/socket-event-client-emitter-gate.test.ts
//
// LA HUITIÈME CASE : le canal montant qu'AUCUN client n'émet (#20791).
//
// ─── Une direction a DEUX bouts, et la montante n'en avait qu'un ──────────
//
// Sept cliquets tiennent ce contrat, et `packages/shared/CLAUDE.md` affirme que
// la direction MONTANTE est fermée depuis #18499. Elle l'était à moitié :
//
//   descendant (`SERVER_EVENTS`) · bout serveur → `socket-event-emitter-gate`
//   descendant                   · bout client  → `socket-event-orphan-gate`
//                                                 + `…-platform-parity-gate`
//   montant (`CLIENT_EVENTS`)    · bout serveur → `socket-event-handler-gate`
//   montant                      · bout client  → **RIEN**
//
// Le raisonnement de #18499 s'applique mot pour mot à la case vide, les rôles
// inversés — et le prix n'est pas le même, ce qui est le point. Là-bas, un
// canal sans écouteur SE TAIT : Socket.IO laisse tomber l'événement sans lever
// la moindre erreur. Ici, un canal sans ÉMETTEUR est tout le contraire du
// silence : un `socket.on` vivant, sa validation Zod, son seau de débit, ses
// gardes de participation vivante et ses témoins, **maintenus pour un appelant
// qui n'existe pas** — et qui se lisent partout comme une feature en service.
//
// ─── Ce qui a amené la question, et pourquoi il fallait un OUTIL ──────────
//
// #20414 a mesuré ce défaut À LA MAIN, sur un seul nom. Deux doc-comments de
// service invoquaient « un client qui doute resynchronise
// (`comment:reaction-request-sync`) » comme la RAISON d'accepter une fenêtre de
// réordonnancement. Relevé : le serveur le sert, les deux SDK le déclarent,
// zéro site d'application l'appelle, le web ne le connaît pas, et le sujet iOS
// qui porterait son ACK n'a aucun producteur. **La justification était fausse,
// et rien ne pouvait le dire.**
//
// Le balayage rend plus que le nom de #20778, et c'est la leçon 261 dans sa
// forme habituelle : une énumération porte deux affirmations, et c'est la
// seconde — « ce sont LES sites » — que personne ne vérifie. Comme pour #18342
// et #18499, ce qui manquait n'était pas une relecture mais un outil.
//
// ─── Ce que la garde mesure, et la limite qu'elle s'écrit ─────────────────
//
// « Un client CITE ce nom », par `eventsNamedByClients` — le relevé PARTAGÉ
// avec l'orphan gate et le parity gate, qui résout les constantes et dépouille
// les commentaires. Partagé, donc il ne peut pas en diverger : un balayage
// littéral seul se tromperait (le web n'épelle jamais les noms), et un
// commentaire qui NIE une émission compterait comme un émetteur.
//
// **La limite est le PALIER, et elle est écrite parce qu'elle est exactement
// celle qui a laissé vivre #20778** : « cité » n'est pas « appelé ». Le palier 2
// — « la méthode SDK qui l'émet a-t-elle un appelant HORS du SDK ? » — est une
// question de graphe d'appels, et il reste à faire (#20791). La mesure dit
// pourquoi il ne se réduit pas à « cité seulement par un SDK » : ce critère rend
// 25 entrées dont la plupart sont saines, `conversation:join` et `feed:subscribe`
// n'étant cités que par les SDK parce que l'application appelle
// `joinConversation()`, pas le nom. Il mesurerait la bonne ENCAPSULATION du SDK,
// pas une propriété utile — la faute du cycle 107, dont le balayage fut JETÉ
// plutôt que gelé.
//
// Le palier 1 se trompe donc du côté PERMISSIF : il ne prouve pas qu'un
// événement PART, il prouve qu'un client connaît son nom. C'est suffisant pour
// la classe visée — un canal que RIEN, nulle part, ne mentionne côté client —
// et cela ne peut pas rougir à tort.
//
// ─── L'inventaire, et ce qu'il ne décide pas ──────────────────────────────
//
// Il porte la MESURE et une raison par FAMILLE. Il ne porte AUCUN verdict :
// décider s'il faut écrire l'émetteur, retirer le handler ou retirer la
// déclaration appartient au produit (#20791), et ce n'est pas la même décision
// pour une porte d'authentification et pour une resynchronisation de réactions.
//
// **Aucun retrait n'est demandé ici.** La rétrocompatibilité (#9223) s'applique :
// un client DÉPLOYÉ peut émettre un nom que le dépôt n'écrit plus, et un retrait
// exige une mesure de parc. Ce cliquet demande que la liste soit connue et
// qu'elle ne grandisse pas en silence.
//
// Le cliquet est à DEUX SENS, comme ses voisins : une dette neuve rougit chez
// celui qui l'écrit, et un canal qui gagne son émetteur doit SORTIR de
// l'inventaire — sans quoi la liste se périme en affirmant un manque comblé.
//
// **Cinq noms sont aussi dans l'inventaire de `socket-event-handler-gate`, et
// ce n'est pas un doublon** : ce sont DEUX propriétés d'un même nom (personne ne
// l'écoute / personne ne l'émet), et un nom peut manquer des deux bouts. Les
// confondre perdrait la distinction qui porte toute la valeur de ce fichier —
// quatre des neuf ont, eux, un écouteur VIVANT.
//
// `packages/shared` tourne sur CHAQUE PR (`ci.yml`, matrice `test`).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLIENT_EVENTS } from '../../types/socketio-events';
import { CLIENT_ROOTS, eventsNamedByClients } from './socket-payload-shape/client-event-readers';
import { isNamedByGateway } from './socket-payload-shape/gateway-event-names';
import { REPO, withoutComments } from './socket-payload-shape/mirror-contract';

/**
 * **LE RELEVÉ PARTAGÉ EST AVEUGLE AUX NOMS SANS DEUX-POINTS, et il fallait le
 * mesurer avant de l'accuser de quoi que ce soit.**
 *
 * `eventsNamedByClients` reconnaît un littéral par
 * `['"`]([a-z][\w-]*:[a-z][\w-]*…)['"`]` — la forme `entity:action`, qui est la
 * convention du dépôt. **Trois noms déclarés ne la suivent pas** : `authenticate`
 * et `heartbeat` dans `CLIENT_EVENTS`, `error` dans `SERVER_EVENTS`. Pour eux, le
 * relevé rend « personne ne le cite » quoi que fasse le client.
 *
 * Et ce n'était pas théorique : au premier jet, cette garde a inventorié
 * `heartbeat` comme un canal sans émetteur. **Il en a DEUX** —
 * `MessageSocketManager.swift` (`safeEmit("heartbeat", ["clientTime": …])`, 30 s)
 * et `SocketManager.kt` (`socket.emit(EVENT_HEARTBEAT, …)`, avec son écoute de
 * `heartbeat:ack`). Un inventaire porte une AFFIRMATION, et celle-là aurait été
 * fausse pour une raison qui n'a rien à voir avec le dépôt : la forme d'une
 * regex.
 *
 * D'où ce second relevé, étroit et littéral, qui ne traite QUE les noms déclarés
 * sans deux-points. Il ne touche pas au helper partagé : le corriger déplacerait
 * les inventaires de l'orphan gate et du parity gate dans le même lot, ce qui
 * est un autre travail (#20791 le note — côté descendant, `error` est dans le
 * même angle mort).
 */
const COLONLESS_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.kt', '.swift', '.js']);

const clientSources = (root: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) clientSources(path, out);
    else if (COLONLESS_SOURCE_EXTENSIONS.has(extname(path))) out.push(path);
  }
  return out;
};

/** Les noms déclarés SANS deux-points qu'un client épelle, commentaires dépouillés. */
const colonlessNamesSpelledByClients = (declared: readonly string[]): ReadonlySet<string> => {
  const sought = declared.filter((name) => !name.includes(':'));
  const found = new Set<string>();
  if (sought.length === 0) return found;
  for (const root of CLIENT_ROOTS) {
    for (const file of clientSources(join(REPO, root))) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const name of sought) {
        if (source.includes(`'${name}'`) || source.includes(`"${name}"`)) found.add(name);
      }
    }
  }
  return found;
};

/**
 * Les canaux montants qu'aucun client ne cite, par FAMILLE — et chaque famille
 * dit si la passerelle les ÉCOUTE, parce que c'est cela qui décide du coût.
 *
 * **Dix des quinze ont un écouteur VIVANT**, et c'est la mesure qui justifie ce
 * fichier : `socket-event-handler-gate` les voit tous les dix VERTS, par
 * construction, puisque c'est exactement ce qu'il demande.
 */
const SANS_EMETTEUR: readonly {
  readonly raison: string;
  readonly events: readonly string[];
}[] = [
  {
    raison:
      "AUCUN écouteur non plus : ce sont les cinq restes de la conception abandonnée de la "
      + "transcription d'appel, déjà inventoriés par `socket-event-handler-gate`, dont la raison porte "
      + "la mesure. Ils figurent ici parce que « personne ne l'écoute » et « personne ne l'émet » sont "
      + "DEUX propriétés : un nom peut manquer des deux bouts, et c'est le cas le plus simple à lire.",
    events: [
      'call:audio-chunk',
      'call:transcription-capability',
      'call:transcription-role',
      'call:translation-request',
      'call:translation-response',
    ],
  },
  {
    raison:
      "ÉCOUTEUR VIVANT, aucun appelant — les transports SOCKET de l'édition, de la suppression et des "
      + "deux sens de la réaction d'un MESSAGE. Les clients passent par REST : `/api/v1/reactions/"
      + ":messageId` pour les réactions, et le `CLAUDE.md` de la passerelle énumère lui-même « les trois "
      + "transports d'édition de message », dont celui-ci. Le coût est le plus élevé de l'inventaire : "
      + "quatre `socket.on` avec leur validation, leur débit et leurs gardes, maintenus pour un appelant "
      + "qui n'est dans aucun des trois clients. **Mesuré sur CE dépôt, pas sur le parc** : un client "
      + "déployé peut les émettre, et c'est pourquoi aucun retrait n'est demandé (#9223).",
    events: ['message:edit', 'message:delete', 'reaction:add', 'reaction:remove'],
  },
  {
    raison:
      "ÉCOUTEUR VIVANT, aucun appelant — la resynchronisation d'un roster de réactions de MESSAGE. "
      + "C'est la jumelle exacte de `comment:reaction-request-sync`, que #20414 a mesurée morte sur la "
      + "famille COMMENTAIRE après que deux doc-comments de service l'eurent invoquée comme la raison "
      + "d'accepter une fenêtre de réordonnancement. Celle-ci n'est citée par personne du tout — donc "
      + "pas même déclarée par un SDK, un cran PLUS mort que sa jumelle. Son sort se décide avec elle : "
      + "#20778, sur les trois clients et les deux familles.",
    events: ['reaction:request-sync'],
  },
  {
    raison:
      "ÉCOUTEUR VIVANT, aucun appelant — l'authentification MANUELLE du socket, quand "
      + "`handleTokenAuthentication` tourne DÉJÀ, automatiquement, à chaque connexion. Ce n'est PAS une "
      + "faille, et le dire ici évite qu'on le relise comme telle : le chemin valide par Zod, limite par "
      + "IP sur l'adresse ATTESTÉE, vérifie le JWT, et IGNORE le `userId` que son schéma accepte. C'est "
      + "une porte correctement gardée que personne n'emprunte — un coût de surface et de "
      + "maintenabilité, pas de confidentialité. (Son voisin sans deux-points, `heartbeat`, a DEUX "
      + "émetteurs : voir le relevé littéral ci-dessus, qui existe pour ne pas l'accuser à tort.)",
    events: ['authenticate'],
  },
  {
    raison:
      "ÉCOUTEUR VIVANT, aucun appelant — les deux canaux montants du Signal Protocol. Les clients ne "
      + "citent qu'`e2ee:envelope` (mesuré : c'est la seule chaîne `e2ee:` de leurs sources). Pour un "
      + "lot de cryptographie, l'écart entre ce que le contrat déclare et ce que les clients empruntent "
      + "est à instruire avant tout autre, et ce n'est pas à un cliquet de le trancher.",
    events: ['e2ee:send-signal', 'e2ee:send-verification'],
  },
  {
    raison:
      "ÉCOUTEUR VIVANT, aucun appelant — l'abonnement d'une console d'administration au flux d'un "
      + "agent. Aucune des trois plateformes ne le cite : si une console existe, elle n'est pas dans ce "
      + "dépôt, et c'est précisément ce qu'un inventaire doit faire dire à voix haute plutôt que laisser "
      + "supposer.",
    events: ['admin:agent-subscribe', 'admin:agent-unsubscribe'],
  },
];

const flatten = (familles: readonly { readonly events: readonly string[] }[]): readonly string[] =>
  familles.flatMap((famille) => famille.events);

const DECLARED_CLIENT_EVENT_NAMES: readonly string[] = [...new Set(Object.values(CLIENT_EVENTS))];

/**
 * Un seul relevé par exécution : il lit les quatre racines clientes entières,
 * et l'UNION ferme l'angle mort des noms sans deux-points.
 */
const NAMED_BY_CLIENTS: ReadonlySet<string> = new Set<string>([
  ...eventsNamedByClients(),
  ...colonlessNamesSpelledByClients(DECLARED_CLIENT_EVENT_NAMES),
]);

describe('every declared client→server channel has a client that names it', () => {
  // Sans ce témoin, un chemin déplacé ou une extension changée viderait le
  // relevé et déclarerait les 66 canaux sans émetteur — la garde rougirait pour
  // la mauvaise raison, et l'on croirait à soixante-six défauts. Le seuil est
  // très en dessous du compte réel : il atteste que le relevé trouve encore les
  // clients.
  it('still reads the client sources', () => {
    expect(NAMED_BY_CLIENTS.size).toBeGreaterThanOrEqual(200);
  });

  // Le témoin NÉGATIF. Le précédent prouve que le relevé lit quelque chose ;
  // sans celui-ci, un relevé devenu universel déclarerait tout émis et la garde
  // serait verte à jamais.
  it('does not credit a name no client spells', () => {
    expect(NAMED_BY_CLIENTS.has('talkie:ninety-nine-paper-lanterns')).toBe(false);
  });

  // Le relevé SANS deux-points a son propre témoin, dans les deux sens : il
  // trouve le nom qu'un client épelle vraiment (`heartbeat`, deux émetteurs),
  // et il ne crédite pas un nom colon-less inventé. Sans le premier, cette
  // garde réinventorierait `heartbeat` à la première édition de l'union — ce
  // qu'elle a fait au premier jet.
  it('sees the colon-less names a client really spells, and only those', () => {
    const colonless = colonlessNamesSpelledByClients([...DECLARED_CLIENT_EVENT_NAMES, 'lanterns']);

    expect(colonless.has('heartbeat')).toBe(true);
    expect(colonless.has('lanterns')).toBe(false);
  });

  // Le témoin de CADRAGE : une énumération qui aurait perdu la moitié de ses
  // entrées rendrait le même verdict vert qu'un contrat parfaitement émis.
  it('measures the whole upward contract', () => {
    expect(DECLARED_CLIENT_EVENT_NAMES.length).toBeGreaterThanOrEqual(60);
  });

  it('names every declared client event from a client, or inventories it', () => {
    const muets = DECLARED_CLIENT_EVENT_NAMES.filter(
      (name) => !NAMED_BY_CLIENTS.has(name) && !flatten(SANS_EMETTEUR).includes(name),
    );

    expect(muets.sort()).toEqual([]);
  });

  // Le SECOND sens. Une exemption qui survit à sa raison d'être finit par
  // couvrir un vrai défaut, et une liste qui se périme affirme un manque comblé.
  it('keeps the inventory free of channels a client now names', () => {
    const comblés = flatten(SANS_EMETTEUR).filter((name) => NAMED_BY_CLIENTS.has(name));

    expect(comblés.sort()).toEqual([]);
  });

  // L'inventaire doit rester une liste de noms RÉELS : une entrée mal
  // orthographiée n'exempterait rien et, pire, se lirait comme une couverture
  // accordée.
  it('inventories only names the contract actually declares', () => {
    const inconnus = flatten(SANS_EMETTEUR).filter(
      (name) => !DECLARED_CLIENT_EVENT_NAMES.includes(name),
    );

    expect(inconnus.sort()).toEqual([]);
  });
});

describe('the ten served-without-caller channels are what makes this gate distinct', () => {
  /**
   * La mesure qui justifie ce fichier : DIX des quinze noms sans émetteur ont
   * un écouteur VIVANT côté passerelle, donc `socket-event-handler-gate` les
   * voit VERTS — par construction, puisque c'est exactement ce qu'il demande.
   *
   * Ce témoin n'est pas une redite de l'inventaire : il garde la PARTITION. Si
   * les neuf devenaient tous sans écouteur, ce fichier n'apporterait plus rien
   * que le voisin ne dise déjà, et il faudrait le dire. S'ils devenaient tous
   * écoutés, la classe « surface servie sans appelant » serait la seule, et la
   * première famille de l'inventaire aurait perdu sa raison.
   */
  const SERVIS_SANS_APPELANT: readonly string[] = [
    'admin:agent-subscribe',
    'admin:agent-unsubscribe',
    'authenticate',
    'e2ee:send-signal',
    'e2ee:send-verification',
    'message:delete',
    'message:edit',
    'reaction:add',
    'reaction:remove',
    'reaction:request-sync',
  ];

  it('each one is listened to by the gateway — that is the whole point', () => {
    const silencieux = SERVIS_SANS_APPELANT.filter((name) => !isNamedByGateway(name));

    expect(silencieux.sort()).toEqual([]);
  });

  it('each one is in the inventory, and none of them is named by a client', () => {
    expect(SERVIS_SANS_APPELANT.filter((name) => !flatten(SANS_EMETTEUR).includes(name))).toEqual([]);
    expect(SERVIS_SANS_APPELANT.filter((name) => NAMED_BY_CLIENTS.has(name))).toEqual([]);
  });

  // Le reste de l'inventaire est la classe « manque des DEUX bouts ». La garder
  // mesurée empêche qu'une famille change de nature en silence.
  it('the rest of the inventory is the no-listener-either class', () => {
    const autres = flatten(SANS_EMETTEUR).filter((name) => !SERVIS_SANS_APPELANT.includes(name));

    expect(autres.filter((name) => isNamedByGateway(name)).sort()).toEqual([]);
  });
});
