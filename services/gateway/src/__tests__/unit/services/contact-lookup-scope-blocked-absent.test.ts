/**
 * `contactLookupScope` — un compte actif sans `blockedUserIds` (jamais bloqué
 * personne) doit rester CHERCHABLE. #6452.
 *
 * Sur le connecteur MongoDB, Prisma enveloppe `{ has: viewerId }` d'un test
 * d'existence : `NOT: { blockedUserIds: { has } }` nu au premier niveau
 * excluait donc aussi les documents où le champ est ABSENT — mesuré en
 * production, 206 comptes actifs sur 246 n'avaient jamais écrit cette colonne
 * et disparaissaient de `GET /directory/people`, dont le compte système
 * `meeshy` lui-même.
 *
 * Ce témoin joue le `where` produit par `contactLookupScope` contre un double
 * qui honore la sémantique MongoDB « absent ≠ null » (`mongo-where.ts`,
 * `isSet` compris) — un double qui compare des objets nus ne peut PAS voir ce
 * défaut, puisqu'il ne distingue jamais une clé absente d'une clé fausse.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { contactLookupScope } from '../../../services/ContactDirectoryService';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const VIEWER = '507f1f77bcf86cd799439011';

/** Compte actif, jamais bloqué personne — la colonne n'a jamais été écrite. */
const MEESHY: MongoDocument = { id: 'meeshy', isActive: true, username: 'meeshy' };

/** Compte actif, colonne écrite, ne bloque personne. */
const AMI: MongoDocument = { id: 'ami', isActive: true, blockedUserIds: [] };

/** A BLOQUÉ le viewer — doit rester exclu, colonne présente. */
const BLOQUEUR: MongoDocument = { id: 'bloqueur', isActive: true, blockedUserIds: [VIEWER] };

/** Bloqué PAR le viewer — exclu par `id: { notIn }`, pas par la clause `NOT`. */
const BLOQUE_PAR_VIEWER: MongoDocument = { id: 'bloque-par-viewer', isActive: true, blockedUserIds: [] };

const DOCUMENTS = [MEESHY, AMI, BLOQUEUR, BLOQUE_PAR_VIEWER];

function search(blockedByViewer: readonly string[] = []): MongoDocument[] {
  const where = contactLookupScope({ viewerId: VIEWER, blockedByViewer });
  return DOCUMENTS.filter((doc) => matchesMongoWhere(doc, where));
}

describe('contactLookupScope — absent vs null sur blockedUserIds (#6452)', () => {
  it('rend un compte actif dont `blockedUserIds` est ABSENT — le défaut mesuré en production', () => {
    const found = search();
    expect(found.map((d) => d.id)).toContain('meeshy');
  });

  it('rend un compte actif dont `blockedUserIds` est un tableau VIDE', () => {
    expect(search().map((d) => d.id)).toContain('ami');
  });

  it("n'est toujours PAS rendu : un compte qui a BLOQUÉ le lecteur", () => {
    expect(search().map((d) => d.id)).not.toContain('bloqueur');
  });

  it("n'est toujours PAS rendu : un compte que le lecteur a BLOQUÉ", () => {
    expect(search([BLOQUE_PAR_VIEWER.id as string]).map((d) => d.id)).not.toContain('bloque-par-viewer');
  });

  it('rend exactement les deux comptes non bloqués, dans les deux sens, quand aucun blocage ne joue', () => {
    expect(search([BLOQUE_PAR_VIEWER.id as string]).map((d) => d.id).sort()).toEqual(['ami', 'meeshy']);
  });
});
