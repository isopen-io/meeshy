/**
 * #4351 — **`PATCH /links/:linkId` est l'unique écriture d'un lien de partage.**
 *
 * Trois routes écrivaient le même bloc, chacune avec sa propre projection
 * `include` et sa propre décision de révoquer, ou non, les invités déjà
 * entrés :
 *
 *   - `PATCH /links/:linkId`        (`routes/links/management.ts`)
 *   - `PATCH /links/:linkId/toggle` (`routes/links/admin.ts`, alias déprécié)
 *   - `PATCH /links/:linkId/extend` (`routes/links/admin.ts`, alias déprécié)
 *
 * C'est cette recopie qui avait produit la divergence de #4170 : `/toggle`
 * révoquait, `PATCH` acceptait `isActive: false` **sans** révoquer. Le seuil
 * effectif d'une règle recopiée est celui de sa copie la plus permissive.
 *
 * ## Ce que ce fichier garde, et pourquoi ainsi
 *
 * La révocation vit désormais dans `applyShareLinkUpdate`, pas chez
 * l'appelant. Un appelant qui l'oublie ferme la porte **sans vider la salle**,
 * et l'oubli ne se voit pas : la ligne du lien porte bien `isActive: false`,
 * la liste rend le bon état, et les invités continuent de recevoir chaque
 * message. Aucune assertion sur la réponse ne peut donc l'attraper — il faut
 * mesurer l'APPEL, et son ORDRE.
 *
 * L'ordre est le sujet du dernier `it`, et il n'est pas cosmétique :
 * `Participant.shareLinkId` est une colonne nue (aucune relation Prisma, donc
 * aucune cascade). Révoquer APRÈS laisserait, si la révocation lève,
 * exactement l'état interdit — lien fermé, invités encore dans la room, et
 * plus rien pour les retrouver.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockRevoke = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../socketio/revokeShareLinkGuests', () => ({
  revokeShareLinkGuests: (...args: any[]) => mockRevoke(...args),
}));

import { applyShareLinkUpdate } from '../../../../routes/links/management';

const ROW_ID = '507f1f77bcf86cd799439011';

/** Journal d'appels PARTAGÉ : c'est lui qui rend l'ordre observable. */
let journal: string[] = [];

function buildFastify() {
  return {
    prisma: {
      conversationShareLink: {
        update: jest.fn<any>(async (args: any) => {
          journal.push('update');
          return { id: args.where.id, ...args.data };
        }),
      },
    },
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({}),
      }),
    },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  journal = [];
  mockRevoke.mockImplementation(async () => { journal.push('revoke'); });
});

describe('#4351 — applyShareLinkUpdate est le site unique de l\'écriture', () => {
  it('fermer un lien révoque les invités déjà entrés', async () => {
    const fastify = buildFastify();

    await applyShareLinkUpdate(fastify, ROW_ID, { isActive: false });

    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ shareLinkId: ROW_ID })
    );
  });

  it('ROUVRIR un lien ne rend rien à personne — une ligne Participant close ne se rouvre que par la porte d\'entrée', async () => {
    const fastify = buildFastify();

    await applyShareLinkUpdate(fastify, ROW_ID, { isActive: true });

    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('une écriture qui ne NOMME PAS isActive ne révoque rien — c\'est le cas de /extend', async () => {
    const fastify = buildFastify();

    await applyShareLinkUpdate(fastify, ROW_ID, { expiresAt: new Date('2027-01-01') });

    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('la révocation précède l\'écriture — l\'ordre inverse laisse l\'état interdit si elle lève', async () => {
    const fastify = buildFastify();

    await applyShareLinkUpdate(fastify, ROW_ID, { isActive: false });

    expect(journal).toEqual(['revoke', 'update']);
  });

  it('et si la révocation LÈVE, le lien reste ACTIF — la reprise est idempotente', async () => {
    const fastify = buildFastify();
    mockRevoke.mockImplementation(async () => { throw new Error('socket down'); });

    await expect(
      applyShareLinkUpdate(fastify, ROW_ID, { isActive: false })
    ).rejects.toThrow('socket down');

    // Le témoin qui compte : AUCUNE écriture n'a eu lieu. Sans lui, l'ordre
    // seul ne prouverait pas l'échec FERMÉ — un `catch` avalant la révocation
    // rendrait `['revoke', 'update']` tout en laissant passer l'état interdit.
    expect(fastify.prisma.conversationShareLink.update).not.toHaveBeenCalled();
  });
});

describe('#4351 — les deux alias dépréciés DÉLÈGUENT, ils ne recopient plus', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const ADMIN = fs.readFileSync(
    path.join(__dirname, '../../../../routes/links/admin.ts'),
    'utf-8'
  );

  it('/toggle et /extend appellent applyShareLinkUpdate', () => {
    const appels = ADMIN.match(/applyShareLinkUpdate\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(2);
  });

  it('et ne rappellent plus revokeShareLinkGuests eux-mêmes — sauf DELETE, qui garde son update NU', () => {
    // Une garde négative doit dire ce qu'elle TOLÈRE, sinon elle se fait
    // désarmer au premier ajout légitime. `DELETE /links/:linkId` révoque
    // encore explicitement : sa réponse ne porte qu'un message, et lui faire
    // traverser `applyShareLinkUpdate` lui ferait payer une projection
    // `include` que personne n'y lit.
    const appels = ADMIN.match(/await revokeShareLinkGuests\(/g) ?? [];
    expect(appels).toHaveLength(1);
  });
});
