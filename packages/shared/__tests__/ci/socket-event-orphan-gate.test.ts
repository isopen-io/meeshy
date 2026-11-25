// packages/shared/__tests__/ci/socket-event-orphan-gate.test.ts
//
// L'événement du contrat que PERSONNE ne lit (#18342).
//
// ─── La question que les trois gardes de noms ne posent pas ───────────────
//
// `socket-event-name-gate` : aucun client n'écoute hors contrat.
// `socket-event-emitter-gate` : la passerelle n'émet que par constante.
// `ios-socket-event-enum-parity` : l'enum Swift suit le contrat.
//
// Les trois gardent le même sens — du client vers le contrat. L'autre sens
// n'était gardé par rien : un nom peut entrer dans `ServerToClientEvents`,
// recevoir un émetteur, traverser les miroirs et les gardes, **sans qu'aucun
// client ne le connaisse**. Mesuré le 2026-11-14 : sept, dont quatre ÉMIS.
//
// Ce que ça coûte, des deux côtés :
//   · la passerelle compose une charge, résout une audience et traverse
//     l'adaptateur Redis pour personne — `location:blood-proximity`, c'est deux
//     `emit` par alerte de proximité ;
//   · le nom se lit comme une feature existante partout où il apparaît.
//
// ─── Ce que la garde mesure, et la limite qu'elle s'écrit ─────────────────
//
// « Un client CITE ce nom », sous l'une des trois formes que `client-event-readers`
// reconnaît. C'est la condition NÉCESSAIRE d'une écoute, pas la preuve qu'un
// gestionnaire est branché : un nom cité sans être branché reste invisible ici.
// La limite est écrite plutôt que supposée — et elle est du bon côté, celui qui
// ne crie pas à tort.
//
// Un balayage LITTÉRAL seul se serait trompé, et c'est mesuré : le web écoute
// `friend-request:accepted` par `SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED`, sans
// jamais épeler le nom.
//
// ─── L'inventaire, et pourquoi il n'excuse rien ───────────────────────────
//
// Chaque entrée porte ce que la MESURE a dit — émis ou non, par qui — et aucune
// ne porte de verdict : décider s'il faut écrire le client, retirer l'émission
// ou retirer la déclaration appartient au produit (#18342). Le cliquet à deux
// sens fait le reste : un nom qui trouve un lecteur doit SORTIR de la table, et
// un huitième orphelin rougit chez celui qui l'écrit.

import { describe, expect, it } from 'vitest';

import { RESERVED_SERVER_EVENTS } from '../../types/socketio-events/event-names';

import { readContractPayloads } from './socket-payload-shape/mirror-contract';
import { eventsNamedByClients } from './socket-payload-shape/client-event-readers';

