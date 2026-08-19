/**
 * `resolveUsernames` — qui est référençable.
 *
 * Règle unique, appliquée à l'écriture comme à la lecture : `deletedAt` exclut,
 * `isActive` n'exclut pas. Un compte supprimé n'est pas référençable ; un compte
 * simplement inactif l'est — c'est déjà le choix de l'autocomplete, et quelqu'un
 * qui apparaît dans le sélecteur doit pouvoir être nommé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MentionService } from '../../../services/MentionService';

describe('MentionService.resolveUsernames', () => {
  it('exclut les comptes supprimés, sans exclure les comptes inactifs', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([]);
    const service = new MentionService({ user: { findMany } } as never);

    await service.resolveUsernames(['alice']);

    const where = findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ isSet: false });
    expect(where.isActive).toBeUndefined();
  });
});
