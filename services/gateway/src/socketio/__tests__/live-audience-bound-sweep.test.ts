/**
 * #20020 — le cliquet de la borne, et l'inventaire de ce qui n'y est pas encore.
 *
 * ## Ce que ce cliquet a mesuré, et que l'issue n'avait pas mesuré
 *
 * #20020 énonçait « CINQ lecteurs des mêmes participants vivants, dont deux
 * sans aucune borne ». Mesuré par la commande, pas à l'œil :
 *
 * | | sites d'écriture de cette lecture |
 * |---|---|
 * | AVANT ce lot — total | **22** |
 * | AVANT ce lot — sans AUCUNE borne | **19** |
 * | retirés par ce lot (`emitAttachmentUpdated` ×1, `offlineParticipantQueue` ×2, `afterReadEarlyBurnGate` ×1 qui réécrivait la borne) | 4 |
 * | APRÈS — sans borne, gelés ci-dessous | **16**, dans 15 fichiers |
 * | APRÈS — bornés hors du site unique (`call-invite-events.ts`, son propre `take`) | 1 |
 *
 * L'écart avec l'issue n'est pas une négligence : c'est la seconde affirmation
 * que porte toute énumération de sites — « ce sont les sites où la règle
 * s'applique » — et qui n'est presque jamais vérifiée (leçon 261). Elle l'est
 * désormais par une commande.
 *
 * ## Quand il tombe
 *
 * Une entrée EN TROP = une lecture NEUVE de cette question vient d'entrer sans
 * borne. La réparation est `scanLiveParticipants` (ou `loadLiveAudience` pour
 * la projection qui nomme une room), **jamais** une ligne d'inventaire : il n'y
 * a pas de lecture non bornée LÉGITIME de cette question.
 *
 * Une entrée EN MOINS = un site a rejoint le site unique, et retirer sa ligne
 * fait partie du correctif.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { sweepUnboundedLiveReads } from './live-audience-bound-sweep';

/**
 * Ce qui reste NU, et la raison de chaque ligne. Aucune n'est une exemption de
 * principe : chacune nomme ce qui la retient, et son suivi.
 *
 * | ligne(s) | ce qui la retient |
 * |---|---|
 * | `handlers/MessageHandler.ts` | chemin tenu par une autre branche vivante au relevé du 2026-11-20 (règle d'asymétrie #5243) : la session qui n'a rien écrit cède |
 * | `routes/conversations/guest-sessions.ts`, `emitConversationActivityUpdate.ts` | la liste sert aussi d'EFFECTIF (`memberCount: remaining.length`) : un effectif tronqué est un nombre FAUX servi aux clients, pas une audience partielle. La troncature y exige une décision que ce lot ne prend pas |
 * | `participant-superset.ts` | **parti au lot #20051** : sa valeur voyage jusqu'à la file hors ligne de `message:new`, la seule porte DURABLE d'un message. Une troncature s'y rend donc comme une panne (`undefined`), jamais comme une liste |
 * | les dix autres | des audiences de DIFFUSION et des gates, chacun avec sa propre question sur ce qu'une troncature coûte. Un lot par famille |
 * | `participant-rights-core.ts`, `shareLinkArrivalAnnounce.ts`, `E2EEEnvelopeRelay.ts` | **arrivés par #20091, et pas parce qu'ils ont changé de borne** — voir ci-dessous |
 *
 * ## TROIS LIGNES QUE #20091 A RENDUES VISIBLES SANS RIEN DÉBORNER
 *
 * Ces trois sites étaient DÉJÀ sans borne avant #20091 ; ils étaient invisibles
 * à CE balayage pour la raison même qui faisait l'objet de ce lot-là : leur
 * `where` épelait la clause de participation À LA MAIN (`isActive: true` nu),
 * et le discriminant d'ici ne reconnaît la question qu'à ses deux constantes.
 * En les resserrant sur `PARTICIPATION_VIVANTE` — parce que ce sont des
 * AUDIENCES et qu'un banni n'a rien à y recevoir — #20091 les a fait entrer
 * dans le champ de ce cliquet-ci.
 *
 * > **Deux cliquets lisent le MÊME littéral pour deux propriétés
 * > différentes** : #16690 demande « la clause est-elle juste ? », #20020
 * > demande « la lecture est-elle bornée ? ». Épeler la loi répond à la
 * > première ET rend le site JUSTICIABLE de la seconde. C'est la réciproque de
 * > la leçon du cycle 192 (« un refactor qui sort un discriminant du littéral
 * > casse le cliquet qui le lit ») : ici on y REMET un discriminant, et le
 * > cliquet voisin se réveille. Aucune dette n'est créée — elle est
 * > ENREGISTRÉE, et c'est le résultat qu'on voulait.
 *
 * Ce qui les retient, et ce n'est pas la paresse d'un lot :
 *
 * - **`E2EEEnvelopeRelay.directoryOf` ne peut PAS être borné « au passage », et
 *   peut-être pas du tout.** Sa valeur alimente `compareDeviceSets`, qui exige
 *   une correspondance EXACTE : un annuaire TRONQUÉ ferait refuser en
 *   `409 DEVICES_MISMATCH` **tout** envoi d'une conversation trop grande, et un
 *   émetteur qui s'alignerait sur la troncature laisserait sans enveloppe les
 *   appareils non nommés — un message chiffré qui n'arrive jamais, sans que
 *   personne ne le sache. `complete === false` y exige donc une LEVÉE, pas un
 *   `take`, et c'est une décision de protocole.
 * - **`participant-rights-core` et `shareLinkArrivalAnnounce` sont des éventails
 *   d'HÔTES** (`role in creator|admin|moderator`) : leur cardinalité est bornée
 *   par le produit, pas par la requête. La borne y est juste, et elle se pose
 *   avec la question « combien d'hôtes une conversation peut-elle avoir ? »,
 *   qui n'a pas de réponse écrite aujourd'hui.
 *
 * Suivi : #20091.
 *
 * Clé par FICHIER, jamais par numéro de ligne : une clé de ligne dérive à la
 * première édition et transforme le cliquet en bruit (cycle 87 bis).
 */
