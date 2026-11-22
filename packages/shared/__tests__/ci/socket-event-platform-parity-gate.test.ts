// packages/shared/__tests__/ci/socket-event-platform-parity-gate.test.ts
//
// L'événement que DEUX clients lisent et que le troisième ignore (#18342).
//
// ─── La limite que l'orphan gate s'écrivait ───────────────────────────────
//
// `socket-event-orphan-gate` répond « au moins un client connaît ce nom ».
// C'est ce qu'il faut pour trouver l'orphelin TOTAL, et cela masque par
// CONSTRUCTION l'asymétrie : un événement lu par iOS et Android et ignoré du
// web y est indiscernable d'un événement lu par les trois. #18342 écrivait la
// limite — « elle ne dit rien des événements écoutés par un seul client là où
// trois devraient l'être » — et ce cliquet est ce qui la mesure.
//
// ─── Ce que la mesure dit, au cycle 161 ───────────────────────────────────
//
// 177 événements de `ServerToClientEvents` : 128 cités par les trois clients,
// 32 par deux, 10 par un seul, 7 par aucun (ceux-là sont l'affaire de
// l'orphan gate, et son inventaire les porte).
//
// **Les 29 des 32 qui manquent au WEB ne sont pas 29 défauts**, et il faut le
// dire avant l'inventaire : `apps/web` est le chantier 2.0 qui suit l'interface
// iOS (directive porteur du 2026-09-07), donc « iOS et Android le lisent, le
// web pas encore » y est l'état NORMAL d'une feature non encore portée. Ce
// cliquet ne prétend pas que chacune soit à porter ; il prétend que la liste
// soit CONNUE, qu'elle ne grandisse pas en silence, et qu'un portage la fasse
// RÉTRÉCIR dans le commit qui le livre.
//
// ─── Ce que l'inventaire porte, et ce qu'il ne porte pas ──────────────────
//
// Il porte la MESURE — quelle plateforme ne cite pas ce nom — et une raison
// par FAMILLE, là où la raison vit réellement. Il ne porte AUCUN verdict :
// décider s'il faut écrire le lecteur, retirer l'émission ou retirer la
// déclaration appartient au produit (#18342), et ce n'est pas la même décision
// pour un vocal traduit et pour une sonnerie de Bring.
//
// Le cliquet est à DEUX SENS, comme son voisin : une asymétrie neuve rougit
// chez celui qui l'écrit, et un événement qui gagne son troisième lecteur doit
// SORTIR de l'inventaire — sans quoi la liste se périme en affirmant un retard
// qui a été rattrapé, ce qui est exactement ce qui est arrivé au commentaire de
// `link:message:new` (cycle 161).

import { describe, expect, it } from 'vitest';

import {
  CLIENT_PLATFORMS,
  eventsNamedByClients,
  eventsNamedByPlatform,
  type ClientPlatform,
} from './socket-payload-shape/client-event-readers';
import { readContractPayloads } from './socket-payload-shape/mirror-contract';

/**
 * Les familles d'asymétrie mesurées, avec la raison de la famille. Chaque
 * événement est NOMMÉ : une raison de famille n'autorise pas une liste ouverte.
 */
