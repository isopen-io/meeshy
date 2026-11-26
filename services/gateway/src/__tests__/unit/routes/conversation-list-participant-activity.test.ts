/**
 * #9071 — la liste des conversations sert, au niveau du participant, l'activité
 * du COMPTE et jamais la date de la ligne `Participant` (son entrée dans la
 * conversation). La paire `isOnline` / `lastActiveAt` vient d'UNE source.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { participantActivity } from '../../../routes/conversations/participant-activity';

const entree = new Date('2026-10-01T17:32:40.000Z');
const activiteCompte = new Date('2026-10-02T07:58:00.000Z');

const inscrit = (surcharge: Record<string, unknown> = {}) => ({
  userId: 'u1',
  isOnline: false,
  lastActiveAt: entree,
  user: { isOnline: true, lastActiveAt: activiteCompte },
  ...surcharge,
});

describe('participantActivity — la paire de présence d’un participant de la liste', () => {
  it('un inscrit sert la dernière activité de son COMPTE, pas la date de sa ligne participant', () => {
    expect(participantActivity(inscrit())).toEqual({ isOnline: true, lastActiveAt: activiteCompte });
  });

  it('un inscrit dont le compte n’a aucune activité connue sert null, jamais la date d’entrée', () => {
    expect(participantActivity(inscrit({ user: { isOnline: null, lastActiveAt: null } }))).toEqual({
      isOnline: null,
      lastActiveAt: null,
    });
  });

  it('un inscrit dont le compte n’est pas chargé ne fabrique rien', () => {
    expect(participantActivity(inscrit({ user: null }))).toEqual({ isOnline: null, lastActiveAt: null });
  });

  it('un participant sans compte garde l’activité de sa session, portée par sa ligne', () => {
    expect(
      participantActivity({ userId: null, isOnline: true, lastActiveAt: entree, user: null }),
    ).toEqual({ isOnline: true, lastActiveAt: entree });
  });
});
