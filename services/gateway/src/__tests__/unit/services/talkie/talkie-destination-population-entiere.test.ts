/**
 * CE QUE LA DESTINATION D'UNE COPIE VOCALE DOIT RETENIR, GARDÉ DU DEHORS.
 *
 * **L'implémentation que ces témoins gardent n'est pas celle de ce lot.** Elle est
 * arrivée par #19910 (PR #19932), fusionnée dans `dev` pendant que cette branche
 * attendait sa CI, et elle est plus complète que ce que la branche portait : au
 * `unsetOrNull('deletedAt')`, au régime dit en POSITIF et au `unsetOrNull('communityId')`
 * qu'ils exercent ci-dessous, elle ajoute l'état terminal (`closedAt`), la hiérarchie
 * d'écriture avec la dispense du tête-à-tête, et le `deletedForMe` de l'émetteur.
 * Ces témoins-ci passent contre elle sans modification, et c'est leur intérêt :
 * **ils n'ont été écrits contre aucune de ces deux implémentations en particulier**,
 * seulement contre ce que la fonction doit RETENIR.
 *
 * Ce qu'ils exercent, et pourquoi chacun pouvait tomber :
 *
 * - **La POPULATION.** `{ deletedAt: null }` est une ÉGALITÉ sous MongoDB : elle exige
 *   la clé PRÉSENTE. Or l'unique écrivain de `Conversation.deletedAt` du dépôt
 *   (`obsoleteConversation.ts`) pose une DATE à la mise au rebut, jamais `null` : une
 *   conversation VIVANTE n'a pas la clé, et la clause les écartait TOUTES. Ce n'était
 *   pas un cas limite — l'émetteur enregistrait sa voix pour rien, sans erreur ni trace.
 * - **Le RÉGIME dit en POSITIF.** `NOT: SERVER_BLIND_REGIME_FILTER` portait la même
 *   exigence par un autre chemin : toute négation exige la clé présente (#8309), donc
 *   une conversation sans `encryptionMode` en sortait aussi. Les deux formes s'accordent
 *   sur la VALEUR du mode et divergent sur la clé ABSENTE — c'est-à-dire sur la
 *   population.
 * - **La COMMUNAUTÉ.** Le doc-comment de la fonction promet depuis #17141 qu'« une copie
 *   n'atterrit ni dans une communauté, ni dans une conversation chiffrée ». La seconde
 *   moitié était tenue par le filtre de régime ; la première ne l'était par RIEN. Un
 *   salon de communauté est une `Conversation` de type `group` portant un `communityId`,
 *   dont les membres sont des participants actifs : deux membres d'une même communauté
 *   le PARTAGENT au sens de cette fonction. Et les clients ne rejouent pas leur loi sur
 *   une destination NOMMÉE — le web court-circuite `mayCarryTheCopy`, iOS ne contrôle
 *   rien : le vocal privé d'Alice à Bob serait publié dans le salon.
 *
 * ─── Ce que ces témoins exigent du double ──────────────────────────────────
 *
 * Les documents VIVANTS d'ici n'ont **ni la clé `deletedAt` ni la clé `encryptionMode`**
 * — la forme que les treize chemins de création produisent. Un double qui lit
 * `row.deletedAt === null` pour une clé absente les rendrait tous verts ;
 * `matchesMongoWhere` sépare l'absence du nul, et c'est la seule raison pour laquelle
 * ils peuvent tomber. Les témoins de #19835 (`surfaces-la-plus-recemment-active.test.ts`)
 * posaient `deletedAt: null` et `encryptionMode: null` EXPLICITEMENT dans leurs fixtures :
 * ils ne pouvaient pas voir ce défaut — connaître le piège avait servi à faire PASSER
 * les témoins, pas à les faire tomber (leçon 318).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { findConversationsIn, type DirectDoc } from '../../../helpers/direct-pair-world';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ME = '507f1f77bcf86cd799439001';
const PEER = '507f1f77bcf86cd799439002';
const VIVANTE = '507f1f77bcf86cd7994390a1';
const AUTRE = '507f1f77bcf86cd7994390b2';

const EARLY = new Date('2026-11-01T10:00:00Z');
const LATE = new Date('2026-11-18T10:00:00Z');

/**
 * La forme RÉELLE d'une conversation vivante : ni `deletedAt`, ni
 * `encryptionMode`. Les champs se posent par `fields` quand le témoin veut
 * parler d'un document qui les PORTE.
 */
const vivante = (id: string, fields: Record<string, unknown> = {}): DirectDoc => ({
  id,
  type: 'direct',
  isActive: true,
  lastMessageAt: EARLY,
  participants: [ME, PEER].map((userId) => ({ userId, isActive: true })),
  ...fields,
});

const world = (docs: readonly DirectDoc[]) => {
  const conversations = findConversationsIn(docs);
  return {
    participant: {
      findMany: jest.fn(async (args: { where: { userId: string } }) =>
        docs
          .filter((doc) => doc.participants.some((p) => p.userId === args.where.userId && p.isActive))
          .map((doc) => ({ conversationId: doc.id }))
      ),
    },
    conversation: { findFirst: jest.fn(async (args: never) => conversations.findFirst(args)) },
  };
};

const destination = async (docs: readonly DirectDoc[]): Promise<string | null> => {
  const { mostRecentSharedConversation } = await import('../../../../services/talkie/talkieFallback');
  return mostRecentSharedConversation(world(docs) as never, ME, PEER);
};

