import { describe, expect, it } from 'vitest';

import { ephemeralDeadline } from './ephemeral-deadline';

/**
 * LA RÈGLE D'ÉCHÉANCE D'UN ÉPHÉMÈRE — contrat du fil #7451 point 6, témoins
 * ROUGES d'abord (#7454).
 *
 * Elle vit ICI parce que les DEUX clients TypeScript la partagent : le fil de
 * `apps/web-v2` et, le jour où il la lira, le legacy. Un second calcul dans une
 * peau serait la jumelle que D-14 interdit.
 */

const RECEPTION = Date.parse('2026-09-22T10:00:00.000Z');
const SECOND = 1000;

describe('ephemeralDeadline', () => {
  it('ne décompte rien quand le message ne porte aucune protection temporelle', () => {
    expect(ephemeralDeadline({ isMine: false, receivedAtMs: RECEPTION })).toEqual({ state: 'none' });
  });

  it('part de la RÉCEPTION locale, jamais de l’envoi', () => {
    expect(
      ephemeralDeadline({ isMine: false, ephemeralDuration: 60, receivedAtMs: RECEPTION }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 60 * SECOND });
  });

  it('suit l’échéance SERVIE quand le client n’a pas de durée', () => {
    expect(
      ephemeralDeadline({
        isMine: false,
        servedExpiresAt: new Date(RECEPTION + 30 * SECOND),
        receivedAtMs: RECEPTION,
      }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 30 * SECOND });
  });

  it('retient la PLUS PROCHE des deux échéances — la servie', () => {
    expect(
      ephemeralDeadline({
        isMine: false,
        ephemeralDuration: 60,
        servedExpiresAt: new Date(RECEPTION + 30 * SECOND).toISOString(),
        receivedAtMs: RECEPTION,
      }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 30 * SECOND });
  });

  it('retient la PLUS PROCHE des deux échéances — la locale', () => {
    expect(
      ephemeralDeadline({
        isMine: false,
        ephemeralDuration: 10,
        servedExpiresAt: new Date(RECEPTION + 30 * SECOND).toISOString(),
        receivedAtMs: RECEPTION,
      }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 10 * SECOND });
  });

  it('laisse l’expéditeur EN ATTENTE DE RÉCEPTION tant qu’aucune échéance n’est servie', () => {
    expect(ephemeralDeadline({ isMine: true, ephemeralDuration: 120, receivedAtMs: RECEPTION })).toEqual({
      state: 'awaiting-reception',
      durationSeconds: 120,
    });
  });

  it('donne son échéance à l’expéditeur dès que le serveur la sert', () => {
    expect(
      ephemeralDeadline({
        isMine: true,
        ephemeralDuration: 120,
        servedExpiresAt: new Date(RECEPTION + 90 * SECOND),
        receivedAtMs: RECEPTION,
      }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 90 * SECOND });
  });

  it('tient un destinataire sans réception connue en attente plutôt que de fabriquer une échéance', () => {
    expect(ephemeralDeadline({ isMine: false, ephemeralDuration: 45 })).toEqual({
      state: 'awaiting-reception',
      durationSeconds: 45,
    });
  });

  it('ignore une durée absurde et une date illisible plutôt que de rendre NaN', () => {
    expect(ephemeralDeadline({ isMine: false, ephemeralDuration: 0, receivedAtMs: RECEPTION })).toEqual({
      state: 'none',
    });
    expect(
      ephemeralDeadline({ isMine: false, servedExpiresAt: 'pas une date', receivedAtMs: RECEPTION }),
    ).toEqual({ state: 'none' });
    expect(
      ephemeralDeadline({
        isMine: false,
        ephemeralDuration: 30,
        servedExpiresAt: 'pas une date',
        receivedAtMs: RECEPTION,
      }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 30 * SECOND });
  });

  it('arrondit une durée fractionnaire à la seconde plutôt que de porter des millisecondes', () => {
    expect(
      ephemeralDeadline({ isMine: false, ephemeralDuration: 30.4, receivedAtMs: RECEPTION }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 30 * SECOND });
  });
});
