/**
 * #6501 — l'auto-réparation à la LECTURE : si, et seulement si, Prisma rejette
 * une lecture parce qu'un expéditeur manque, la conversation est réparée et la
 * lecture rejouée UNE fois.
 *
 * La réparation elle-même a son témoin exhaustif
 * (`repairOrphanedMessageSenders.test.ts`) ; ce fichier garde la FRONTIÈRE :
 * quelle erreur déclenche, quelle portée est réparée, combien de rejeux.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../services/messaging/repairOrphanedMessageSenders', () => ({
  repairOrphanedMessageSenders: jest.fn<any>(),
}));

import {
  isOrphanedSenderError,
  withOrphanedSenderRepair,
} from '../../../../services/messaging/withOrphanedSenderRepair';
import { repairOrphanedMessageSenders } from '../../../../services/messaging/repairOrphanedMessageSenders';
import { orphanedSenderPrismaError } from '../../../helpers/orphaned-sender-db';

const repair = repairOrphanedMessageSenders as unknown as jest.Mock<any>;
const NOTHING_REPAIRED = { deletedNotices: 0, tombstoned: 0, reassignedMessages: 0, failures: 0 };

const scope = () => ({ prisma: { tag: 'prisma' } as never, conversationIds: ['aaaaaaaaaaaaaaaaaaaaaaa1'] });

describe('isOrphanedSenderError', () => {
  it("reconnaît l'erreur exacte de Prisma, préfixe d'invocation compris", () => {
    expect(isOrphanedSenderError(orphanedSenderPrismaError())).toBe(true);
  });

  it("ne reconnaît pas la jumelle d'une AUTRE relation requise", () => {
    const conversationManquante = new Error(
      'Inconsistent query result: Field conversation is required to return data, got `null` instead.'
    );

    expect(isOrphanedSenderError(conversationManquante)).toBe(false);
  });

  it('ne reconnaît ni une erreur étrangère, ni une valeur qui n’est pas une erreur', () => {
    expect(isOrphanedSenderError(new Error('connection reset'))).toBe(false);
    expect(isOrphanedSenderError('Field sender is required to return data, got `null` instead.')).toBe(false);
    expect(isOrphanedSenderError(undefined)).toBe(false);
  });
});

describe('withOrphanedSenderRepair', () => {
  it('une lecture qui réussit ne déclenche aucune réparation', async () => {
    repair.mockReset();
    const read = jest.fn<any>().mockResolvedValue('page');

    await expect(withOrphanedSenderRepair(scope(), read)).resolves.toBe('page');
    expect(read).toHaveBeenCalledTimes(1);
    expect(repair).not.toHaveBeenCalled();
  });

  it('répare la portée de la lecture, puis la rejoue UNE fois', async () => {
    repair.mockReset().mockResolvedValue({ ...NOTHING_REPAIRED, tombstoned: 1 });
    const read = jest.fn<any>().mockRejectedValueOnce(orphanedSenderPrismaError()).mockResolvedValueOnce('page');
    const lecture = scope();

    await expect(withOrphanedSenderRepair(lecture, read)).resolves.toBe('page');
    expect(read).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith(lecture.prisma, { conversationIds: lecture.conversationIds });
  });

  it('relance TELLE QUELLE une erreur étrangère, sans réparer ni rejouer', async () => {
    repair.mockReset();
    const etrangere = new Error('connection reset');
    const read = jest.fn<any>().mockRejectedValue(etrangere);

    await expect(withOrphanedSenderRepair(scope(), read)).rejects.toBe(etrangere);
    expect(read).toHaveBeenCalledTimes(1);
    expect(repair).not.toHaveBeenCalled();
  });

  it('ne boucle pas : une lecture qui échoue encore après réparation remonte son erreur', async () => {
    repair.mockReset().mockResolvedValue(NOTHING_REPAIRED);
    const persistante = orphanedSenderPrismaError();
    const read = jest.fn<any>().mockRejectedValue(persistante);

    await expect(withOrphanedSenderRepair(scope(), read)).rejects.toBe(persistante);
    expect(read).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("une réparation qui échoue rend l'erreur d'ORIGINE, sans rejouer la lecture", async () => {
    const origine = orphanedSenderPrismaError();
    repair.mockReset().mockRejectedValue(new Error('aggregate refused'));
    const read = jest.fn<any>().mockRejectedValue(origine);

    await expect(withOrphanedSenderRepair(scope(), read)).rejects.toBe(origine);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
