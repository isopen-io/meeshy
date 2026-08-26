/**
 * Regroupement des bulles — un message SYSTÈME n'est pas une prise de parole.
 *
 * L'avis d'arrivée est écrit avec l'arrivant pour auteur (`joinSystemMessage.ts`
 * : « l'arrivant est l'auteur de son propre avis »). Comparer les seuls
 * `sender.id` faisait donc grouper la première vraie bulle de la personne avec
 * son propre avis — et la bulle perdait ensemble avatar, nom et horodatage.
 */

import {
  isFirstInGroup,
  isLastInGroup,
  type GroupableMessage,
} from '../../utils/message-grouping';

// Horodatages en heure LOCALE (sans `Z`) : le jour calendaire est alors
// indépendant du fuseau du runner, convention des tests `isNewCalendarDay`.
const JOUR_1 = '2026-08-25T14:00:00';
const JOUR_2 = '2026-08-26T09:00:00';

const parole = (senderId: string, createdAt: string = JOUR_1): GroupableMessage => ({
  sender: { id: senderId },
  messageSource: 'user',
  createdAt,
});

const avisSysteme = (senderId: string, createdAt: string = JOUR_1): GroupableMessage => ({
  sender: { id: senderId },
  messageSource: 'system',
  createdAt,
});

describe('message-grouping', () => {
  describe('isFirstInGroup', () => {
    it("ouvre un groupe quand il n'y a pas de message précédent", () => {
      expect(isFirstInGroup(null, parole('a'))).toBe(true);
    });

    it('regroupe deux paroles consécutives du même auteur', () => {
      expect(isFirstInGroup(parole('a'), parole('a'))).toBe(false);
    });

    it("ouvre un groupe quand l'auteur change", () => {
      expect(isFirstInGroup(parole('a'), parole('b'))).toBe(true);
    });

    it("ouvre un groupe après un message système DU MÊME auteur — le défaut de l'avis d'arrivée", () => {
      expect(isFirstInGroup(avisSysteme('a'), parole('a'))).toBe(true);
    });

    it('ouvre un groupe pour un message système lui-même', () => {
      expect(isFirstInGroup(parole('a'), avisSysteme('a'))).toBe(true);
    });

    it('regroupe deux paroles du même auteur le MÊME jour', () => {
      expect(isFirstInGroup(parole('a', JOUR_1), parole('a', JOUR_1))).toBe(false);
    });

    it("ouvre un groupe quand le même auteur franchit minuit — la bulle sous la capsule de date porte son identité", () => {
      expect(isFirstInGroup(parole('a', JOUR_1), parole('a', JOUR_2))).toBe(true);
    });
  });

  describe('isLastInGroup', () => {
    it("ferme un groupe quand il n'y a pas de message suivant", () => {
      expect(isLastInGroup(null, parole('a'))).toBe(true);
    });

    it('ne ferme pas un groupe suivi du même auteur', () => {
      expect(isLastInGroup(parole('a'), parole('a'))).toBe(false);
    });

    it("ferme un groupe quand l'auteur suivant change", () => {
      expect(isLastInGroup(parole('b'), parole('a'))).toBe(true);
    });

    it('ferme un groupe quand un message système suit, même auteur', () => {
      expect(isLastInGroup(avisSysteme('a'), parole('a'))).toBe(true);
    });

    it('ferme un groupe pour un message système lui-même', () => {
      expect(isLastInGroup(parole('a'), avisSysteme('a'))).toBe(true);
    });

    it('ferme un groupe quand le même auteur reprend le lendemain', () => {
      expect(isLastInGroup(parole('a', JOUR_2), parole('a', JOUR_1))).toBe(true);
    });
  });

  describe("auteur sans identifiant — deux inconnus ne sont pas la même personne", () => {
    it('ouvre un groupe quand les deux expéditeurs sont absents', () => {
      const sansAuteur: GroupableMessage = { messageSource: 'user', createdAt: JOUR_1 };
      expect(isFirstInGroup(sansAuteur, sansAuteur)).toBe(true);
    });
  });
});
