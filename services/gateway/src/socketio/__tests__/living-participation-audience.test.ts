/**
 * Un membre ACTIF ET BANNI ne reçoit ni contenu, ni rejeu (#16690).
 *
 * Le cliquet voisin (`conversation-audience-living-participation`) garde le
 * TEXTE des requêtes ; celui-ci garde leur EFFET — et les deux ne se
 * remplacent pas. Le défaut que ce fichier ferme n'était couvert par aucun
 * témoin : le seul qui s'en approchait
 * (`emitUnreadCountsToRecipients.test.ts`) n'assertait que le filtre
 * `isActive` de la REQUÊTE, c'est-à-dire la forme du défaut et non son effet.
 *
 * **Le double ÉVALUE le `where`.** Un double qui rend une liste fixe ne peut
 * par construction pas voir une clause fausse : il répond ce qu'on lui dit,
 * quel que soit le filtre. C'est la même exigence que la pagination du
 * cycle 139 — pour prouver une clause, il faut l'exécuter.
 *
 * ## Les DEUX moitiés, et la seconde est celle qui casse
 *
 * Resserrer sur `bannedAt` est un correctif à RISQUE, et le dépôt a déjà payé
 * ce piège quatre fois en production : `{ bannedAt: null }` est une ÉGALITÉ, et
 * la colonne est ABSENTE du document de tout participant jamais banni — donc
 * l'immense majorité. Écrit naïvement, ce lot aurait vidé toutes les audiences
 * de diffusion de la passerelle. D'où le second témoin, qui est le plus
 * important des deux : **un membre jamais banni, dont la colonne n'existe pas,
 * reçoit toujours.**
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { ADMITTED_FILE_READER_WHERE } from '../../services/attachments/fileReaderAdmission';
import { fetchParticipantSuperset } from '../participant-superset';
import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';

const CONV = '507f1f77bcf86cd799439011';

/** Une ligne telle que MongoDB la porte : `bannedAt` peut être ABSENT. */
type Row = { id: string; userId: string | null; isActive: boolean; bannedAt?: Date | null };

const ROWS: Row[] = [
  // Jamais banni : la colonne n'existe PAS dans le document.
  { id: 'p-live', userId: 'u-live', isActive: true },
  // Débanni : un chemin a explicitement remis la colonne à zéro.
  { id: 'p-unbanned', userId: 'u-unbanned', isActive: true, bannedAt: null },
  // LE cas du lot : banni pendant l'inactivité (seul `bannedAt` est écrit),
  // puis rallumé par `restore-for-me` avant #10436.
  { id: 'p-banned', userId: 'u-banned', isActive: true, bannedAt: new Date('2026-09-01T00:00:00Z') },
  { id: 'p-inactive', userId: 'u-inactive', isActive: false },
];

/**
 * Évalue la forme de `where` que ces audiences emploient : `conversationId`,
 * `isActive`, et la clé `OR` d'`unsetOrNull('bannedAt')` — nul OU absent.
 */
function bannedAtClauseMatches(row: Row, expected: unknown): boolean {
  // Sémantique PRISMA sur MongoDB, celle que `utils/prisma-unset.ts` documente
  // et que ce dépôt a payée QUATRE fois en production : `{ champ: null }` est
  // une ÉGALITÉ et n'apparie PAS une colonne absente. Les deux états « pas
  // encore » coexistent et aucun n'est déductible de l'autre — c'est tout
  // l'objet de la clé `OR` que la loi répand.
  if (expected === null) return 'bannedAt' in row && row.bannedAt === null;
  if (expected && typeof expected === 'object' && (expected as { isSet?: boolean }).isSet === false) {
    return !('bannedAt' in row);
  }
  return false;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  if ('isActive' in where && row.isActive !== where.isActive) return false;
  // Un `bannedAt` de PREMIER NIVEAU — la forme NAÏVE du correctif. Sans cette
  // branche, le témoin de non-régression ne pouvait pas tomber sous la seule
  // mutation qu'il existe pour attraper : l'évaluateur ignorait la clause, donc
  // rendait la ligne jamais-bannie quoi qu'on écrive. Un évaluateur incomplet
  // est un double qui ment par ce qu'il ne REGARDE pas.
  if ('bannedAt' in where && !bannedAtClauseMatches(row, where.bannedAt)) return false;
  const or = where.OR as Array<Record<string, unknown>> | undefined;
  if (or && !or.some((clause) => 'bannedAt' in clause && bannedAtClauseMatches(row, clause.bannedAt))) {
    return false;
  }
  return true;
}

function evaluatingPrisma(): any {
  return {
    participant: {
      findMany: jest.fn(async (args: any) => {
        const where = (args?.where ?? {}) as Record<string, unknown>;
        return ROWS.filter((row) => matches(row, where)).map((row) => ({
          id: row.id,
          userId: row.userId,
          language: null,
          user: null,
          joinedAt: new Date('2026-01-01T00:00:00Z'),
        }));
      }),
    },
  };
}

describe('audiences de diffusion — un membre ACTIF ET BANNI est traité comme parti', () => {
  /**
   * Ce qui AUTORISE le cliquet voisin à lire `ADMITTED_FILE_READER_WHERE`
   * comme une épellation de la loi. Sans cette preuve, accepter un second nom
   * serait précisément la jumelle qu'on vient de retirer.
   */
  it('l’admission d’un lecteur de fichier EST la loi, pas une seconde expression', () => {
    expect(ADMITTED_FILE_READER_WHERE).toBe(PARTICIPATION_VIVANTE);
  });

  it('la projection d’aperçu ne nomme pas un membre banni', async () => {
    const prisma = evaluatingPrisma();
    const rows = await fetchParticipantSuperset(prisma, CONV, 'test');
    expect(rows?.map((r: any) => r.id)).toEqual(['p-live', 'p-unbanned']);
  });

  /**
   * LE témoin le plus important du fichier : la régression que ce lot pouvait
   * introduire. `{ bannedAt: null }` seul n'apparie pas une colonne ABSENTE —
   * et c'est l'état de l'immense majorité des lignes.
   */
  it('sert toujours un membre JAMAIS banni, dont la colonne n’existe pas', async () => {
    const prisma = evaluatingPrisma();
    const rows = await fetchParticipantSuperset(prisma, CONV, 'test');
    expect(rows?.map((r: any) => r.id)).toContain('p-live');
  });

  /**
   * Le chemin le plus coûteux du défaut : la file de rejeu transporte le
   * message ENTIER, contenu compris, et la room `user:<id>` d'un banni est
   * rejointe INCONDITIONNELLEMENT — donc le drain l'atteignait.
   */
  it('n’enfile aucun contenu pour un membre banni', async () => {
    const prisma = evaluatingPrisma();
    const enqueue = jest.fn<any>().mockResolvedValue(undefined);
    await enqueueForOfflineParticipants(
      { deliveryQueue: { enqueue } as any, prisma, connectedUsers: new Map() },
      {
        conversationId: CONV,
        actorParticipantId: null,
        actorUserId: 'u-sender',
        messageId: '507f1f77bcf86cd799439022',
        payload: { id: '507f1f77bcf86cd799439022', content: 'secret' } as any,
        atRest: false,
      } as any
    );

    const keys = enqueue.mock.calls.map((call: any[]) => call[0]);
    expect(keys).toEqual(expect.arrayContaining(['u-live', 'u-unbanned']));
    expect(keys).not.toContain('u-banned');
    expect(keys).not.toContain('u-inactive');
  });
});
