/**
 * `activityWindow` — le `where` du régime « inactifs » doit être ACCEPTÉ par le
 * client Prisma GÉNÉRÉ, et apparier les comptes sans activité ni dans la
 * fenêtre.
 *
 * `User.lastActiveAt` est REQUIS (`DateTime @default(now())`) : son filtre
 * généré (`DateTimeFilter`) ne déclare ni `null` ni `isSet` (leçon 622). Un
 * second membre `{ lastActiveAt: null }` — écrit pour « le compte qui n'a
 * jamais été actif » — fait donc refuser la requête ENTIÈRE par le validateur,
 * avant tout aller-retour : l'aperçu et l'envoi d'une diffusion « inactifs »
 * rendaient une erreur. Le stub de `moduleNameMapper` ne voit rien de ce refus ;
 * ce témoin charge le vrai client (même patron que
 * `contact-lookup-scope-prisma-accepts.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import path from 'path';
import { activityWindow, type BroadcastTargeting } from '../../../jobs/broadcast-recipients';

const CLIENT_GENERE = path.join(__dirname, '../../../../../../packages/shared/prisma/client');
const URL_MORTE = 'mongodb://127.0.0.1:1/guard-activity?serverSelectionTimeoutMS=50&connectTimeoutMS=50';

type ClientPrisma = {
  user: { count: (args: unknown) => Promise<unknown> };
  $disconnect: () => Promise<void>;
};

async function refusDuValidateur(where: unknown): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require(CLIENT_GENERE) as { PrismaClient: new (o: unknown) => ClientPrisma };
  const prisma = new PrismaClient({ datasources: { db: { url: URL_MORTE } } });
  try {
    await prisma.user.count({ where });
    return null;
  } catch (erreur) {
    return (erreur as Error).constructor.name === 'PrismaClientValidationError' ? (erreur as Error).message : null;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const NOW = new Date('2026-10-05T00:00:00Z');

describe('activityWindow — le client Prisma généré accepte chaque régime', () => {
  it.each([
    ['null', { lastActiveAt: null }],
    ['isSet', { lastActiveAt: { isSet: false } }],
  ])('le témoin SAIT rougir : `%s` sur le champ requis est refusé', async (_nom, where) => {
    expect(await refusDuValidateur(where)).toMatch(/lastActiveAt/);
  }, 15000);

  it.each<BroadcastTargeting['activityStatus']>(['active', 'inactive', 'new', 'all'])(
    'régime %p accepté',
    async (activityStatus) => {
      expect(await refusDuValidateur(activityWindow({ activityStatus, inactiveDays: 45 }, NOW))).toBeNull();
    },
    15000,
  );

  it('régime « inactifs » : aucune activité depuis la fenêtre', () => {
    expect(activityWindow({ activityStatus: 'inactive', inactiveDays: 45 }, NOW)).toEqual({
      lastActiveAt: { lt: new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000) },
    });
  });
});