const ASYMETRIES: readonly {
  readonly absents: readonly ClientPlatform[];
  readonly raison: string;
  readonly events: readonly string[];
}[] = [
  /*
   * LA FAMILLE « ABSENTS DU WEB » A ÉTÉ REMESURÉE AU CYCLE 208 (#20271), et sa
   * raison unique — « chantier 2.0 : ces signaux ne sont pas encore portés » —
   * était FAUSSE pour quatorze de ses vingt entrées. Ce n'est pas une nuance de
   * rédaction : « pas encore porté » décrit un RETARD, donc il envoie le lot
   * suivant écrire un écouteur — là où le web reçoit déjà le fait par un AUTRE
   * événement (le délta générique de pièce jointe, la notification, la ligne de
   * préférences versionnée), où il n'emploie pas le protocole du tout, ou où le
   * chemin a été RETIRÉ par décision. Porter l'écouteur y produirait une
   * double application, pas une parité.
   *
   * Une raison d'inventaire est une AFFIRMATION (leçon du 2026-11-21), et
   * celle-ci portait vingt événements d'un seul geste.
   */
  {
    absents: ['web'],
    raison:
      'le web REÇOIT DÉJÀ le fait, par un AUTRE événement qu\'il écoute — porter ces trois-là y ferait une '
      + 'DOUBLE application : le site qui diffuse une traduction audio émet, dans la même unité, un '
      + '`message:attachment-updated` portant la pièce jointe RE-SÉRIALISÉE ENTIÈRE, traduction fraîche '
      + 'incluse (`MeeshySocketIOManager._broadcastTranslationEvent` → `_broadcastAttachmentUpdated`, les '
      + 'trois branches), et le web l\'applique (`onAttachmentUpdated`). Mesuré au cycle 208.',
    events: ['audio:translation-ready', 'audio:translations-completed', 'audio:translations-progressive'],
  },
  {
    absents: ['web'],
    raison:
      "le web n'emploie pas ce PROTOCOLE : il n'émet jamais `conversation:join` — "
      + '`AuthHandler._joinUserConversations` rejoint TOUTES les rooms de participation à '
      + "l'authentification elle-même, et `apps/web/src/lib/api/socket.ts` l'écrit en tête (« ce que ce "
      + "module NE FAIT PAS »). Un ACQUITTEMENT de jonction, son refus et son pendant de sortie n'ont donc "
      + 'aucun destinataire web par CONSTRUCTION. Même forme pour les statistiques : le web lit '
      + '`GET /conversations/:id/stats` (`conversation-stats.ts`), jamais la réponse socket que ce nom porte.',
    events: ['conversation:join-error', 'conversation:joined', 'conversation:left', 'conversation:stats'],
  },
  {
    absents: ['web'],
    raison:
      'chemin RETIRÉ du web par décision, jamais porté puis perdu : le battement applicatif du web a été '
      + "supprimé au cycle 78 — « le web en émettait un à 90 s, NU : aucun `latencyHintMs` calculable, aucun "
      + "écouteur pour l'ack », et la présence du web ne tient plus qu'au pong du moteur "
      + '(`AuthHandler.handleEnginePong`). `CLIENT_EVENTS.HEARTBEAT` ne subsiste que pour iOS, qui en tire '
      + 'son RTT. Écrire un écouteur ici remettrait le battement que ce cycle a retiré.',
    events: ['heartbeat:ack'],
  },
  {
    absents: ['web'],
    raison:
      'le fait atteint le web par un AUTRE canal, mesuré : une MENTION voyage par la notification — la '
      + 'passerelle écrit la ligne (`createMentionNotification`, et `notifyNewlyMentioned` sur le chemin '
      + "d'édition) et le web écoute `notification:new` puis `notification:counts` "
      + "(`notifications-realtime.ts`) ; l'ORDRE d'une conversation posé sur un autre appareil arrive dans "
      + "l'instantané COMPLET et VERSIONNÉ de `user:preferences-updated`, dont `orderInCategory` fait "
      + 'partie depuis #18925 (`conversation-preferences-sync.ts`). `mention:created` et '
      + '`user:preferences-reordered` sont les chemins iOS et Android du même fait.',
    events: ['mention:created', 'user:preferences-reordered'],
  },
  {
    absents: ['web'],
    raison:
      "rien à AFFICHER sur le web, parce qu'il n'y a aucun état en attente à défaire : une traduction de "
      + "TEXTE absente fait servir l'ORIGINAL (règle 1 du Prisme, `resolvePrismTranslation` rend `null`), et "
      + "le web ne rend aucun « en cours de traduction » sur une bulle — ses seuls indicateurs de ce genre "
      + 'vivent dans les sous-titres d\'appel et la visionneuse audio, dont l\'échec a son propre écouteur '
      + '(`audio-translation:failed`, branché). Un écouteur ici n\'aurait rien à éteindre.',
    events: ['translation:failed'],
  },
  {
    absents: ['web'],
    raison:
      "features que le web ne porte PAS ENCORE — la seule famille où « pas encore porté » est la mesure : "
      + "aucune surface de réaction par emoji sur un commentaire ni sur une humeur (le web a les J'AIME de "
      + 'commentaire, `comment:liked` / `comment:unliked`, branchés).',
    events: ['comment:reaction-added', 'comment:reaction-removed', 'status:reacted', 'status:unreacted'],
  },
  {
    absents: ['web'],
    raison:
      "le web porte une AUTRE famille pour un AUTRE besoin, mesuré au cycle 211 (#20287) : ces trois-là sont "
      + 'les positions vivantes DANS UNE CONVERSATION (room `conversation:<id>`, `LocationHandler`), quand le '
      + 'web sert le partage de position des CERCLES — `location:share-changed` / `location:share-ended`, room '
      + "`user:<moi>`, #16984 et #18345 —, qu'il reçoit ET émet (`shared-locations-live.ts`). Deux audiences "
      + "distinctes (les participants d'un fil contre les personnes d'un cercle), donc un périmètre produit, "
      + "pas une dette de portage de CE nom : `apps/web/src` ne cite aucun `location:live-*`.",
    events: ['location:live-started', 'location:live-stopped', 'location:live-updated'],
  },
  {
    absents: ['web'],
    raison:
      "absence par CONSTRUCTION, mesurée au cycle 211 (#20287) : l'unique audience de cette enveloppe est la "
      + "room d'APPAREIL (`envelope-delivery.ts`, `ROOMS.device(user, deviceId, registrationId)`), et le web "
      + "ne s'ENRÔLE pas — il n'appelle que `devices`, `devicesByDeviceId` et `keysByUserIdDevices`, donc il "
      + "n'a aucune `registrationId` à lui et n'est dans aucune room d'appareil. Un écouteur n'aurait rien à "
      + "recevoir ; il appartient au lot qui livrera l'enrôlement (le pont libsignal du web existe depuis "
      + '#17114).',
    events: ['e2ee:envelope'],
  },
  {
    absents: ['android'],
    raison:
      "features dont le miroir Kotlin n'a pas encore sa moitié : la sonnerie de Bring et l'écoute partagée "
      + "(« en train d'écouter »). Le dégel du Kotlin natif (#11570) les rend portables ; aucune issue ne les réclame encore.",
    events: ['bring:ring', 'now-playing:changed', 'now-playing:cleared'],
  },
  {
    absents: ['android', 'ios'],
    raison:
      'surfaces que le WEB SEUL porte aujourd\'hui : la console d\'administration (métriques d\'hôte), '
      + "l'enveloppe d'erreur générique, les deux familles de demande d'ami, la traduction d'un texte "
      + "alternatif et la bibliothèque d'autocollants. Pour plusieurs, le natif a sa propre voie (REST, "
      + 'notification) ; la parité par socket est une question produit, pas une dette mesurée.',
    events: [
      'admin-metrics:sample',
      'error',
      'friend-request:accepted',
      'friend-request:new',
      'media:alt-translation-updated',
      'sticker:library-updated',
    ],
  },
  {
    absents: ['web', 'ios'],
    raison:
      "signal que seul le miroir ANDROID cite : la pièce jointe prête côté SDK Kotlin. À instruire avec le "
      + 'lot qui porte ce geste, pas isolément. '
      + "(`user:preferences-community-reordered` figurait ici jusqu'au cycle 207 : mesuré, la citation "
      + "d'Android était la PHRASE « `user:preferences-community-reordered` stays unheard » de "
      + "`PreferencesSocketManager.kt` — une NÉGATION comptée comme un lecteur. Plus aucun client ne le "
      + "cite : il est passé à l'inventaire de l'orphan gate, #20267.)",
    events: ['attachment:ready'],
  },
  {
    absents: ['android', 'ios'],
    raison:
      "`authenticated` est l'avis de fin d'authentification du SOCKET, et le WEB l'écoute — c'est lui qui "
      + 'déclenche ses rattrapages de reconnexion (#18573, `socket.ts` et `call-socket-bridge.ts`). iOS et '
      + "Android lisent l'ACCUSÉ de la poignée de main et n'ont aucun rattrapage à déclencher dessus. "
      + 'Mesuré au cycle 207 (#20267) : le relevé ne RÉSOLVAIT pas ce nom — il est déclaré dans '
      + '`session-event-names.ts`, une des cartes de domaine que `SERVER_EVENTS` répand —, si bien que '
      + "l'orphan gate le portait comme « cité par AUCUN client », ce qui était faux du web.",
    events: ['authenticated'],
  },
  {
    absents: ['web'],
    raison:
      "le web REÇOIT la batterie des autres, il n'en REND pas : `battery:pull-requested` ne vise que le "
      + "téléphone de l'ÉMETTEUR (`batteryPull.ts`, room de l'émetteur seul) et un onglet n'a pas de "
      + 'batterie à relever. `battery-host.tsx` le dit — « le web REÇOIT, il n\'émet pas … cet onglet '
      + "n'écoute pas l'événement » —, et c'est cette phrase que le relevé comptait comme un lecteur "
      + 'jusqu\'au cycle 207 (#20267). Asymétrie DÉCIDÉE, pas un retard.',
    events: ['battery:pull-requested'],
  },
  {
    absents: ['ios'],
    raison:
      "`pack:installation-updated` — un pack installé, acheté, GAGNÉ ou retiré sur un AUTRE de mes appareils. "
      + 'Android le ROUTE (`MessageSocketManager`, puis `PackShopViewModel` et `ProfileDecorViewModel`) ; le web '
      + "le ROUTE depuis #20354 (`lib/packs/installation-sync.ts`, qui PÉRIME ses vitrines au lieu d'appliquer la "
      + "charge — elle ne porte ni prix, ni compteur d'installations, ni `userId` permettant de vérifier à qui "
      + "elle appartient). iOS ne le NOMME que dans un doc-comment (l'origine `remote` d'un retrait) et relit ses "
      + 'vitrines par REST : un pack GAGNÉ par un trophée, qui n\'a aucun geste local pour l\'annoncer, ne peut '
      + "donc pas y arriver avant péremption. C'est le dernier retard de cette famille, suivi par #20409.",
    events: ['pack:installation-updated'],
  },
];

