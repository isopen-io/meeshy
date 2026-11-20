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
 * | `translationReaders.ts` (2 lectures) | la loi du plancher d'historique compose un COMPLÉMENT — `excludedQueueKeys`, les lecteurs qui ne doivent RIEN recevoir, dérivé d'une TROISIÈME lecture (`{ conversationId, isActive: true }`, hors de ce discriminant). Une lecture tronquée y SOUS-exclut, donc y FUIT : borner sans rendre le site fail-closed serait pire que de le laisser nu. Lot à part, avec audit adversarial |
 * | `handlers/MessageHandler.ts` | chemin tenu par une autre branche vivante au relevé du 2026-11-20 (règle d'asymétrie #5243) : la session qui n'a rien écrit cède |
 * | `routes/conversations/guest-sessions.ts`, `emitConversationActivityUpdate.ts` | la liste sert aussi d'EFFECTIF (`memberCount: remaining.length`) : un effectif tronqué est un nombre FAUX servi aux clients, pas une audience partielle. La troncature y exige une décision que ce lot ne prend pas |
 * | les onze autres | des audiences de DIFFUSION et des gates, chacun avec sa propre question sur ce qu'une troncature coûte. Un lot par famille |
 *
 * Clé par FICHIER, jamais par numéro de ligne : une clé de ligne dérive à la
 * première édition et transforme le cliquet en bruit (cycle 87 bis).
 */
const FROZEN_UNBOUNDED: readonly string[] = [
  'src/routes/conversations/guest-sessions.ts',
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
  'src/socketio/participant-superset.ts',
  'src/socketio/readerSignedDelivery.ts',
  'src/socketio/revokeShareLinkGuests.ts',
  'src/socketio/translationReaders.ts',
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
   * Un balayage négatif dont la sonde rend `[]` reste VERT quoi qu'il arrive.
   * Celui-ci prouve d'abord qu'il VOIT quelque chose — sans quoi le témoin
   * ci-dessus n'atteste que sa propre panne (règle de la garde de source de
   * `presence-visibility-viewer-aware-guard`).
   */
  it('il balaie bien le dépôt : la sonde rend des lectures, pas une liste vide', () => {
    expect(sweepUnboundedLiveReads().length).toBeGreaterThanOrEqual(FROZEN_UNBOUNDED.length);
  });
});
