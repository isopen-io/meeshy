/**
 * #14252 — la borne de l'entourage (`FANOUT_ROW_CAP`) ne compte que des comptes
 * VIVANTS : des liens supprimés ou désactivés, plus récents, ne prennent pas la
 * place d'un lien vivant au-delà de la borne. La lecture reste bornée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { CIRCLE_NOTIFY_KEYS } from '@meeshy/shared/utils/relation-levels';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { resolveEntourage, type EntourageDb } from '../fanout/entourage';
import { FANOUT_ROW_CAP } from '../fanout/row-cap';
import { AUTEUR, SANG, CO_MEMBRE, monde, type Link, type World } from '../../../__tests__/helpers/circle-world';

const KEY = CIRCLE_NOTIFY_KEYS[0];
const morts = (n: number): string[] => Array.from({ length: n }, (_, i) => `7${String(i).padStart(23, '0')}`);

const entourage = (world: World) => resolveEntourage(monde(world).prisma as unknown as EntourageDb, { ownerId: AUTEUR, key: KEY });

describe('la borne de l’entourage ne compte que des vivants (#14252)', () => {
  it('500 liens Sang plus récents, tous supprimés ⇒ le lien Sang vivant plus ancien est prévenu', async () => {
    const dead = morts(FANOUT_ROW_CAP);
    const links: Link[] = dead.map((id) => [AUTEUR, id, 'BLOOD']);
    const result = await entourage({ extraLinks: links, deleted: dead, settings: { [AUTEUR]: { [KEY]: 'BLOOD' } } });
    expect(result.ids).toEqual([SANG]);
  });

  it('500 liens désactivés ⇒ idem, et l’entourage n’est pas déclaré tronqué', async () => {
    const dead = morts(FANOUT_ROW_CAP);
    const result = await entourage({
      extraLinks: dead.map((id): Link => [AUTEUR, id, 'BLOOD']),
      inactive: dead,
      settings: { [AUTEUR]: { [KEY]: 'BLOOD' } },
    });
    expect(result).toEqual({ ids: [SANG], truncated: false });
  });

  it('au cran Public, 500 co-membres morts lus d’abord ⇒ le co-membre vivant est prévenu', async () => {
    const dead = morts(FANOUT_ROW_CAP);
    const result = await entourage({
      communities: { 'c-1': [AUTEUR, ...dead, CO_MEMBRE] },
      deleted: dead,
      settings: { [AUTEUR]: { [KEY]: 'PUBLIC' } },
    });
    expect(result.ids).toContain(CO_MEMBRE);
    expect(result.ids.filter((id) => dead.includes(id))).toEqual([]);
  });

  it('au-delà de la fenêtre de lecture (plus de 1 000 morts avant lui) ⇒ le vivant n’est pas lu, troncature déclarée', async () => {
    const dead = morts(2 * FANOUT_ROW_CAP + 1);
    const result = await entourage({
      extraLinks: dead.map((id): Link => [AUTEUR, id, 'BLOOD']),
      deleted: dead,
      settings: { [AUTEUR]: { [KEY]: 'BLOOD' } },
    });
    expect(result).toEqual({ ids: [], truncated: true });
  });

  it('un compte qui doit être vivant (acteur d’un relais) est mort ⇒ personne, sans troncature', async () => {
    const result = await resolveEntourage(monde({ deleted: [CO_MEMBRE] }).prisma as unknown as EntourageDb, {
      ownerId: AUTEUR,
      key: KEY,
      mustBeAlive: [CO_MEMBRE],
    });
    expect(result).toEqual({ ids: [], truncated: false });
  });

  it('plus de 500 vivants ⇒ toujours borné à 500 et déclaré tronqué', async () => {
    const vivants = morts(FANOUT_ROW_CAP + 10);
    const result = await entourage({
      extraLinks: vivants.map((id): Link => [AUTEUR, id, 'BLOOD']),
      settings: { [AUTEUR]: { [KEY]: 'BLOOD' } },
    });
    expect(result.ids).toHaveLength(FANOUT_ROW_CAP);
    expect(result.truncated).toBe(true);
  });
});