const FROZEN_UNBOUNDED: readonly string[] = [
  'src/routes/conversations/guest-sessions.ts',
  'src/routes/conversations/participant-rights-core.ts',
  'src/services/conversations/shareLinkArrivalAnnounce.ts',
  'src/services/e2ee/E2EEEnvelopeRelay.ts',
  'src/services/mentions/mentionSuggestions.ts',
  'src/services/together/togetherGate.ts',
  'src/socketio/CallEventsHandler.ts',
  'src/socketio/agent-response-bridge.ts',
  'src/socketio/broadcastReadStatus.ts',
  'src/socketio/call-missed-notifications.ts',
  'src/socketio/emitConversationActivityUpdate.ts',
  'src/socketio/emitConversationPreviewUpdate.ts',
  'src/socketio/emitUnreadCountsToRecipients.ts',
  'src/socketio/handlers/MessageHandler.ts',
  'src/socketio/readerSignedDelivery.ts',
  'src/socketio/revokeShareLinkGuests.ts',
];

describe('#20020 — aucune lecture NEUVE des participants vivants sans borne', () => {
  it("l'inventaire des lectures nues est exactement celui qui est gelé", () => {
    const files = [...new Set(sweepUnboundedLiveReads().map((read) => read.file))].sort();

    expect(files).toEqual([...FROZEN_UNBOUNDED].sort());
  });

  it('les trois sites de ce lot ne sont PLUS dans la liste', () => {
    const files = new Set(sweepUnboundedLiveReads().map((read) => read.file));

    expect(files.has('src/socketio/conversationAudienceRooms.ts')).toBe(false);
    expect(files.has('src/socketio/emitAttachmentUpdated.ts')).toBe(false);
    expect(files.has('src/socketio/offlineParticipantQueue.ts')).toBe(false);
    expect(files.has('src/services/messaging/afterReadEarlyBurnGate.ts')).toBe(false);
  });

  /**
   * #20050 — la loi du plancher d'historique a quitté l'inventaire, et pas en
   * posant seulement un `take` : ses TROIS lectures passent par le site unique,
   * et une TRONCATURE y rend `{kind:'unknown'}`. Borner sans cela aurait
   * SOUS-exclu, donc ouvert une porte — c'est la raison pour laquelle #20020
   * l'avait gelée plutôt que corrigée au passage.
   */
  it("la loi du plancher d'historique a rejoint le site unique (#20050)", () => {
    const files = new Set(sweepUnboundedLiveReads().map((read) => read.file));

    expect(files.has('src/socketio/translationReaders.ts')).toBe(false);
  });

  /**
   * #20051 — le superset de `message:new` a rejoint le site unique, et sa
   * TRONCATURE se rend comme une panne (`undefined`). Rendre les lignes lues
   * aurait remis à la file une liste PARTIELLE qu'elle traite comme entière :
   * les absents non nommés n'auraient jamais reçu le message.
   */
  it('le superset de `message:new` a rejoint le site unique (#20051)', () => {
    const files = new Set(sweepUnboundedLiveReads().map((read) => read.file));

    expect(files.has('src/socketio/participant-superset.ts')).toBe(false);
  });

  /**
   * Un balayage négatif dont la sonde rend `[]` reste VERT quoi qu'il arrive.
   * Celui-ci prouve d'abord qu'il VOIT quelque chose — sans quoi le témoin
   * ci-dessus n'atteste que sa propre panne (règle de la garde de source de
   * `presence-visibility-viewer-aware-guard`).
   */
  it('il balaie bien le dépôt : la sonde rend des lectures, pas une liste vide', () => {
    expect(sweepUnboundedLiveReads().length).toBeGreaterThanOrEqual(FROZEN_UNBOUNDED.length);
  });
});