describe('une conversation sans la clé `deletedAt` reste candidate (#19905)', () => {
  it('reçoit la copie vocale — c’est la forme de TOUTE conversation vivante, pas un cas limite', async () => {
    expect(await destination([vivante(VIVANTE)])).toBe(VIVANTE);
  });

  it('le rang la départage comme les autres : la REMONTÉE par une activité gagne', async () => {
    const chosen = await destination([
      vivante(VIVANTE, { lastActivityAt: LATE }),
      vivante(AUTRE, { lastMessageAt: new Date('2026-11-10T10:00:00Z') }),
    ]);
    expect(chosen).toBe(VIVANTE);
  });

  it('une conversation dont la clé est PRÉSENTE et nulle reste candidate elle aussi', async () => {
    expect(await destination([vivante(VIVANTE, { deletedAt: null })])).toBe(VIVANTE);
  });

  it('une conversation mise au rebut est toujours écartée — c’est ce que la clause VEUT dire', async () => {
    expect(await destination([vivante(VIVANTE, { deletedAt: LATE })])).toBeNull();
  });
});

describe('la copie n’atterrit pas dans une COMMUNAUTÉ (#19919, livré par #19910)', () => {
  /**
   * Le doc-comment du fichier le PROMET depuis #17141 — « une copie n'atterrit ni
   * dans une communauté, ni dans une conversation chiffrée » — et la moitié
   * « communauté » n'était tenue par RIEN. Elle était INERTE tant que la fonction
   * rendait `null` pour tout le monde : réparer la population l'arme.
   *
   * Un salon de communauté est une `Conversation` de type `group` portant un
   * `communityId` (`routes/conversations/core-lifecycle.ts` : `type` libre,
   * `communityId: communityId || null`), et ses membres y ont des lignes
   * `Participant` actives (`admitSalonOccupants`). Deux membres d'une même
   * communauté le PARTAGENT donc, au sens de cette fonction.
   *
   * Ce que ça coûtait : les trois clients ne rejouent PAS leur propre loi quand le
   * serveur NOMME une conversation — le web court-circuite `mayCarryTheCopy`
   * (`talkie-voice-copy.ts`), iOS ne contrôle même rien (`TalkieVoiceCopy.swift`).
   * Le message vocal privé d'Alice à Bob serait publié dans le salon, lisible par
   * TOUS les membres de la communauté.
   */
  it('un salon de communauté n’est jamais la destination, même au plus haut rang', async () => {
    const chosen = await destination([
      vivante(AUTRE, { type: 'group', communityId: '507f1f77bcf86cd7994390f1', lastActivityAt: LATE }),
      vivante(VIVANTE, { lastMessageAt: EARLY }),
    ]);
    expect(chosen).toBe(VIVANTE);
  });

  it('seul un salon partagé ⇒ aucune destination, et le client ouvrira le direct', async () => {
    const chosen = await destination([
      vivante(AUTRE, { type: 'group', communityId: '507f1f77bcf86cd7994390f1', lastActivityAt: LATE }),
    ]);
    expect(chosen).toBeNull();
  });

  it('`communityId` à null, et la clé ABSENTE, restent toutes deux candidates', async () => {
    expect(await destination([vivante(VIVANTE, { communityId: null })])).toBe(VIVANTE);
    expect(await destination([vivante(VIVANTE)])).toBe(VIVANTE);
  });
});

describe('le régime se lit POSITIVEMENT, et le chiffré reste exclu (#19905)', () => {
  it('une conversation sans la clé `encryptionMode` est servable : le serveur la lit', async () => {
    expect(await destination([vivante(VIVANTE)])).toBe(VIVANTE);
  });

  it('`server` et `hybrid` restent servables — le serveur lit leur clair', async () => {
    expect(await destination([vivante(VIVANTE, { encryptionMode: 'server' })])).toBe(VIVANTE);
    expect(await destination([vivante(VIVANTE, { encryptionMode: 'hybrid' })])).toBe(VIVANTE);
  });

  it('une conversation `e2ee` n’est JAMAIS une destination, quelle que soit sa casse', async () => {
    expect(await destination([vivante(VIVANTE, { encryptionMode: 'e2ee' })])).toBeNull();
    expect(await destination([vivante(VIVANTE, { encryptionMode: 'E2EE' })])).toBeNull();
  });

  it('un mode INCONNU est traité comme chiffré — fail-closed, comme le filtre canonique', async () => {
    expect(await destination([vivante(VIVANTE, { encryptionMode: 'quelque-chose-de-neuf' })])).toBeNull();
  });

  it('entre une `e2ee` de plus haut rang et une lisible, la lisible reçoit la copie', async () => {
    const chosen = await destination([
      vivante(AUTRE, { encryptionMode: 'e2ee', lastActivityAt: LATE }),
      vivante(VIVANTE, { lastMessageAt: EARLY }),
    ]);
    expect(chosen).toBe(VIVANTE);
  });
});

describe('les deux clauses se composent sans s’écraser (#19905)', () => {
  it('chaque prédicat rend une clé `OR` : le `where` les porte sous `AND`, jamais en frères', async () => {
    const { mostRecentSharedConversation } = await import('../../../../services/talkie/talkieFallback');
    const prisma = world([vivante(VIVANTE)]);
    await mostRecentSharedConversation(prisma as never, ME, PEER);
    const where = (prisma.conversation.findFirst.mock.calls[0][0] as unknown as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty('deletedAt');
    expect(where).not.toHaveProperty('NOT');
    expect(where).not.toHaveProperty('OR');
    const branches = JSON.stringify(where.AND);
    expect(branches).toContain('isSet');
    expect(branches).toContain('deletedAt');
    expect(branches).toContain('communityId');
    expect(branches).toContain('encryptionMode');
  });
});
