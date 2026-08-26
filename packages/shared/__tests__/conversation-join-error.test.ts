/**
 * Cycle 99 — `conversation:join-error` : le motif du refus DÉCIDE, ou il ne
 * sert à rien.
 *
 * La passerelle refuse une jonction sur HUIT sites, portant SEPT motifs
 * distincts. Trois disent « tu n'es pas membre » ; quatre sont transitoires (limite de débit, erreur
 * serveur, authentification pas encore prête, requête malformée). Les deux
 * consommateurs — le web et iOS — recevaient les sept et les traitaient comme
 * un seul : purge du cache de la conversation, retrait de la liste, et côté
 * iOS fermeture de la vue ouverte avec un bandeau « accès révoqué ».
 *
 * Ce module est la SEULE règle qui sépare les deux familles. Le témoin
 * ci-dessous énumère les sept motifs de production un par un : la table est
 * le contrat, et un motif ajouté côté passerelle sans décision ici se voit.
 */

import {
  CONVERSATION_JOIN_ERROR_REASONS,
  isMembershipDeniedJoinError,
  type ConversationJoinErrorReason,
} from '../utils/conversation-join-error.js';

describe('isMembershipDeniedJoinError', () => {
  describe('motifs qui ÉTABLISSENT la non-appartenance — purge légitime', () => {
    it.each<ConversationJoinErrorReason>([
      'not_a_member',
      'banned',
      'no_longer_member',
    ])('%s ⇒ true', (reason) => {
      expect(isMembershipDeniedJoinError(reason)).toBe(true);
    });
  });

  describe('motifs TRANSITOIRES — le cache doit survivre', () => {
    it.each<ConversationJoinErrorReason>([
      'invalid_payload',
      'not_authenticated',
      'rate_limited',
      'server_error',
    ])('%s ⇒ false', (reason) => {
      expect(isMembershipDeniedJoinError(reason)).toBe(false);
    });
  });

  describe('motif INCONNU — ne pas savoir lire n’autorise pas à détruire', () => {
    // Même règle de maison que `BridgeAnnouncement` (socketio-events.ts) : un
    // pont ILLISIBLE n'est pas un pont ABSENT. Une purge est une perte locale
    // que rien ne rattrape hors ligne ; garder un cache périmé est corrigé par
    // le prochain 403 REST. L'inconnu tombe donc du côté qui ne détruit pas.
    it.each([
      'a_reason_a_future_gateway_adds',
      '',
      'NOT_A_MEMBER',
      'not_a_member ',
    ])('%p ⇒ false', (reason) => {
      expect(isMembershipDeniedJoinError(reason)).toBe(false);
    });

    it('un motif absent (undefined) ⇒ false', () => {
      expect(isMembershipDeniedJoinError(undefined)).toBe(false);
    });

    it('un motif null ⇒ false', () => {
      expect(isMembershipDeniedJoinError(null)).toBe(false);
    });
  });

  describe('la table des motifs couvre exactement ce que la passerelle émet', () => {
    // Verrou d'ÉNUMÉRATION : `ConversationHandler.handleConversationJoin`
    // possède huit sites d'émission. Les lister ici fige la correspondance —
    // un neuvième motif ajouté sans passer par ce fichier rend ce témoin rouge
    // plutôt que de tomber en silence du côté « transitoire ».
    it('énumère les sept motifs de production', () => {
      expect([...CONVERSATION_JOIN_ERROR_REASONS].sort()).toEqual(
        [
          'banned',
          'invalid_payload',
          'no_longer_member',
          'not_a_member',
          'not_authenticated',
          'rate_limited',
          'server_error',
        ].sort()
      );
    });

    it('chaque motif connu est classé dans exactement une des deux familles', () => {
      const denied = CONVERSATION_JOIN_ERROR_REASONS.filter(isMembershipDeniedJoinError);
      const transient = CONVERSATION_JOIN_ERROR_REASONS.filter((r) => !isMembershipDeniedJoinError(r));
      expect(denied.length + transient.length).toBe(CONVERSATION_JOIN_ERROR_REASONS.length);
      expect(denied.length).toBeGreaterThan(0);
      expect(transient.length).toBeGreaterThan(0);
    });
  });
});
