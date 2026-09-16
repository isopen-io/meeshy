/**
 * La portée d'annuaire — un compte actif sans `blockedUserIds` (jamais bloqué
 * personne) doit rester CHERCHABLE. #6452, réécrit par #6811.
 *
 * Sur le connecteur MongoDB, Prisma enveloppe `{ has: viewerId }` d'un test
 * d'existence : `NOT: { blockedUserIds: { has } }` nu au premier niveau
 * excluait donc aussi les documents où le champ est ABSENT — mesuré en
 * production, 206 comptes actifs sur 246 n'avaient jamais écrit cette colonne
 * et disparaissaient de `GET /directory/people`, dont le compte système
 * `meeshy` lui-même.
 *
 * Le premier correctif a répondu par `blockedUserIds: { isSet: false }`, que
 * Prisma REFUSE d'émettre sur une liste scalaire requise (#6811) — d'où le
 * 500. La loi passe donc par une LISTE : `blockedIdsAroundViewer` résout les
 * deux directions du blocage par des requêtes POSITIVES, et
 * `contactLookupScope` n'écarte plus que des identifiants.
 *
 * Ce témoin joue la CHAÎNE ENTIÈRE — la liste puis le `where` — contre un
 * double qui honore la sémantique MongoDB « absent ≠ null » (`mongo-where.ts`).
 * Un double qui compare des objets nus ne peut PAS voir ce défaut, puisqu'il
 * ne distingue jamais une clé absente d'une clé fausse. Il ne peut pas voir
 * non plus ce que Prisma refuse d'émettre : c'est la charge de
 * `contact-lookup-scope-prisma-accepts.test.ts`, sa moitié obligée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  contactLookupScope,
  blockedIdsAroundViewer,
} from '../../../services/ContactDirectoryService';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const VIEWER = '507f1f77bcf86cd799439011';

/** Compte actif, jamais bloqué personne — la colonne n'a jamais été écrite. */
const MEESHY: MongoDocument = { id: 'meeshy', isActive: true, username: 'meeshy' };

/** Compte actif, colonne écrite, ne bloque personne. */
const AMI: MongoDocument = { id: 'ami', isActive: true, blockedUserIds: [] };

/** A BLOQUÉ le viewer — doit rester exclu, colonne présente. */
const BLOQUEUR: MongoDocument = { id: 'bloqueur', isActive: true, blockedUserIds: [VIEWER] };

/** Bloqué PAR le viewer — exclu par la liste du lecteur. */
const BLOQUE_PAR_VIEWER: MongoDocument = { id: 'bloque-par-viewer', isActive: true, blockedUserIds: [] };

const DOCUMENTS = [MEESHY, AMI, BLOQUEUR, BLOQUE_PAR_VIEWER];

/**
 * Une base minimale : `findMany` répond à la question « qui a bloqué X ? » par
 * un balayage des documents, `findUnique` rend la liste du lecteur. C'est
 * exactement ce que `getBlockRelatedUserIds` demande.
 */
function prismaDouble(listeDuViewer: readonly string[]) {
  return {
    user: {
      findMany: async (args: { where: { blockedUserIds: { has: string } } }) =>
        DOCUMENTS.filter((doc) =>
          Array.isArray(doc.blockedUserIds) &&
          (doc.blockedUserIds as string[]).includes(args.where.blockedUserIds.has)
        ).map((doc) => ({ id: doc.id })),
      findUnique: async () => ({ blockedUserIds: [...listeDuViewer] }),
    },
  };
}

async function search(listeDuViewer: readonly string[] = []): Promise<MongoDocument[]> {
  const blockedRelatedIds = await blockedIdsAroundViewer(
    prismaDouble(listeDuViewer) as never,
    VIEWER
  );
  const where = contactLookupScope({ blockedRelatedIds });
  return DOCUMENTS.filter((doc) => matchesMongoWhere(doc, where as never));
}

describe('portée d\'annuaire — absent vs null sur blockedUserIds (#6452, #6811)', () => {
  it('rend un compte actif dont `blockedUserIds` est ABSENT — le défaut mesuré en production', async () => {
    expect((await search()).map((d) => d.id)).toContain('meeshy');
  });

  it('rend un compte actif dont `blockedUserIds` est un tableau VIDE', async () => {
    expect((await search()).map((d) => d.id)).toContain('ami');
  });

  it("n'est toujours PAS rendu : un compte qui a BLOQUÉ le lecteur", async () => {
    expect((await search()).map((d) => d.id)).not.toContain('bloqueur');
  });

  it("n'est toujours PAS rendu : un compte que le lecteur a BLOQUÉ", async () => {
    const found = await search([BLOQUE_PAR_VIEWER.id as string]);
    expect(found.map((d) => d.id)).not.toContain('bloque-par-viewer');
  });

  it('rend exactement les deux comptes non bloqués, dans les deux sens, quand aucun blocage ne joue', async () => {
    const found = await search([BLOQUE_PAR_VIEWER.id as string]);
    expect(found.map((d) => d.id).sort()).toEqual(['ami', 'meeshy']);
  });

  it("un lecteur SANS identifiant n'interroge pas la base — un `findUnique({ id: '' })` serait un 500", async () => {
    const jamais = {
      user: {
        findMany: async () => {
          throw new Error('la base ne doit pas être interrogée');
        },
        findUnique: async () => {
          throw new Error('la base ne doit pas être interrogée');
        },
      },
    };
    await expect(blockedIdsAroundViewer(jamais as never, '')).resolves.toEqual([]);
  });
});
