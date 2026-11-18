/**
 * La réaction posée au nom d'un AGENT exige une participation VIVANTE (#19525).
 *
 * `MeeshySocketIOManager.handleAgentReaction` épelait `isActive: true` NU —
 * seul site divergent d'un fichier qui importe DÉJÀ `PARTICIPATION_VIVANTE` et
 * s'en sert deux mille cinq cents lignes plus haut. Il n'avait **aucun** témoin :
 * mesuré, la mutation « revenir au filtre nu » restait VERTE sur la suite entière
 * du manager, si bien que le correctif pouvait être défait en silence.
 *
 * ─── Pourquoi un fichier à part, et non le harnais du manager ─────────────
 *
 * `MeeshySocketIOManager.test.ts` est le harnais canonique (« toute garde de
 * comportement du manager y va ») — et il est **hors budget de taille**, à
 * 8 158 lignes. Le cliquet `gateway-test-file-size-budget` interdit d'y ajouter
 * une ligne tant qu'on n'en a pas extrait : c'est la règle « ajouter à un
 * fichier déjà hors budget est interdit ; on extrait d'abord, on ajoute
 * ensuite ». Les deux témoins vivent donc ici, et ils construisent un **VRAI**
 * manager — jamais une copie de sa méthode, ce que le dépôt interdit
 * explicitement (§ CLAUDE.md, « ne JAMAIS ré-implémenter le corps d'une méthode
 * de production dans un helper de test »).
 *
 * ─── DEUX témoins, et aucun ne subsume l'autre ────────────────────────────
 *
 * La PROJECTION voit un `where` que personne n'honore en test ; le COMPORTEMENT
 * voit ce que le handler FAIT du verdict. Un mock Prisma rend ce qu'on lui dit
 * quel que soit le `where`, donc le second seul passerait au vert sur une porte
 * aveugle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

// Le serveur Socket.IO est le seul collaborateur que le constructeur touche :
// le manager en construit un sur le serveur HTTP qu'on lui passe.
jest.mock('socket.io', () => {
  const emit = jest.fn();
  const chain: Record<string, unknown> = { emit };
  chain.to = jest.fn().mockReturnValue(chain);
  chain.except = jest.fn().mockReturnValue(chain);
  return {
    Server: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnValue(chain),
      in: jest.fn().mockReturnValue({ fetchSockets: async () => [] }),
      close: jest.fn().mockResolvedValue(undefined),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
      use: jest.fn(),
    })),
  };
});

jest.mock('../../utils/logger-enhanced', () => {
  // `enhancedLogger` est appelé DIRECTEMENT par ses consommateurs (le
  // disjoncteur) autant que par `child()` : un double qui n'expose que `child`
  // fait tomber la construction sur `info is not a function`.
  const logger: Record<string, unknown> = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  logger.child = () => logger;
  return { enhancedLogger: logger, default: logger };
});

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { findFirstIn } from '../../__tests__/helpers/mongo-where';

const CONV_ID = '507f191e810c19729de860fb';
const AGENT_USER_ID = 'agent-user-1';
const MESSAGE_ID = '507f191e810c19729de860fc';

type MembershipRow = {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly isActive: boolean;
  /** `undefined` = colonne ABSENTE, l'état de tout participant jamais banni. */
  readonly bannedAt?: Date | null;
};

/**
 * Le double REFUSE ce que le vrai client refuse, et il le fait par la
 * sémantique PARTAGÉE du dépôt — `matchesMongoWhere` via `findFirstIn`
 * (`__tests__/helpers/mongo-where.ts`), qui connaît `isSet` et traite une clé
 * ABSENTE comme absente, jamais comme nulle.
 *
 * Une première rédaction de ce fichier interprétait le `where` À LA MAIN. C'est
 * la jumelle divergente que ce dépôt proscrit — et elle était d'autant plus
 * inutile que le helper existait : « la sémantique du `where` elle-même reste
 * chez `matchesMongoWhere` : une seconde jumelle de cette règle serait libre de
 * diverger de la première ». Relevé par l'audit adversarial du lot.
 */
