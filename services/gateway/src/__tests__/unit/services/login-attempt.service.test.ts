/**
 * Une tentative d'authentification ratée est COMPTÉE, et le seuil ferme le compte (#4138).
 *
 * Le verrou existait entièrement — colonnes, erreur 423, job de déverrouillage —
 * et n'était armé nulle part. Ces témoins portent sur le site qui l'arme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOGIN_LOCK_DURATION_MS,
  LOGIN_LOCK_REASON,
  isAccountLocked,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  lockIsVisibleTo,
} from '../../../services/LoginAttemptService';

const USER = '507f1f77bcf86cd799439011';

/**
 * Un double qui tient un COMPTEUR, et non une valeur figée.
 *
 * Un `mockResolvedValue({ failedLoginAttempts: 5 })` rendrait le même nombre à
 * tous les appels : le témoin du seuil passerait au vert dès le PREMIER échec
 * et ne dirait donc rien de l'incrément. Le double ci-dessous rejoue la seule
 * propriété qui compte — chaque écriture rend une valeur d'APRÈS-écriture, donc
 * distincte.
 */
function prismaAvecCompteur(depart = 0) {
  let compteur = depart;
  const ecritures: Array<Record<string, unknown>> = [];

  const update = jest.fn(async (args: { data: Record<string, unknown>; select?: unknown }) => {
    ecritures.push(args.data);
    const inc = args.data.failedLoginAttempts as { increment?: number } | number | undefined;
    if (typeof inc === 'object' && inc?.increment) compteur += inc.increment;
    if (inc === 0) compteur = 0;
    return { failedLoginAttempts: compteur };
  });

  return { prisma: { user: { update } } as never, update, ecritures, lu: () => compteur };
}

describe('isAccountLocked — un verrou EXPIRÉ n’est pas un verrou', () => {
  const maintenant = new Date('2026-08-28T12:00:00Z');

  it('dit non quand aucune date n’est posée', () => {
    expect(isAccountLocked(null, maintenant)).toBe(false);
    expect(isAccountLocked(undefined, maintenant)).toBe(false);
  });

  it('dit oui tant que la date est devant', () => {
    expect(isAccountLocked(new Date('2026-08-28T12:00:01Z'), maintenant)).toBe(true);
  });

  it('dit non dès que la date est passée, sans attendre le job de déverrouillage', () => {
    expect(isAccountLocked(new Date('2026-08-28T11:59:59Z'), maintenant)).toBe(false);
    expect(isAccountLocked(maintenant, maintenant)).toBe(false);
  });
});

describe('recordFailedLoginAttempt — le compteur, puis le verrou', () => {
  it('compte sans verrouiller tant que le seuil n’est pas atteint', async () => {
    const { prisma, update } = prismaAvecCompteur();

    for (let i = 1; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      const etat = await recordFailedLoginAttempt(prisma, USER);
      expect(etat.attempts).toBe(i);
      expect(etat.lockedUntil).toBeNull();
    }

    // Une seule écriture par tentative : aucune n'a posé de verrou.
    expect(update).toHaveBeenCalledTimes(MAX_FAILED_LOGIN_ATTEMPTS - 1);
  });

  it('verrouille EXACTEMENT au seuil, et pas avant', async () => {
    const { prisma } = prismaAvecCompteur(MAX_FAILED_LOGIN_ATTEMPTS - 1);
    const maintenant = new Date('2026-08-28T12:00:00Z');

    const etat = await recordFailedLoginAttempt(prisma, USER, maintenant);

    expect(etat.attempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(etat.lockedUntil).toEqual(new Date(maintenant.getTime() + LOGIN_LOCK_DURATION_MS));
  });

  it('incrémente ATOMIQUEMENT — jamais un nombre lu puis réécrit', async () => {
    const { prisma, ecritures } = prismaAvecCompteur();

    await recordFailedLoginAttempt(prisma, USER);

    // La forme `{ increment: 1 }` est ce qui rend deux requêtes concurrentes
    // porteuses de deux valeurs distinctes. Une écriture d'un nombre ABSOLU
    // (`failedLoginAttempts: n + 1`) serait un TOCTOU : deux attaquants
    // simultanés écriraient le même n+1 et consommeraient une seule tentative.
    expect(ecritures[0]).toEqual({ failedLoginAttempts: { increment: 1 } });
  });

  it('nomme la raison du verrou, que le job de déverrouillage journalise', async () => {
    const { prisma, ecritures } = prismaAvecCompteur(MAX_FAILED_LOGIN_ATTEMPTS - 1);

    await recordFailedLoginAttempt(prisma, USER);

    expect(ecritures[1]).toMatchObject({ lockedReason: LOGIN_LOCK_REASON });
  });
});

describe('clearFailedLoginAttempts — une réussite efface l’ardoise', () => {
  it('remet le compteur, la date et la raison à zéro', async () => {
    const { prisma, ecritures } = prismaAvecCompteur(3);

    await clearFailedLoginAttempts(prisma, USER);

    // Laisser `lockedUntil` derrière soi ferait repartir le prochain échec d'un
    // compteur déjà haut : le compte se refermerait au premier faux pas.
    expect(ecritures[0]).toEqual({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lockedReason: null,
    });
  });
});

describe('lockIsVisibleTo — le verrou ne fabrique pas d’oracle d’existence', () => {
  it('se tait devant qui présente un mauvais mot de passe', () => {
    expect(lockIsVisibleTo(false)).toBe(false);
  });

  it('se dit à qui a prouvé qu’il est le propriétaire du compte', () => {
    expect(lockIsVisibleTo(true)).toBe(true);
  });
});