const contract = readContractPayloads();
const perPlatform = eventsNamedByPlatform();

const missingPlatforms = (event: string): readonly ClientPlatform[] =>
  CLIENT_PLATFORMS.filter((platform) => !perPlatform.get(platform)?.has(event));

/** Les asymétries RÉELLES : cité par un ou deux clients, pas par zéro (l'orphan gate) ni par trois. */
const measured = (): ReadonlyMap<string, readonly ClientPlatform[]> =>
  new Map(
    [...contract.keys()]
      .sort()
      .map((event) => [event, missingPlatforms(event)] as const)
      .filter(([, absents]) => absents.length > 0 && absents.length < CLIENT_PLATFORMS.length),
  );

const inventaire = (): ReadonlyMap<string, readonly ClientPlatform[]> =>
  new Map(ASYMETRIES.flatMap((famille) => famille.events.map((event) => [event, famille.absents] as const)));

const memeJeu = (left: readonly ClientPlatform[], right: readonly ClientPlatform[]): boolean =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);

describe("l'événement que deux clients lisent et que le troisième ignore (#18342)", () => {
  it('chaque plateforme CITE des événements — un balayage vide ne rougit jamais tout seul', () => {
    expect(contract.size).toBeGreaterThanOrEqual(150);
    for (const platform of CLIENT_PLATFORMS) {
      const named = [...(perPlatform.get(platform) ?? [])].filter((event) => contract.has(event));
      expect(named.length, `${platform} ne cite presque aucun événement du contrat — le balayage est cassé`).toBeGreaterThanOrEqual(90);
    }
  });

  // La garde STRUCTURELLE : les deux relevés partagent leur balayage, et c'est
  // ce qui empêche l'un de dériver de l'autre. Sans elle, le relevé par
  // plateforme pourrait se tromper sans que l'orphan gate bronche.
  it("le relevé global est exactement l'UNION des relevés par plateforme", () => {
    const union = new Set<string>();
    for (const named of perPlatform.values()) for (const event of named) union.add(event);
    expect([...eventsNamedByClients()].sort()).toEqual([...union].sort());
  });

  it("toute asymétrie mesurée figure à l'inventaire, avec la plateforme qui manque", () => {
    const gelees = inventaire();
    const inattendues = [...measured().entries()]
      .filter(([event, absents]) => {
        const gele = gelees.get(event);
        return gele === undefined || !memeJeu(gele, absents);
      })
      .map(([event, absents]) =>
        `${event} — déclaré par \`ServerToClientEvents\`, cité par ${CLIENT_PLATFORMS.length - absents.length} `
        + `client(s) sur ${CLIENT_PLATFORMS.length} ; manque à : ${absents.join(', ')}. `
        + "Porter le lecteur, ou l'inscrire dans ASYMETRIES avec la raison de sa famille.",
      );

    expect(inattendues, `\n${inattendues.join('\n')}\n`).toEqual([]);
  });

  /** Le second sens : un retard rattrapé doit SORTIR de l'inventaire. */
  it("chaque entrée de l'inventaire est ENCORE en retard", () => {
    const vues = measured();
    const perimees = [...inventaire().entries()]
      .filter(([event, absents]) => !contract.has(event) || !memeJeu(vues.get(event) ?? [], absents))
      .map(([event, absents]) => `${event} (${absents.join(', ')})`);

    expect(
      perimees,
      `lu par ${perimees.length > 1 ? 'ces plateformes' : 'cette plateforme'}, ou retiré du contrat — à sortir de l'inventaire : ${perimees.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque famille porte une raison ÉCRITE, et aucune liste vide', () => {
    for (const famille of ASYMETRIES) {
      expect(famille.raison.length).toBeGreaterThan(80);
      expect(famille.events.length).toBeGreaterThan(0);
      expect(famille.absents.length).toBeGreaterThan(0);
      expect([...famille.events].sort()).toEqual([...famille.events]);
    }
  });
});
