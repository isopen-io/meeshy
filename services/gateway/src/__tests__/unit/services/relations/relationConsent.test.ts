/**
 * LE SITE UNIQUE du consentement de cercle (#14401, audit #14535 constat 2) :
 * `relationConsentOf` dit si `ownerId` partage `feature` à `otherId`, lu en base À
 * CHAQUE appel — jamais un cache. Un relais (écoute #13934, position #13937) le
 * consulte avant chaque émission : un retrait coupe l'émission suivante.
 *
 * La garde qui l'accompagne interdit toute autre lecture des quatre colonnes de
 * consentement dans la passerelle.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { relationConsentOf, RITUAL_CONSENT_FEATURES } from '../../../../services/relations/relationConsent';

const ME = '5f0000000000000000000001';
const OTHER = '5f0000000000000000000002';

function table(rows: Array<Record<string, unknown>>) {
  const reads: unknown[] = [];
  return {
    rows,
    reads,
    prisma: {
      relationFeatureSetting: {
        findUnique: async (args: { where: { ownerId_otherId: { ownerId: string; otherId: string } } }) => {
          reads.push(args);
          const { ownerId, otherId } = args.where.ownerId_otherId;
          return rows.find((row) => row.ownerId === ownerId && row.otherId === otherId) ?? null;
        },
      },
    },
  };
}

describe('relationConsentOf — ce que JE partage à l’autre, lu à chaque fois', () => {
  it('rend granted pour chaque partage consenti, refused sinon, et aucune ligne vaut refused', async () => {
    const db = table([{ ownerId: ME, otherId: OTHER, listeningTitleShared: true, locationShared: false, locationHistoryShared: true, proximityShared: false }]);
    const of = (feature: (typeof RITUAL_CONSENT_FEATURES)[number], ownerId = ME, otherId = OTHER) =>
      relationConsentOf(db.prisma as never, { ownerId, otherId, feature });

    expect(await of('listening.title')).toBe('granted');
    expect(await of('location.live')).toBe('refused');
    expect(await of('location.history')).toBe('granted');
    expect(await of('location.proximity')).toBe('refused');
    expect(await of('listening.title', OTHER, ME)).toBe('refused');
  });

  it('un retrait vaut à l’appel suivant : rien n’est gardé entre deux lectures', async () => {
    const row = { ownerId: ME, otherId: OTHER, listeningTitleShared: false, locationShared: true, locationHistoryShared: false, proximityShared: false };
    const db = table([row]);
    const params = { ownerId: ME, otherId: OTHER, feature: 'location.live' as const };

    expect(await relationConsentOf(db.prisma as never, params)).toBe('granted');
    row.locationShared = false;
    expect(await relationConsentOf(db.prisma as never, params)).toBe('refused');
    expect(db.reads).toHaveLength(2);
  });

  it('une valeur illisible vaut refused, jamais granted', async () => {
    const db = table([{ ownerId: ME, otherId: OTHER, locationShared: 'true' }]);
    expect(await relationConsentOf(db.prisma as never, { ownerId: ME, otherId: OTHER, feature: 'location.live' })).toBe('refused');
  });
});

const GATEWAY_SRC = join(__dirname, '../../../..');
const CONSENT_COLUMN = /\b(?:listeningCategoryShared|listeningTitleShared|locationShared|locationHistoryShared|proximityShared)\b/;

/** Les seuls fichiers qui nomment une colonne de consentement : le site unique, et ce qui l'écrit, le sert à son auteur ou l'exporte. */
const ALLOWED: readonly string[] = [
  'services/relations/relationConsent.ts',
  'services/relations/bloodRitual.ts',
  'routes/relations/settings.ts',
  'services/relations/ritualShareWithdrawal.ts',
  'services/relations/relationExport.ts',
  'routes/me/export-relations.ts',
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('garde — le consentement de cercle ne se lit que par relationConsentOf', () => {
  it('aucun autre fichier de la passerelle ne nomme une colonne de consentement', () => {
    const offenders = sources(GATEWAY_SRC)
      .map((path) => relative(GATEWAY_SRC, path))
      .filter((path) => !ALLOWED.includes(path) && CONSENT_COLUMN.test(readFileSync(join(GATEWAY_SRC, path), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('la garde sait rougir : elle reconnaît chaque colonne', () => {
    ['listeningCategoryShared', 'listeningTitleShared', 'locationShared', 'locationHistoryShared', 'proximityShared'].forEach((column) =>
      expect(CONSENT_COLUMN.test(`select: { ${column}: true }`)).toBe(true));
    expect(CONSENT_COLUMN.test('locationWithdrawnAt')).toBe(false);
  });
});
