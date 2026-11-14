// packages/shared/__tests__/ci/socket-event-handler-gate.test.ts
//
// La direction MONTANTE du contrat socket (#18499) : « qui ÉCOUTE ce que le
// client émet ? »
//
// ─── Le trou que cinq cliquets laissaient ouvert ───────────────────────────
//
// Cinq gardes tiennent ce contrat, et les cinq regardent la même direction —
// serveur→client : un nom épelé par un client existe-t-il au contrat
// (`socket-event-name-gate`) ? tout `SERVER_EVENTS` a-t-il un émetteur
// (`socket-event-emitter-gate`) ? au moins un lecteur client
// (`socket-event-orphan-gate`) ? lequel des trois ne le lit pas
// (`socket-event-platform-parity-gate`) ? un champ déclaré que le miroir ne lit
// pas (`socket-payload-dead-field-gate`) ?
//
// **Aucune ne regardait la montante.** Un nom de `CLIENT_EVENTS` sans
// `socket.on` côté passerelle est le défaut symétrique du cycle 75
// (`call:force-leave` : contrat écrit, récepteur iOS complet et testé, aucun
// émetteur serveur), et il est PIRE en exploitation : **Socket.IO laisse
// tomber un événement non écouté sans lever la moindre erreur.** Le contrat
// affirme que le canal existe, un client l'implémente, l'utilisateur appuie —
// et rien ne part, sans trace, sans ACK, sans journal.
//
// ─── Ce que la mesure dit, au cycle 162 ────────────────────────────────────
//
// 66 noms de `CLIENT_EVENTS`, 61 nommés par `services/gateway/src`, 5 jamais.
// Les cinq sont les restes d'une conception abandonnée de la transcription
// d'appel (morceaux audio envoyés au serveur, négociation de capacité,
// traduction en requête/réponse). Le chemin VIVANT est tout autre : le client
// émet `call:transcription-segment`, la passerelle relaie
// `call:translated-segment` par DESTINATAIRE (`socketio/call-transcription-relay.ts`).
// Sa moitié descendante — `call:translation-requested` — est déjà inventoriée
// par l'orphan gate comme « ni émis ni lu — dette de contrat » : ces cinq-ci
// sont la moitié MONTANTE de la même dette, et aucun cliquet ne la voyait.
//
// ─── `CALL_EVENTS`, la seconde carte hors de portée ────────────────────────
//
// `CALL_EVENTS` (`types/video-call.ts`) est une seconde carte de noms de fil,
// et c'est CELLE QUE LA PASSERELLE IMPORTE. Les cinq cliquets, eux, énumèrent
// `SERVER_EVENTS` / `CLIENT_EVENTS`. Un nom ajouté à l'une et pas à l'autre
// échappe donc à tous. Mesuré : trois noms ne vivent que dans `CALL_EVENTS`.
// La quatrième assertion les tient dans la portée.
//
// ─── Ce que l'inventaire porte, et ce qu'il ne porte pas ───────────────────
//
// Il NOMME chaque dette et porte une raison par FAMILLE, là où la raison vit.
// Il ne porte AUCUN verdict : décider d'écrire l'écouteur, de retirer la
// déclaration ou de ressusciter la conception appartient au produit (#18499),
// exactement comme pour #18342.
//
// Le cliquet est à DEUX SENS, comme ses voisins : une dette neuve rougit chez
// celui qui l'écrit, et un canal qui gagne son écouteur doit SORTIR de
// l'inventaire — sans quoi la liste se périme en affirmant un manque qui a été
// comblé, ce qui est exactement ce qui est arrivé au bloc « RESERVED (no
// emitter yet) » du contrat, dont six entrées sur neuf avaient reçu leur
// émetteur depuis.
//
// `packages/shared` tourne sur CHAQUE PR (`ci.yml`, matrice `test`).

import { describe, expect, it } from 'vitest';

import { CLIENT_EVENTS, SERVER_EVENTS } from '../../types/socketio-events';
import { CALL_EVENTS } from '../../types/video-call';
import { GATEWAY_CODE, isNamedByGateway } from './socket-payload-shape/gateway-event-names';

/**
 * Les canaux montants que la passerelle n'écoute pas, par FAMILLE. Chaque
 * nom est écrit : une raison de famille n'autorise pas une liste ouverte.
 */
const SANS_ECOUTEUR: readonly {
  readonly raison: string;
  readonly events: readonly string[];
}[] = [
  {
    raison:
      "conception abandonnée de la transcription d'appel — la transcription se fait SUR L'APPAREIL et "
      + "arrive par `call:transcription-segment`, que la passerelle écoute et relaie traduite par "
      + "destinataire. Ces cinq noms (morceaux audio poussés au serveur, négociation de capacité et de "
      + "rôle, traduction en requête/réponse) n'ont jamais eu d'écouteur ni d'émetteur, sur aucune "
      + "plateforme. Leur moitié descendante `call:translation-requested` est inventoriée par "
      + "l'orphan gate sous la même dette.",
    events: [
      'call:audio-chunk',
      'call:transcription-capability',
      'call:transcription-role',
      'call:translation-request',
      'call:translation-response',
    ],
  },
];

