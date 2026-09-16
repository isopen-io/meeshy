/**
 * `contactLookupScope` + `getBlockRelatedUserIds` — un compte actif sans
 * `blockedUserIds` (jamais bloqué personne) doit rester CHERCHABLE (#6452),
 * et la direction « qui m'a bloqué » passe désormais par une requête
 * POSITIVE indexée (`getBlockRelatedUserIds`, `@@index([blockedUserIds])`),
 * jamais par un filtre de tableau NIÉ que le client Prisma généré refuse sur
 * cette liste scalaire REQUISE (#6811).
 *
 * Ce témoin rejoue la requête `{ blockedUserIds: { has } }` de
 * `getBlockRelatedUserIds` contre le double qui honore la sémantique MongoDB
 * « absent ne contient rien » (`mongo-where.ts`), PUIS rejoue le `where` de
 * `contactLookupScope` construit à partir de ce résultat — la même chaîne que
 * les trois portes REST (`GET /directory/people`,
 * `GET /users/email/:email`, `GET /users/phone/:phone`).
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

/** Bloqué PAR le viewer — sa propre colonne n'a rien à voir avec la garde. */
const BLOQUE_PAR_VIEWER: MongoDocument = { id: 'bloque-par-viewer', isActive: true, blockedUserIds: [] };

const ANNUAIRE = [MEESHY, AMI, BLOQUEUR, BLOQUE_PAR_VIEWER];

/**
 * Rejoue exactement la requête POSITIVE de `getBlockRelatedUserIds`
 * (`utils/blocking.ts`) contre le double — « qui a `viewerId` dans son
 * `blockedUserIds` ? ». Un champ ABSENT n'y « contient » jamais rien : pas de
 * piège absent/null à ce niveau, contrairement à l'ancien `NOT: { has } }`.
 */
function whoBlocked(viewerId: string): string[] {
  return ANNUAIRE
    .filter((doc) => matchesMongoWhere(doc, { blockedUserIds: { has: viewerId } }))
    .map((doc) => doc.id as string);
}

function search(viewerBlocked: readonly string[] = []): MongoDocument[] {
  const excludedUserIds = [...whoBlocked(VIEWER), ...viewerBlocked];
  const where = contactLookupScope({ excludedUserIds });
  return ANNUAIRE.filter((doc) => matchesMongoWhere(doc, where));
}

describe('contactLookupScope + getBlockRelatedUserIds — absent vs null sur blockedUserIds (#6452, #6811)', () => {
  it('rend un compte actif dont `blockedUserIds` est ABSENT — le défaut mesuré en production (#6452)', () => {
    expect(search().map((d) => d.id)).toContain('meeshy');
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

  it("ne construit plus aucun filtre sur `blockedUserIds` — c'est ce que le client Prisma généré refusait (#6811)", () => {
    const where = contactLookupScope({ excludedUserIds: [] });
    expect(JSON.stringify(where)).not.toContain('blockedUserIds');
  });
});
