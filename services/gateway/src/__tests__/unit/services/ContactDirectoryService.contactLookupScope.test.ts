/**
 * `contactLookupScope()` — un compte actif SANS `blockedUserIds` doit rester
 * trouvable (#6452).
 *
 * Sur le connecteur MongoDB, Prisma enveloppe `{ has }` d'un test d'existence
 * implicite : `NOT: { blockedUserIds: { has: viewerId } }`, posé nu, écarte
 * aussi les documents où le champ n'existe PAS du tout — pas seulement ceux
 * qui bloquent effectivement le lecteur. Mesuré en staging (issue) : 206
 * comptes actifs sur 246 étaient ainsi exclus de `GET /directory/people`,
 * dont le compte système `meeshy`.
 *
 * Un test qui se contente d'inspecter la FORME du `where` (comme
 * `directory-people.test.ts` et `profile-email-phone-scope-caveat.test.ts` le
 * font pour d'autres garanties) ne peut pas voir ce défaut : la forme
 * `NOT: { blockedUserIds: { has } }` a l'air juste, elle EST juste pour un
 * champ posé — le défaut n'existe qu'à l'ÉVALUATION contre un document réel.
 * Ce fichier fait donc évaluer le `where` produit contre de vrais documents,
 * par la sémantique Mongo/Prisma mesurée (`__tests__/helpers/mongo-where.ts`),
 * exactement ce que l'issue demande : « un faux Prisma accepte toute forme ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { contactLookupScope } from '../../../services/ContactDirectoryService';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const VIEWER = '507f1f77bcf86cd799439011';
const MEESHY_SYSTEM_ACCOUNT = '507f1f77bcf86cd799439099';
const BLOCKS_THE_VIEWER = '507f1f77bcf86cd799439022';
const BLOCKED_BY_THE_VIEWER = '507f1f77bcf86cd799439033';
const NEITHER_BLOCKS_NOR_BLOCKED = '507f1f77bcf86cd799439044';

function account(id: string, overrides: MongoDocument = {}): MongoDocument {
  return { id, isActive: true, ...overrides };
}

describe('contactLookupScope — un champ blockedUserIds ABSENT ne bloque personne', () => {
  it('rend un compte actif dont le document ne porte pas `blockedUserIds` (le cas mesuré : le compte système)', () => {
    const scope = contactLookupScope({ viewerId: VIEWER, blockedByViewer: [] });
    const row = account(MEESHY_SYSTEM_ACCOUNT); // pas de clé `blockedUserIds` du tout

    expect(matchesMongoWhere(row, scope)).toBe(true);
  });

  it('écarte toujours un compte qui a explicitement bloqué le lecteur', () => {
    const scope = contactLookupScope({ viewerId: VIEWER, blockedByViewer: [] });
    const row = account(BLOCKS_THE_VIEWER, { blockedUserIds: [VIEWER] });

    expect(matchesMongoWhere(row, scope)).toBe(false);
  });

  it('écarte toujours un compte que le lecteur a bloqué', () => {
    const scope = contactLookupScope({ viewerId: VIEWER, blockedByViewer: [BLOCKED_BY_THE_VIEWER] });
    const row = account(BLOCKED_BY_THE_VIEWER, { blockedUserIds: [] });

    expect(matchesMongoWhere(row, scope)).toBe(false);
  });

  it('rend un compte dont le champ est posé mais ne contient ni le lecteur ni sa cible', () => {
    const scope = contactLookupScope({ viewerId: VIEWER, blockedByViewer: [] });
    const row = account(NEITHER_BLOCKS_NOR_BLOCKED, { blockedUserIds: ['507f1f77bcf86cd799439055'] });

    expect(matchesMongoWhere(row, scope)).toBe(true);
  });

  it('écarte un compte inactif même sans `blockedUserIds`', () => {
    const scope = contactLookupScope({ viewerId: VIEWER, blockedByViewer: [] });
    const row = account(MEESHY_SYSTEM_ACCOUNT, { isActive: false });

    expect(matchesMongoWhere(row, scope)).toBe(false);
  });

  it('écarte un compte supprimé (deletedAt posé) même sans `blockedUserIds`', () => {
    const scope = contactLookupScope({ viewerId: VIEWER, blockedByViewer: [] });
    const row = account(MEESHY_SYSTEM_ACCOUNT, { deletedAt: new Date('2026-01-01T00:00:00Z') });

    expect(matchesMongoWhere(row, scope)).toBe(false);
  });
});