const SANS_LECTEUR: ReadonlyMap<string, string> = new Map([
  ['user:preferences-community-reordered', "ÉMIS — `routes/community-preferences.ts` après chaque réordonnancement, sur la room personnelle (#18915, cycle 128 : un nom NEUF plutôt qu'un élargissement de `user:preferences-reordered`, dont le décodeur iOS est strict). Mesuré au cycle 207 (#20267) : AUCUN client ne le cite. Android passait pour son lecteur parce que `PreferencesSocketManager.kt` écrit « `user:preferences-community-reordered` stays unheard: measured, nothing under `apps/android` caches a community-preference row » — une NÉGATION que le relevé comptait comme une citation. Décision à prendre (#20268) : écrire le lecteur là où la ligne est cachée, ou retirer l'émission."],
  ['agent:admin-event', 'ÉMIS — `AgentAdminRelay` vers la room des agents admin. Aucune surface cliente ne le lit.'],
  ['link:message:new', "ÉMIS — `linkMessageEmissions` et le rejeu hors ligne. `services/gateway/CLAUDE.md` lui prêtait « son unique auditeur (le web) » ; la prémisse est CORRIGÉE depuis le cycle 161 — aucun client ne cite ce nom ni sa constante, et le raisonnement du cycle 114 tient pour une raison plus forte."],
  ['location:blood-moved', "ÉMIS — `signalBloodMoved` (`bloodMoved.ts`) vers la room de chaque lecteur autorisé de l'historique d'un Sang, sans coordonnée, à chaque point (#19400). Lecteurs : la carte des proches iOS (`SharedLocationsLive`) et ses miroirs (#18857), qui relisent `GET /relations/locations?include=blood` ; d'ici là la relecture suffit."],
  ['location:share-requested', 'ÉMIS — `sharedLocationRequest.ts`, à l\'émetteur seul, quand un destinataire demande de prolonger ou de refaire son partage (#19204). Lecteurs : les lots clients de la carte du profil (#18857) ; la notification `location_share_requested` porte la même demande app fermée.'],
  ['contact-exchange:received', 'ÉMIS — `contactExchange.ts`, à l\'émetteur seul, quand un lecteur accepte son jeton de partage sans contact (#19205), derrière `CONTACT_EXCHANGE_ENABLED` éteint. Lecteurs : les lots clients du partage sans contact (#18857).'],
  ['call:transcription-result', 'ni émis ni lu — dette de contrat.'],
  ['call:translation-enabled', 'ni émis ni lu — dette de contrat.'],
  ['call:translation-requested', 'ni émis ni lu — dette de contrat.'],
  ['e2ee:verification', 'ÉMIS — `E2EEDeviceVerificationRelay` vers la room de la génération destinataire (#19156). Les lecteurs sont les lots clients de la confirmation par code (iOS lot 4, Android lot 5, web lot 6, spec 2026-11-17 § 10) ; `GET /e2ee/devices/self/verifications` relit sans la socket.'],
  ['e2ee:own-device-enrolled', 'ÉMIS — `own-device-announcements.ts` à chaque enrôlement d\'une génération neuve ou de retour (#19156). Lecteurs : lots clients 4, 5 et 6 ; le rapprochement par `GET /e2ee/devices` ne dépend pas de l\'événement.'],
  ['relation:level-lowered', "ÉMIS — `emitRelationLevelLowered` (`socketio/relationEvents.ts`) vers la SEULE room de l'acteur après `POST /relations/:userId/level` (#19366). Lecteurs : les clients du profil (#18857) ; d'ici là chacun relit `GET /relations/:userId`."],
  ['user:blocked-by-me', "ÉMIS — `emitBlockedByMe` vers la SEULE room de l'acteur après `PUT /directory/blocks/:id` et son alias (#19366). Lecteurs : les clients du profil (#18857) ; d'ici là chacun relit `GET /directory/blocks`."],
  ['user:unblocked-by-me', "ÉMIS — `emitBlockedByMe` vers la SEULE room de l'acteur après `DELETE /directory/blocks/:id` et son alias (#19366). Lecteurs : les clients du profil (#18857)."],
  ['user:profile-changed', "ÉMIS — `emitProfileChanged` (`services/notifications/profile-changed.ts`) vers les liés Connaissance+ et les partenaires de conversation, hors blocage, quand bio, ville, langues, voix, décor ou adresses changent (#19384). Lecteurs : les clients du profil (#18857), qui revalident `GET /directory/people/:handle` avec `If-None-Match`."],
  ['tracking-link:clicked', "ÉMIS — `linkActivityRelayOf(...).trackingLinkClicked` (`socketio/linkActivityEvents.ts`) vers la SEULE room du créateur après `GET /l/:token` et `POST /tracking-links/:token/click` (#19446). Lecteurs : les billets de la face Liens du profil (#18857)."],
  ['share-link:arrival', "ÉMIS — `announceShareLinkArrival` vers le créateur du lien et les modérateurs+ de la conversation, après le pays de l'arrivée (#19446). Lecteurs : la fiche d'un lien de partage (#18857)."],
  ['community-link:entry', "ÉMIS — `announceCommunityLinkEntry` vers les intendants (`isCommunitySteward`) à une entrée `via: 'link'` (#19446). Lecteurs : le billet du lien de communauté (#18857)."],
  ['affiliate:referral-joined', "ÉMIS — `announceAffiliateReferral` vers la SEULE room du parrain à une relation neuve (#19446). Lecteurs : le billet Parrainage (#18857)."],
  ['friend-request:updated', "ÉMIS — `FriendRequestMessageTranslationService` (via `friend-requests-core.ts`) vers la SEULE room du destinataire quand le mot d'une demande vient d'être traduit (#19361), sans contenu. Lecteurs : la liste des demandes reçues (#18857), qui relit la demande ; d'ici là la relecture manuelle suffit."],
  ['e2ee:own-device-retired', 'ÉMIS — `own-device-announcements.ts` au retrait d\'une génération (#19156). Lecteurs : lots clients 4, 5 et 6.'],
]);

