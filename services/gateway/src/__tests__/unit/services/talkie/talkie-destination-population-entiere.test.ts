/**
 * LA DESTINATION DE LA COPIE VOCALE D'UN TALKIE NE S'AMPUTE PLUS DE SA
 * POPULATION (#19905).
 *
 * `mostRecentSharedConversation` bornait ses candidates par DEUX clauses qui,
 * sous MongoDB, exigent toutes deux la clé PRÉSENTE :
 *
 *   deletedAt: null                  une ÉGALITÉ — elle n'apparie pas la clé ABSENTE
 *   NOT: SERVER_BLIND_REGIME_FILTER  une NÉGATION — même exigence (#8309)
 *
 * Or **aucun chemin de création n'écrit `Conversation.deletedAt`** : son unique
 * écrivain du dépôt est `obsoleteConversation.ts`, qui pose une DATE (jamais
 * `null`) au moment de la mise au rebut. Une conversation VIVANTE n'a donc pas
 * la clé, et la première clause écartait **la population entière** — ce n'est
 * pas un cas limite, c'est tout le monde. L'émetteur enregistrait sa voix pour
 * rien, en silence : `null` rendu, aucune copie proposée, aucune erreur.
 *
 * ─── Pourquoi la SECONDE clause partait avec la première ────────────────────
 *
 * `SERVER_BLIND_REGIME_FILTER` est écrit pour être lu POSITIVEMENT — son
 * doc-comment le dit (« sans négation de document : un champ absent n'y entre
 * jamais »). Ce site était le SEUL du dépôt à le NIER, et une négation réveille
 * exactement le piège que sa forme positive avait fermé. Son complément existe,
 * déclaré comme tel dans le même fichier : `SERVER_READABLE_REGIME_FILTER`, qui
 * dit l'absence dans une branche (`isSet: false`). Les deux filtres sont des
 * complements EXACTS — `NOT BLIND ≡ READABLE` — donc la substitution ne change
 * rien à ce qui est retenu, et retire la dépendance à la sémantique du `NOT`.
 *
 * **C'est strictement mieux que de la mesurer** : une forme positive n'a pas de
 * sémantique de négation à connaître.
 *
 * ─── Ce que ces témoins exigent du double ──────────────────────────────────
 *
 * Les documents VIVANTS d'ici n'ont **ni la clé `deletedAt` ni la clé
 * `encryptionMode`** — la forme que les treize chemins de création produisent.
 * Un double qui lit `row.deletedAt === null` pour une clé absente les rendrait
 * tous verts ; `matchesMongoWhere` sépare l'absence du nul, et c'est la seule
 * raison pour laquelle ils peuvent tomber. Les témoins de #19835
 * (`surfaces-la-plus-recemment-active.test.ts`) posaient `deletedAt: null` et
 * `encryptionMode: null` EXPLICITEMENT dans leurs fixtures : ils ne pouvaient
 * pas voir ce défaut — c'est la forme de la leçon 318, où la fixture de l'un
 * portait `leftAt: null` à la main.
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
    expect(branches).toContain('encryptionMode');
  });
});
