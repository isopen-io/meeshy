/**
 * LA MESURE DE L'IMMORTALISATION (D15, #10185 — lot L20 #10176) : des agrégats ANONYMES lus dans le registre que la
 * fonctionnalité tient déjà. Les témoins portent sur ce que le rapport SORT : aucun identifiant, aucune cellule sous
 * dix comptes distincts, aucun compte qui a refusé l'analyse, et une lecture qui n'écrit rien.
 */

import {
  PHOTO_MEASURE_MIN_ACCOUNTS,
  measurePhotoMoments,
  parsePhotoMeasureArgs,
  type PhotoMeasureReader,
} from '../photoMomentsMeasure';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const WINDOW = { from: new Date('2026-10-18T00:00:00.000Z'), to: new Date('2026-10-25T00:00:00.000Z') };
const DAY = '2026-10-20';
const at = (day: string, hour = 10): Date => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`);

const accountId = (n: number): string => `65${String(n).padStart(22, '0')}`;
const notificationId = (n: number): string => `66${String(n).padStart(22, '0')}`;

type MomentRow = {
  readonly id: string;
  readonly userId: string;
  readonly stepId: string;
  readonly presentedAt: Date | null;
  readonly notifiedAt: Date | null;
  readonly keptAt: Date | null;
};
type NotificationRow = { readonly id: string; readonly userId: string; readonly createdAt: Date; readonly readAt: Date | null };

const moment = (overrides: Partial<MomentRow> & { readonly userId: string }): MomentRow => ({
  id: `m-${overrides.userId}-${overrides.stepId ?? 'rank:echo:5'}`,
  stepId: 'rank:echo:5',
  presentedAt: at(DAY),
  notifiedAt: null,
  keptAt: null,
  ...overrides,
});

const accounts = (count: number, offset = 0): readonly string[] => Array.from({ length: count }, (_, i) => accountId(offset + i + 1));

type Calls = { readonly reads: string[]; readonly writes: string[] };

/**
 * Un registre en mémoire qui sert les `findMany` d'après leur `where` et leur curseur, et CONSIGNE tout autre appel :
 * une écriture tentée (create, update, upsert, delete, $runCommandRaw…) se voit dans `calls.writes`.
 */
function registry(params: {
  readonly moments: readonly MomentRow[];
  readonly notifications?: readonly NotificationRow[];
  readonly withdrawn?: readonly string[];
}): { readonly reader: PhotoMeasureReader; readonly calls: Calls } {
  const calls: Calls = { reads: [], writes: [] };
  const page = <T extends { readonly id: string }>(rows: readonly T[], args: { take: number; cursor?: { id: string } }): T[] => {
    const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const start = args.cursor === undefined ? 0 : sorted.findIndex((row) => row.id === args.cursor?.id) + 1;
    return sorted.slice(start, start + args.take);
  };
  const model = <T extends { readonly id: string }>(name: string, rows: readonly T[]) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => (args: { take: number; cursor?: { id: string } }) => {
          if (method !== 'findMany') {
            calls.writes.push(`${name}.${method}`);
            return Promise.resolve(null);
          }
          calls.reads.push(name);
          return Promise.resolve(page(rows, args));
        },
      },
    );
  const withdrawnRows = (params.withdrawn ?? []).map((id) => ({ id }));
  const reader = {
    gamePhotoMoment: model('gamePhotoMoment', params.moments),
    notification: model('notification', params.notifications ?? []),
    user: model('user', withdrawnRows),
  } as unknown as PhotoMeasureReader;
  return { reader, calls };
}

const IDENTIFIER = /[0-9a-f]{24}/;

describe('aucun identifiant ne sort', () => {
  it('le rapport sérialisé ne porte ni compte, ni ligne, ni notification, ni étape individuelle', async () => {
    const users = accounts(12);
    const { reader } = registry({
      moments: users.map((userId, i) => moment({ userId, stepId: `meesh:${(i + 1) * 10}`, keptAt: at(DAY, 11) })),
      notifications: users.map((userId, i) => ({ id: notificationId(i), userId, createdAt: at(DAY, 8), readAt: at(DAY, 9) })),
    });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });
    const wire = JSON.stringify(report);

    expect(wire).not.toMatch(IDENTIFIER);
    expect(wire).not.toContain('userId');
    expect(wire).not.toMatch(/meesh:\d/);
    expect(report.cells).toContainEqual({ day: DAY, family: 'meesh', key: 'meesh', event: 'presented', surface: 'in-app', accounts: 12, moments: 12 });
    expect(report.cells).toContainEqual({ day: DAY, family: 'meesh', key: 'meesh', event: 'kept', surface: 'in-app', accounts: 12, moments: 12 });
  });

  it('les clés de chaque cellule sont celles du contrat, et seulement elles', async () => {
    const { reader } = registry({ moments: accounts(10).map((userId) => moment({ userId })) });
    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });
    report.cells.forEach((cell) => expect(Object.keys(cell).sort()).toEqual(['accounts', 'day', 'event', 'family', 'key', 'moments', 'surface']));
    report.rates.forEach((rate) => expect(Object.keys(rate).sort()).toEqual(['accounts', 'announced', 'family', 'kept', 'key', 'rate']));
  });
});

describe('une cellule sous dix comptes distincts n’apparaît pas', () => {
  it(`neuf comptes ⇒ aucune cellule ; ${PHOTO_MEASURE_MIN_ACCOUNTS} ⇒ la cellule sort`, async () => {
    expect(PHOTO_MEASURE_MIN_ACCOUNTS).toBe(10);
    const nine = registry({ moments: accounts(9).map((userId) => moment({ userId })) });
    const ten = registry({ moments: accounts(10).map((userId) => moment({ userId })) });

    const below = await measurePhotoMoments(nine.reader, { ...WINDOW, now: NOW });
    const at10 = await measurePhotoMoments(ten.reader, { ...WINDOW, now: NOW });

    expect(below.cells).toEqual([]);
    expect(below.rates).toEqual([]);
    expect(below.suppressed.cells).toBeGreaterThan(0);
    expect(at10.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10, moments: 10 }]);
  });

  it('les seuils comptent des COMPTES, pas des lignes : un compte aux cinq divisions reste un compte', async () => {
    const divisions = [5, 4, 3, 2, 1].map((division) => moment({ userId: accountId(1), stepId: `rank:echo:${division}` }));
    const others = accounts(8, 1).map((userId) => moment({ userId }));
    const { reader } = registry({ moments: [...divisions, ...others] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([]);
  });

  it('les push lus suivent le même seuil', async () => {
    const notifications = accounts(9).map((userId, i) => ({ id: notificationId(i), userId, createdAt: at(DAY, 8), readAt: at(DAY, 9) }));
    const { reader } = registry({ moments: [], notifications });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toEqual([]);
  });
});

describe('un compte qui a refusé l’analyse ne compte pas', () => {
  it('dix comptes dont un a refusé ⇒ neuf ⇒ la cellule disparaît', async () => {
    const users = accounts(10);
    const { reader } = registry({ moments: users.map((userId) => moment({ userId })), withdrawn: [users[0] ?? ''] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([]);
  });

  it('ses push ne comptent pas non plus', async () => {
    const users = accounts(11);
    const notifications = users.map((userId, i) => ({ id: notificationId(i), userId, createdAt: at(DAY, 8), readAt: null }));
    const { reader } = registry({ moments: [], notifications, withdrawn: [users[0] ?? ''] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toEqual([{ day: DAY, event: 'sent', accounts: 10, notifications: 10 }]);
  });
});

describe('rejouer le script ne modifie rien en base', () => {
  it('seules des lectures partent, et deux passages rendent le même rapport', async () => {
    const users = accounts(12);
    const { reader, calls } = registry({
      moments: users.map((userId) => moment({ userId, keptAt: at(DAY, 11) })),
      notifications: users.map((userId, i) => ({ id: notificationId(i), userId, createdAt: at(DAY, 8), readAt: at(DAY, 9) })),
      withdrawn: [accountId(99)],
    });

    const first = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });
    const second = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.writes).toEqual([]);
    expect(new Set(calls.reads)).toEqual(new Set(['gamePhotoMoment', 'notification', 'user']));
    expect(second).toEqual(first);
  });

  it('les lignes se lisent par pages : un registre plus grand qu’une page est lu en entier', async () => {
    const users = accounts(2_100);
    const { reader } = registry({ moments: users.map((userId) => moment({ userId })) });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 2_100, moments: 2_100 }]);
  });
});

describe('ce que le rapport mesure', () => {
  it('le taux d’immortalisation se lit par famille ET par clé, sur les étapes annoncées dans la fenêtre', async () => {
    const kept = accounts(10).map((userId) => moment({ userId, stepId: 'flame:30', keptAt: at(DAY, 12) }));
    const announcedOnly = accounts(10, 10).map((userId) => moment({ userId, stepId: 'flame:30', presentedAt: null, notifiedAt: at(DAY, 7) }));
    const { reader } = registry({ moments: [...kept, ...announcedOnly] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.rates).toEqual([
      { family: 'flame', key: null, announced: 20, kept: 10, accounts: 20, rate: 0.5 },
      { family: 'flame', key: 'flame:30', announced: 20, kept: 10, accounts: 20, rate: 0.5 },
    ]);
    expect(report.cells).toContainEqual({ day: DAY, family: 'flame', key: 'flame:30', event: 'notified', surface: 'push', accounts: 10, moments: 10 });
  });

  it('la surface est grossière : in-app si présentée, push si seulement notifiée, none sinon', async () => {
    const pushKept = accounts(10).map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 7), keptAt: at(DAY, 9) }));
    const carnetKept = accounts(10, 10).map((userId) => moment({ userId, stepId: 'start', presentedAt: null, keptAt: at(DAY, 9) }));
    const { reader } = registry({ moments: [...pushKept, ...carnetKept] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toContainEqual({ day: DAY, family: 'rank', key: 'rank:echo', event: 'kept', surface: 'push', accounts: 10, moments: 10 });
    expect(report.cells).toContainEqual({ day: DAY, family: 'start', key: 'start', event: 'kept', surface: 'none', accounts: 10, moments: 10 });
  });

  it('un événement hors de la fenêtre et une identité hors grammaire ne comptent pas', async () => {
    const outside = accounts(10).map((userId) => moment({ userId, presentedAt: at('2026-10-10') }));
    const unknown = accounts(10, 10).map((userId) => moment({ userId, stepId: 'inconnu:1' }));
    const { reader } = registry({ moments: [...outside, ...unknown] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([]);
  });

  it('un push lu se compte au jour de sa lecture, et le rapport dit que ce n’est qu’un plafond (visites du carnet comprises)', async () => {
    const notifications = accounts(10).map((userId, i) => ({ id: notificationId(i), userId, createdAt: at('2026-10-19', 22), readAt: at(DAY, 9) }));
    const { reader } = registry({ moments: [], notifications });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toEqual([
      { day: '2026-10-19', event: 'sent', accounts: 10, notifications: 10 },
      { day: DAY, event: 'read', accounts: 10, notifications: 10 },
    ]);
    expect(report.pushReadMeaning).toBe('ceiling-includes-carnet-visits');
  });
});

describe('les arguments de la requête', () => {
  it('sans argument : les sept derniers jours UTC complets', () => {
    expect(parsePhotoMeasureArgs([], NOW)).toEqual({ from: new Date('2026-10-18T00:00:00.000Z'), to: new Date('2026-10-25T00:00:00.000Z') });
  });

  it('--from / --to : bornes en jours UTC, la seconde exclue', () => {
    expect(parsePhotoMeasureArgs(['--from', '2026-10-01', '--to', '2026-10-08'], NOW)).toEqual({
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-08T00:00:00.000Z'),
    });
  });

  it.each([
    [['--from', '2026-02-30'], 'invalid-day'],
    [['--from', '2026-10-10', '--to', '2026-10-10'], 'empty-window'],
    [['--from', '2024-01-01', '--to', '2024-02-01'], 'beyond-retention'],
    [['--bogus'], 'unknown-argument'],
  ])('%j ⇒ refus %s', (argv, reason) => {
    expect(parsePhotoMeasureArgs(argv, NOW)).toEqual({ reason });
  });
});