const strictFindFirst = (row: MembershipRow) => jest.fn<any>(findFirstIn([row as Record<string, unknown>]));

const makePrisma = (findFirst: jest.Mock<any>) =>
  ({
    participant: { findFirst, findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findUnique: jest.fn<any>().mockResolvedValue({ senderId: 'author-1' }) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID }) },
  }) as any;

const callAgentReaction = async (findFirst: jest.Mock<any>) => {
  const prisma = makePrisma(findFirst);
  const manager = new MeeshySocketIOManager({} as any, prisma, { on: jest.fn() } as any);
  await manager.handleAgentReaction({
    type: 'agent:reaction',
    conversationId: CONV_ID,
    asUserId: AGENT_USER_ID,
    targetMessageId: MESSAGE_ID,
    emoji: '👍',
  });
  return prisma;
};

describe("la réaction d'un agent n'ouvre qu'à une participation VIVANTE (#19525)", () => {
  it('la PROJECTION — le `where` porte la loi, jamais une copie de son contenu', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue({ id: 'part-agent' });

    await callAgentReaction(findFirst);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: AGENT_USER_ID, conversationId: CONV_ID, ...PARTICIPATION_VIVANTE },
      }),
    );
  });

  it("le COMPORTEMENT — une ligne ACTIVE et BANNIE n'est pas résolue, et rien ne se lit après elle", async () => {
    const findFirst = strictFindFirst({
      id: 'part-agent',
      userId: AGENT_USER_ID,
      conversationId: CONV_ID,
      isActive: true,
      bannedAt: new Date('2026-11-01T00:00:00.000Z'),
    });

    const prisma = await callAgentReaction(findFirst);

    expect(findFirst).toHaveBeenCalled();
    // La porte a refusé : la relecture du message visé — l'instruction qui SUIT
    // immédiatement la résolution — n'a jamais eu lieu.
    //
    // C'est un PROXY, et il faut le dire : ce témoin ne tombe que parce que
    // `ReactionService.addReaction` lit `message.findUnique` en PREMIER
    // (`ReactionService.ts:110`). Le jour où cette première lecture change, il
    // passera au vert sur le défaut. Le témoin de PROJECTION ci-dessus, lui, ne
    // dépend d'aucun ordre d'exécution — c'est lui qui porte la garantie, et
    // c'est pourquoi les deux cohabitent. Relevé par l'audit adversarial du lot.
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });

  /**
   * L'AUTRE moitié de la loi : sans ce témoin, une loi amputée de `isActive`
   * laissait cette suite verte (mesuré par l'audit adversarial du lot). La forme
   * de la loi est ancrée par `fileReaderAdmission.test.ts` ; celui-ci ancre ses
   * deux moitiés à la porte de l'agent.
   */
  it("refuse un agent dont la participation est SORTIE (`isActive: false`)", async () => {
    const findFirst = strictFindFirst({
      id: 'part-agent',
      userId: AGENT_USER_ID,
      conversationId: CONV_ID,
      isActive: false,
    });

    const prisma = await callAgentReaction(findFirst);

    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });

  /**
   * La non-régression, et elle compte autant : `bannedAt` est ABSENT du document
   * de tout participant jamais banni, et un `bannedAt: null` NU aurait fermé la
   * porte à toute la population (`utils/prisma-unset.ts`).
   */
  it("laisse agir l'agent dont la participation n'a jamais été bannie", async () => {
    const findFirst = strictFindFirst({
      id: 'part-agent',
      userId: AGENT_USER_ID,
      conversationId: CONV_ID,
      isActive: true,
    });

    const prisma = await callAgentReaction(findFirst);

    expect(prisma.message.findUnique).toHaveBeenCalled();
  });
});