/**
 * Les noms de `CALL_EVENTS` que le contrat socketio ne déclare pas. Tant qu'ils
 * sont là, ils vivent hors de portée des cinq cliquets — d'où l'inventaire.
 */
const HORS_CONTRAT: readonly {
  readonly raison: string;
  readonly events: readonly string[];
}[] = [
  {
    raison:
      "`@deprecated` sur place depuis l'audit appels 2026-07-11 : jamais émis par la passerelle, le "
      + "mode `sfu` étant renvoyé dans les ACKs sans média SFU derrière. Son retrait est conditionné à "
      + "l'abandon FORMEL du mode SFU — une décision produit, pas une dette de contrat.",
    events: ['call:mode-changed'],
  },
  {
    raison:
      "restes de la même conception abandonnée que `SANS_ECOUTEUR` : cités nulle part, sur aucune "
      + "plateforme, et par aucun doc-comment qui le dise. Déclarés dans `CALL_EVENTS` seulement, donc "
      + "invisibles des cinq cliquets jusqu'à celui-ci.",
    events: ['call:transcription', 'call:translation'],
  },
];

const flatten = (familles: readonly { readonly events: readonly string[] }[]): readonly string[] =>
  familles.flatMap((f) => f.events);

const DECLARED_CLIENT_EVENT_NAMES: ReadonlyArray<string> = [
  ...new Set(Object.values(CLIENT_EVENTS)),
];

const CONTRACT_NAMES: ReadonlySet<string> = new Set<string>([
  ...Object.values(SERVER_EVENTS),
  ...Object.values(CLIENT_EVENTS),
]);

const CALL_EVENT_NAMES: ReadonlyArray<string> = [...new Set(Object.values(CALL_EVENTS))];

describe('every declared client→server channel has a gateway listener', () => {
  // Sans ce témoin, un chemin déplacé ou une extension changée viderait le scan
  // et rendrait TOUT canal sourd — la garde rougirait pour la mauvaise raison,
  // et l'on croirait à soixante défauts. Le seuil est très en dessous du compte
  // réel : il atteste que le scan trouve encore la passerelle.
  it('still reads the gateway sources', () => {
    expect(GATEWAY_CODE.length).toBeGreaterThanOrEqual(200);
  });

  // Le témoin NÉGATIF. Le précédent prouve que le scan lit quelque chose ; sans
  // celui-ci, une comparaison devenue universelle (un `includes('')` par
  // exemple) déclarerait tout écouté et la garde serait verte à jamais.
  it('does not credit a name the gateway never spells', () => {
    expect(isNamedByGateway('call:ninety-nine-paper-lanterns')).toBe(false);
  });

  // Le témoin de CADRAGE : la mesure de l'inventaire est un fait daté, et une
  // énumération qui aurait perdu la moitié de ses entrées rendrait le même
  // verdict vert qu'une passerelle parfaite.
  it('measures the whole upward contract', () => {
    expect(DECLARED_CLIENT_EVENT_NAMES.length).toBeGreaterThanOrEqual(60);
  });

  it('names every declared client event, or inventories it', () => {
    const sourds = DECLARED_CLIENT_EVENT_NAMES.filter(
      (name) => !isNamedByGateway(name) && !flatten(SANS_ECOUTEUR).includes(name)
    );

    expect(sourds.sort()).toEqual([]);
  });

  // Le SECOND sens. Une exemption qui survit à sa raison d'être finit par
  // couvrir un vrai défaut, et une liste qui se périme affirme un manque qui a
  // été comblé.
  it('keeps the inventory free of channels the gateway now listens to', () => {
    const comblés = flatten(SANS_ECOUTEUR).filter((name) => isNamedByGateway(name));

    expect(comblés.sort()).toEqual([]);
  });

  // L'inventaire doit rester une liste de noms RÉELS : une entrée mal
  // orthographiée n'exempterait rien et, pire, se lirait comme une couverture
  // accordée.
  it('inventories only names the contract actually declares', () => {
    const inconnus = flatten(SANS_ECOUTEUR).filter(
      (name) => !DECLARED_CLIENT_EVENT_NAMES.includes(name)
    );

    expect(inconnus.sort()).toEqual([]);
  });
});

describe('CALL_EVENTS stays inside the gates’ reach', () => {
  it('declares every call wire name in the socketio contract, or inventories it', () => {
    const horsPortée = CALL_EVENT_NAMES.filter(
      (name) => !CONTRACT_NAMES.has(name) && !flatten(HORS_CONTRAT).includes(name)
    );

    expect(horsPortée.sort()).toEqual([]);
  });

  // Le second sens de cette moitié-là : un nom porté AU contrat depuis doit
  // sortir de l'inventaire, sinon la liste affirme un trou qui a été bouché.
  it('keeps the inventory free of names the contract has since adopted', () => {
    const adoptés = flatten(HORS_CONTRAT).filter((name) => CONTRACT_NAMES.has(name));

    expect(adoptés.sort()).toEqual([]);
  });

  it('inventories only names CALL_EVENTS actually declares', () => {
    const inconnus = flatten(HORS_CONTRAT).filter((name) => !CALL_EVENT_NAMES.includes(name));

    expect(inconnus.sort()).toEqual([]);
  });
});
