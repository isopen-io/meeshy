/**
 * Le RETRAIT d'un message, sa garde OPTIMISTE et son verdict de course
 * (#17079).
 *
 * Ces témoins portent la règle au site qui l'énonce ; les deux transports ont
 * les leurs, et un balayage garde qu'ils passent bien par ici — un témoin posé
 * sur un seul transport ne peut pas voir que l'autre écrit en direct.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { softDeleteMessage } from '../softDeleteMessage';

const MSG_ID = '507f1f77bcf86cd799439044';
const NOW = new Date('2026-11-08T19:00:00.000Z');

const missingRecord = () => {
  const error: Error & { code?: string } = new Error(
    'An operation failed because it depends on one or more records that were required but not found.',
  );
  error.code = 'P2025';
  return error;
};

describe('softDeleteMessage (#17079)', () => {
  it('écrit sous la garde optimiste, et vide les traductions dans la MÊME écriture', async () => {
    const update = jest.fn<any>().mockResolvedValue({});
    const outcome = await softDeleteMessage({ message: { update } } as never, MSG_ID, NOW);

    expect(outcome).toBe('deleted');
    expect(update).toHaveBeenCalledWith({
      where: { id: MSG_ID, deletedAt: null },
      data: { translations: null, deletedAt: NOW },
    });
  });

  it('un perdant de course rend `already-deleted` au lieu de lever', async () => {
    const update = jest.fn<any>().mockRejectedValue(missingRecord());

    await expect(softDeleteMessage({ message: { update } } as never, MSG_ID, NOW))
      .resolves.toBe('already-deleted');
  });

  // Le discriminant, et c'est lui qui compte : confondre une base en défaut
  // avec une course perdue ferait disparaître un retrait réellement ÉCHOUÉ
  // sous un « quelqu'un d'autre l'a fait », et l'appelant répondrait
  // « introuvable » pour un message toujours là.
  it('toute AUTRE erreur est relevée — une base en défaut n’est pas une course perdue', async () => {
    const update = jest.fn<any>().mockRejectedValue(new Error('connection reset'));

    await expect(softDeleteMessage({ message: { update } } as never, MSG_ID, NOW))
      .rejects.toThrow('connection reset');
  });

  it('une erreur au code VOISIN n’est pas une course perdue non plus', async () => {
    const conflict: Error & { code?: string } = new Error('unique constraint');
    conflict.code = 'P2002';
    const update = jest.fn<any>().mockRejectedValue(conflict);

    await expect(softDeleteMessage({ message: { update } } as never, MSG_ID, NOW)).rejects.toThrow('unique constraint');
  });
});

/**
 * Le CLIQUET : les DEUX transports de suppression passent par le site unique.
 *
 * L'audit ne nommait que la route REST. Le transport socket — celui que deux
 * doc-comments du dépôt appellent « primaire » — portait le même trou, et un
 * témoin écrit sur un seul des deux n'aurait rien dit de l'autre. C'est la
 * forme du cycle 147 : une règle retapée à chaque transport est une règle
 * qu'un transport finira par ne pas avoir.
 */
describe('les deux transports de suppression passent par le site unique', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const SRC = join(__dirname, '..', '..', '..');

  const TRANSPORTS = [
    'routes/conversations/messages-advanced-delete.ts',
    'socketio/handlers/MessageHandler.ts',
  ] as const;

  it('chacun appelle `softDeleteMessage`', () => {
    const silent = TRANSPORTS.filter((file) => !readFileSync(join(SRC, file), 'utf8').includes('softDeleteMessage('));
    expect(silent).toEqual([]);
  });

  it('aucun n’écrit plus `deletedAt` en direct — c’est l’écriture qui portait le trou', () => {
    const direct = TRANSPORTS.filter((file) =>
      readFileSync(join(SRC, file), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('//') && !line.startsWith('*'))
        .some((line) => /deletedAt:\s*(new Date\(\)|now)\b/.test(line)));

    expect(direct).toEqual([]);
  });
});