const contract = readContractPayloads();
const named = eventsNamedByClients();

const orphans = (): readonly string[] =>
  [...contract.keys()].filter((event) => !named.has(event)).sort();

describe("l'événement du contrat que personne ne lit (#18342)", () => {
  it('balaie les sources des trois clients — un balayage vide ne rougit jamais tout seul', () => {
    expect(contract.size).toBeGreaterThanOrEqual(150);
    expect([...named].filter((event) => contract.has(event)).length).toBeGreaterThanOrEqual(150);
  });

  it('tout événement du contrat est CITÉ par au moins un client — hors inventaire', () => {
    const unexpected = orphans().filter((event) => !SANS_LECTEUR.has(event));
    expect(
      unexpected,
      `\n${unexpected
        .map(
          (event) =>
            `${event} — déclaré par \`ServerToClientEvents\` et cité par AUCUN client. ` +
            "Écrire le lecteur, retirer l'émission, ou retirer la déclaration — et si la " +
            "décision attend, l'inscrire dans SANS_LECTEUR avec ce que la mesure dit de son émetteur.",
        )
        .join('\n')}\n`,
    ).toEqual([]);
  });

  /** Le second sens : un nom qui a trouvé son lecteur doit SORTIR de la table. */
  it("chaque entrée de l'inventaire est ENCORE sans lecteur", () => {
    const stale = [...SANS_LECTEUR.keys()].filter((event) => named.has(event) || !contract.has(event));
    expect(
      stale,
      `lu ou retiré du contrat — à sortir de l'inventaire : ${stale.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * **UNE RÉSERVATION NE S'AUTO-ATTESTE PAS** (#20295). `RESERVED_SERVER_EVENTS`
   * déclarait, en prose, que ses trois noms étaient « décodés côté clients » —
   * mesuré FAUX : aucun des trois n'est cité nulle part hors du contrat, et
   * l'inventaire ci-dessus les porte depuis toujours sous « ni émis ni lu ».
   * Deux affirmations contradictoires sur la même donnée, dont une seule se
   * mesurait.
   *
   * Le coût d'une telle phrase n'est pas son inexactitude : c'est qu'elle
   * ORIENTE. Lue par qui vient écrire le pipeline de traduction en appel, elle
   * dit « les clients sont prêts, il ne manque que l'émetteur » — et ce lot-là
   * livrerait un émetteur que personne n'affiche (cycle 122).
   *
   * Le doc-comment de la réservation raconte lui-même que la prose qu'il a
   * remplacée « avait pourri sans que rien ne le signale ». Réécrire la prose
   * ne l'empêche pas de pourrir à nouveau ; la rendre VÉRIFIABLE, oui — d'où ce
   * témoin, qui tombe dès qu'un nom réservé trouve un lecteur ou un émetteur
   * sans sortir de la réservation.
   */
  it('un nom RÉSERVÉ est mesuré sans lecteur, et la réservation ne l’affirme plus toute seule', () => {
    const reserved = [...RESERVED_SERVER_EVENTS];
    const read = reserved.filter((event) => named.has(event));
    expect(
      read,
      `nom RÉSERVÉ que des clients citent — le service a-t-il atterri ? alors sortir de `
        + `RESERVED_SERVER_EVENTS et de l'inventaire : ${read.join(', ')}`,
    ).toEqual([]);

    const unmeasured = reserved.filter((event) => !SANS_LECTEUR.has(event));
    expect(
      unmeasured,
      `nom RÉSERVÉ absent de l'inventaire mesuré — une réservation dit ce qu'elle a MESURÉ, `
        + `jamais ce qu'elle espère : ${unmeasured.join(', ')}`,
    ).toEqual([]);
  });
});
