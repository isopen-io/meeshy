import { describe, expect, test } from 'bun:test';

import { setupAdminKitTests } from '@/test-support/admin-harness';

import { servedInvitationDays } from './invitation-fixtures';
import { invitationSeries, invitationStatusExplain, isPendingInvitation } from './invitation-model';

/**
 * **CE QU'UNE DEMANDE PERMET, ET COMMENT SA COURBE SE LIT** (#8876, #6729).
 */

setupAdminKitTests({ languages: ['fr', 'en'] });

describe('seule une demande en attente s’annule', () => {
  test('pending, quelle que soit la casse servie', () => {
    expect(isPendingInvitation('pending')).toBe(true);
    expect(isPendingInvitation('PENDING')).toBe(true);
    expect(isPendingInvitation(' pending ')).toBe(true);
  });

  test('acceptée, refusée, inconnue ou absente : rien à annuler', () => {
    for (const status of ['accepted', 'rejected', 'blocked', '']) expect(isPendingInvitation(status)).toBe(false);
  });
});

describe('invitationStatusExplain — ce que le statut veut dire', () => {
  test('en attente et acceptée ont leur phrase ; refusée reprend celle de la bibliothèque', () => {
    expect(invitationStatusExplain('pending', 'fr')).toBe('Le destinataire n’a pas encore répondu.');
    expect(invitationStatusExplain('ACCEPTED', 'fr')).toBe('Les deux membres sont amis.');
    expect(invitationStatusExplain('rejected', 'fr')).toBe('Refusée par son destinataire ou annulée par un administrateur.');
    expect(invitationStatusExplain('pending', 'en')).toBe('The recipient has not answered yet.');
  });

  test('un statut inconnu ou absent n’explique rien', () => {
    expect(invitationStatusExplain('blocked', 'fr')).toBeNull();
    expect(invitationStatusExplain('', 'fr')).toBeNull();
  });
});

describe('invitationSeries — trois séries, sept jours réels', () => {
  test('chaque série a un point par jour, nommé dans la langue d’interface (jour lu en UTC)', () => {
    const series = invitationSeries(servedInvitationDays(), 'fr');

    expect(series.sent.map((point) => point.value)).toEqual([1, 0, 4, 2, 7, 3, 2]);
    expect(series.accepted.map((point) => point.value)).toEqual([1, 0, 2, 1, 3, 1, 0]);
    expect(series.rejected.map((point) => point.value)).toEqual([0, 0, 1, 0, 2, 1, 0]);
    expect(series.sent[0]?.x).toBe('jeu. 24 sept.');
    expect(invitationSeries(servedInvitationDays(), 'en').sent[0]?.x).toBe('Thu, Sep 24');
  });

  test('le pic est le jour où il s’est envoyé le plus de demandes', () => {
    expect(invitationSeries(servedInvitationDays(), 'fr').peak).toEqual({ day: 'lun. 28 sept.', sent: 7 });
  });

  test('aucune demande envoyée sur la période : pas de pic à annoncer', () => {
    const quiet = servedInvitationDays().map((day) => ({ ...day, sent: 0, accepted: 0, rejected: 0 }));

    expect(invitationSeries(quiet, 'fr').peak).toBeNull();
    expect(invitationSeries([], 'fr')).toEqual({ sent: [], accepted: [], rejected: [], peak: null });
  });
});
