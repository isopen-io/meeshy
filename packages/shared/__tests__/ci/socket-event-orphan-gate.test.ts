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

import { readContractPayloads } from './socket-payload-shape/mirror-contract';
import { eventsNamedByClients } from './socket-payload-shape/client-event-readers';

const SANS_LECTEUR: ReadonlyMap<string, string> = new Map([
  ['authenticated', 'ÉMIS — `AuthHandler` le pousse à CHAQUE authentification de socket (deux sites). Aucun client ne le cite ; ils lisent l\'accusé de la poignée de main.'],
  ['agent:admin-event', 'ÉMIS — `AgentAdminRelay` vers la room des agents admin. Aucune surface cliente ne le lit.'],
  ['link:message:new', "ÉMIS — `linkMessageEmissions` et le rejeu hors ligne. `services/gateway/CLAUDE.md` lui prêtait « son unique auditeur (le web) » ; la prémisse est CORRIGÉE depuis le cycle 161 — aucun client ne cite ce nom ni sa constante, et le raisonnement du cycle 114 tient pour une raison plus forte."],
  ['location:blood-proximity', 'ÉMIS — `bloodProximity.ts`, DEUX `emit` par alerte. Le client du mode Sang n\'est peut-être pas encore écrit (#13928).'],
  ['call:transcription-result', 'ni émis ni lu — dette de contrat.'],
  ['call:translation-enabled', 'ni émis ni lu — dette de contrat.'],
  ['call:translation-requested', 'ni émis ni lu — dette de contrat.'],
  ['e2ee:verification', 'ÉMIS — `E2EEDeviceVerificationRelay` vers la room de la génération destinataire (#19156). Les lecteurs sont les lots clients de la confirmation par code (iOS lot 4, Android lot 5, web lot 6, spec 2026-11-17 § 10) ; `GET /e2ee/devices/self/verifications` relit sans la socket.'],
  ['e2ee:own-device-enrolled', 'ÉMIS — `own-device-announcements.ts` à chaque enrôlement d\'une génération neuve ou de retour (#19156). Lecteurs : lots clients 4, 5 et 6 ; le rapprochement par `GET /e2ee/devices` ne dépend pas de l\'événement.'],
  ['relation:level-lowered', "ÉMIS — `emitRelationLevelLowered` (`socketio/relationEvents.ts`) vers la SEULE room de l'acteur après `POST /relations/:userId/level` (#19366). Lecteurs : les clients du profil (#18857) ; d'ici là chacun relit `GET /relations/:userId`."],
  ['user:blocked-by-me', "ÉMIS — `emitBlockedByMe` vers la SEULE room de l'acteur après `PUT /directory/blocks/:id` et son alias (#19366). Lecteurs : les clients du profil (#18857) ; d'ici là chacun relit `GET /directory/blocks`."],
  ['user:unblocked-by-me', "ÉMIS — `emitBlockedByMe` vers la SEULE room de l'acteur après `DELETE /directory/blocks/:id` et son alias (#19366). Lecteurs : les clients du profil (#18857)."],
  ['user:profile-changed', "ÉMIS — `emitProfileChanged` (`services/notifications/profile-changed.ts`) vers les liés Connaissance+ et les partenaires de conversation, hors blocage, quand bio, ville, langues, voix, décor ou adresses changent (#19384). Lecteurs : les clients du profil (#18857), qui revalident `GET /directory/people/:handle` avec `If-None-Match`."],
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
});
