/**
 * LA MESURE DE L'IMMORTALISATION (D15, #10185 — lot L20 #10176) : des agrégats ANONYMES lus dans le registre que la
 * fonctionnalité tient déjà. Les témoins portent sur ce que le rapport SORT : aucun identifiant, aucun autre nombre que
 * des comptes distincts, aucune cellule sous dix comptes, aucun compte qui a refusé l'analyse, une lecture qui
 * n'écrit rien — et aucun RESTE d'une soustraction entre lignes publiées (famille − clés, clé − cellules, cellule
 * `kept` − taux, fenêtre − fenêtre) qui isolerait moins de dix comptes. Le RECOUVREMENT de deux lignes publiées dont
 * l'union est publiée n'est pas fermé : c'est une limite connue de la fiche de décision, pas un témoin.
 */

import {
  PHOTO_MEASURE_MIN_ACCOUNTS,
  measurePhotoMoments,
  parsePhotoMeasureArgs,
  type PhotoMeasureReader,
} from '../photoMomentsMeasure';
import { isoWeekOf, isoWeekWindow } from '../photoMeasureWeek';

/** Mardi 27 octobre 2026 : la semaine ISO 2026-W43 (lundi 19 → lundi 26) est close, la W44 ne l'est pas. */
const NOW = new Date('2026-10-27T12:00:00.000Z');
const WEEK = '2026-W43';
const WINDOW = { week: WEEK };
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
type NotificationRow = { readonly id: string; readonly userId: string; readonly createdAt: Date; readonly readAt: Date | null; readonly type?: string };

const moment = (overrides: Partial<MomentRow> & { readonly userId: string }): MomentRow => ({
  id: `m-${overrides.userId}-${overrides.stepId ?? 'rank:echo:5'}`,
  stepId: 'rank:echo:5',
  presentedAt: at(DAY),
  notifiedAt: null,
  keptAt: null,
  ...overrides,
});

const accounts = (count: number, offset = 0): readonly string[] => Array.from({ length: count }, (_, i) => accountId(offset + i + 1));

type Calls = { readonly reads: string[]; readonly writes: string[]; readonly served: string[] };
type FindArgs<M extends keyof PhotoMeasureReader> = Parameters<PhotoMeasureReader[M]['findMany']>[0];
type UserRow = { readonly id: string; readonly analyticsConsentWithdrawnAt: Date | null };

const within = (date: Date | null, range: { readonly gte: Date; readonly lt: Date }): boolean =>
  date !== null && date.getTime() >= range.gte.getTime() && date.getTime() < range.lt.getTime();

/**
 * Un registre en mémoire qui APPLIQUE le `where` de chaque `findMany` (plages de dates, type de notification, refus
 * posé) et son curseur, CONSIGNE les lignes servies, et consigne tout autre appel : une écriture tentée (create,
 * update, upsert, delete, $runCommandRaw…) se voit dans `calls.writes`. Chaque compte des moments et des notifications
 * existe en `User`, sans refus : une mesure qui oublierait son `where` sur les refus les compterait tous comme refusés.
 */
function registry(params: {
  readonly moments: readonly MomentRow[];
  readonly notifications?: readonly NotificationRow[];
  readonly withdrawn?: readonly string[];
}): { readonly reader: PhotoMeasureReader; readonly calls: Calls } {
  const calls: Calls = { reads: [], writes: [], served: [] };
  const withdrawn = new Set(params.withdrawn ?? []);
  const notifications = params.notifications ?? [];
  const users: readonly UserRow[] = [...new Set([...params.moments, ...notifications].map((row) => row.userId).concat([...withdrawn]))].map((id) => ({
    id,
    analyticsConsentWithdrawnAt: withdrawn.has(id) ? at('2026-10-01') : null,
  }));
  const serve = <T extends { readonly id: string }>(name: string, rows: readonly T[], args: { readonly take: number; readonly cursor?: { readonly id: string } }): readonly T[] => {
    const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const start = args.cursor === undefined ? 0 : sorted.findIndex((row) => row.id === args.cursor?.id) + 1;
    const served = sorted.slice(start, start + args.take);
    calls.served.push(...served.map((row) => `${name}:${row.id}`));
    return served;
  };
  const tracked = <T extends object>(name: string, model: T): T =>
    new Proxy(model, {
      get: (target, method, receiver) => {
        if (method === 'findMany') {
          calls.reads.push(name);
          return Reflect.get(target, method, receiver);
        }
        return () => {
          calls.writes.push(`${name}.${String(method)}`);
          return Promise.resolve(null);
        };
      },
    });
  const reader: PhotoMeasureReader = {
    gamePhotoMoment: tracked('gamePhotoMoment', {
      findMany: (args: FindArgs<'gamePhotoMoment'>) => {
        const [presented, notified, kept] = args.where.OR;
        const matching = params.moments.filter(
          (row) => within(row.presentedAt, presented.presentedAt) || within(row.notifiedAt, notified.notifiedAt) || within(row.keptAt, kept.keptAt),
        );
        return Promise.resolve(serve('gamePhotoMoment', matching, args));
      },
    }),
    notification: tracked('notification', {
      findMany: (args: FindArgs<'notification'>) => {
        const [created, read] = args.where.OR;
        const matching = notifications.filter(
          (row) => (row.type ?? 'game_photo_moment') === args.where.type && (within(row.createdAt, created.createdAt) || within(row.readAt, read.readAt)),
        );
        return Promise.resolve(serve('notification', matching, args));
      },
    }),
    user: tracked('user', {
      findMany: (args: FindArgs<'user'>) => {
        const matching = users.filter((row) => row.analyticsConsentWithdrawnAt !== args.where.analyticsConsentWithdrawnAt.not);
        return Promise.resolve(serve('user', matching, args).map(({ id }) => ({ id })));
      },
    }),
  };
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
    expect(report.cells).toContainEqual({ day: DAY, family: 'meesh', key: 'meesh', event: 'presented', surface: 'in-app', accounts: 12 });
    expect(report.cells).toContainEqual({ day: DAY, family: 'meesh', key: 'meesh', event: 'kept', surface: 'in-app', accounts: 12 });
  });

  it('les clés de chaque cellule sont celles du contrat, et seulement elles', async () => {
    const { reader } = registry({ moments: accounts(10).map((userId) => moment({ userId })) });
    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });
    report.cells.forEach((cell) => expect(Object.keys(cell).sort()).toEqual(['accounts', 'day', 'event', 'family', 'key', 'surface']));
    report.rates.forEach((rate) => expect(Object.keys(rate).sort()).toEqual(['announced', 'family', 'kept', 'key', 'rate']));
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
    expect(at10.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10 }]);
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

    expect(report.push).toEqual([{ day: DAY, event: 'sent', accounts: 10 }]);
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

    expect(report.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 2_100 }]);
  });
});

describe('ce que le rapport mesure', () => {
  it('le taux d’immortalisation se lit par famille ET par clé, sur les étapes annoncées dans la fenêtre', async () => {
    const kept = accounts(10).map((userId) => moment({ userId, stepId: 'flame:30', keptAt: at(DAY, 12) }));
    const announcedOnly = accounts(10, 10).map((userId) => moment({ userId, stepId: 'flame:30', presentedAt: null, notifiedAt: at(DAY, 7) }));
    const { reader } = registry({ moments: [...kept, ...announcedOnly] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.rates).toEqual([
      { family: 'flame', key: null, announced: 20, kept: 10, rate: 0.5 },
      { family: 'flame', key: 'flame:30', announced: 20, kept: 10, rate: 0.5 },
    ]);
    expect(report.cells).toContainEqual({ day: DAY, family: 'flame', key: 'flame:30', event: 'notified', surface: 'push', accounts: 10 });
  });

  it('la surface est grossière : in-app si présentée, push si seulement notifiée, none sinon', async () => {
    const pushKept = accounts(10).map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 7), keptAt: at(DAY, 9) }));
    const carnetKept = accounts(10, 10).map((userId) => moment({ userId, stepId: 'start', presentedAt: null, keptAt: at(DAY, 9) }));
    const { reader } = registry({ moments: [...pushKept, ...carnetKept] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toContainEqual({ day: DAY, family: 'rank', key: 'rank:echo', event: 'kept', surface: 'push', accounts: 10 });
    expect(report.cells).toContainEqual({ day: DAY, family: 'start', key: 'start', event: 'kept-backlog', surface: 'none', accounts: 10 });
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
      { day: '2026-10-19', event: 'sent', accounts: 10 },
      { day: DAY, event: 'read', accounts: 10 },
    ]);
    expect(report.pushReadMeaning).toBe('ceiling-includes-carnet-visits');
  });
});

describe('les arguments de la requête', () => {
  it('sans argument : la dernière semaine ISO close', () => {
    expect(parsePhotoMeasureArgs([], NOW)).toEqual({ week: WEEK });
    expect(parsePhotoMeasureArgs([], new Date('2026-10-26T00:00:00.000Z'))).toEqual({ week: WEEK });
  });

  it('--week : une semaine ISO close, entière', () => {
    expect(parsePhotoMeasureArgs(['--week', '2026-W40'], NOW)).toEqual({ week: '2026-W40' });
  });

  it.each([
    [['--from', '2026-10-20', '--to', '2026-10-21'], 'unknown-argument'],
    [['--from', '2026-10-20'], 'unknown-argument'],
    [['--week', '2026-W44'], 'week-not-closed'],
    [['--week', '2026-W53'], 'week-not-closed'],
    [['--week', '2025-W53'], 'invalid-week'],
    [['--week', '2026-W00'], 'invalid-week'],
    [['--week', '2026-43'], 'invalid-week'],
    [['--week', '2024-W01'], 'beyond-retention'],
    [['--week'], 'unknown-argument'],
    [['--bogus'], 'unknown-argument'],
  ])('%j ⇒ refus %s', (argv, reason) => {
    expect(parsePhotoMeasureArgs(argv, NOW)).toEqual({ reason });
  });
});

describe('les fenêtres sont des semaines ISO fixes : deux fenêtres ne se chevauchent jamais', () => {
  it('une semaine va du lundi 00:00 UTC au lundi suivant, et la suivante commence là où elle finit', () => {
    expect(isoWeekWindow('2026-W43')).toEqual({ week: '2026-W43', from: new Date('2026-10-19T00:00:00.000Z'), to: new Date('2026-10-26T00:00:00.000Z') });
    expect(isoWeekWindow('2026-W44')?.from).toEqual(isoWeekWindow('2026-W43')?.to);
    expect(isoWeekWindow('2027-W01')?.from).toEqual(isoWeekWindow('2026-W53')?.to);
  });

  it('chaque jour appartient à UNE semaine, celle de son jeudi', () => {
    expect(isoWeekOf(new Date('2026-01-01T12:00:00.000Z'))).toBe('2026-W01');
    expect(isoWeekOf(new Date('2027-01-01T12:00:00.000Z'))).toBe('2026-W53');
    expect(isoWeekOf(new Date('2026-10-25T23:59:59.000Z'))).toBe('2026-W43');
    expect(isoWeekOf(new Date('2026-10-26T00:00:00.000Z'))).toBe('2026-W44');
  });

  it('une semaine encore ouverte ne se mesure pas : la relire demain soustrairait la journée', async () => {
    const { reader } = registry({ moments: accounts(10).map((userId) => moment({ userId })) });

    await expect(measurePhotoMoments(reader, { week: '2026-W44', now: NOW })).rejects.toThrow('week-not-closed');
    await expect(measurePhotoMoments(reader, { week: '2026-43', now: NOW })).rejects.toThrow('invalid-week');
  });

  it('une semaine close relue plus tard rend le même rapport, même si ses étapes ont été présentées ou gardées depuis', async () => {
    const users = accounts(10);
    const then = registry({ moments: users.map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 7) })) });
    const later = registry({
      moments: users.map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 7) })).map((row, i) =>
        i === 0 ? { ...row, presentedAt: at('2026-10-28'), keptAt: at('2026-10-28', 11) } : row,
      ),
    });

    const first = await measurePhotoMoments(then.reader, { week: WEEK, now: NOW });
    const second = await measurePhotoMoments(later.reader, { week: WEEK, now: new Date('2026-11-04T12:00:00.000Z') });

    expect(second).toEqual(first);
  });
});

describe('aucune soustraction entre lignes publiées n’isole moins de dix comptes', () => {
  it('famille − clés : un seul compte Légende qui garde sa photo ne se déduit pas de la ligne de famille', async () => {
    const echo = accounts(10).map((userId) => moment({ userId, stepId: 'rank:echo:5' }));
    const legende = moment({ userId: accountId(11), stepId: 'rank:legende:5', keptAt: at(DAY, 11) });
    const { reader } = registry({ moments: [...echo, legende] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.rates).toEqual([{ family: 'rank', key: 'rank:echo', announced: 10, kept: 0, rate: 0 }]);
    expect(report.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10 }]);
  });

  it('clé − cellules : le compte qui seul a vu et gardé son rang un autre jour ne se déduit pas de la ligne de clé', async () => {
    const sameDay = accounts(10).map((userId) => moment({ userId, stepId: 'rank:echo:5' }));
    const otherDay = moment({ userId: accountId(11), stepId: 'rank:echo:3', presentedAt: at('2026-10-22'), keptAt: at('2026-10-22', 11) });
    const { reader } = registry({ moments: [...sameDay, otherDay] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.rates).toEqual([]);
    expect(report.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10 }]);
  });

  it('clé − cellules, sur le seul taux de garde : un compte qui garde seul un autre jour ne se déduit pas', async () => {
    const shown = accounts(11).map((userId) => moment({ userId, stepId: 'rank:echo:5' }));
    const keptAlone = shown.map((row, i) => (i === 0 ? { ...row, keptAt: at('2026-10-23', 11) } : row));
    const { reader } = registry({ moments: keptAlone });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.rates).toEqual([]);
  });

  it('un reste de dix comptes ou plus ne se protège pas : la famille sort quand ses clés cachées pèsent ensemble dix comptes', async () => {
    const echo = accounts(10).map((userId) => moment({ userId, stepId: 'rank:echo:5' }));
    const voix = accounts(5, 10).map((userId) => moment({ userId, stepId: 'rank:voix:2' }));
    const conteur = accounts(5, 15).map((userId) => moment({ userId, stepId: 'rank:conteur:1' }));
    const { reader } = registry({ moments: [...echo, ...voix, ...conteur] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.rates).toEqual([
      { family: 'rank', key: null, announced: 20, kept: 0, rate: 0 },
      { family: 'rank', key: 'rank:echo', announced: 10, kept: 0, rate: 0 },
    ]);
  });
});

describe('les cellules de garde et le taux comptent la MÊME population', () => {
  it('cellule kept − taux : le compte annoncé une semaine antérieure qui garde dans celle-ci ne se déduit pas', async () => {
    const thisWeek = accounts(10).map((userId) => moment({ userId, stepId: 'rank:echo:5', keptAt: at(DAY, 11) }));
    const earlier = moment({ userId: accountId(11), stepId: 'rank:echo:4', presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) });
    const { reader } = registry({ moments: [...thisWeek, earlier] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([
      { day: DAY, family: 'rank', key: 'rank:echo', event: 'kept', surface: 'in-app', accounts: 10 },
      { day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10 },
    ]);
    expect(report.rates).toEqual([
      { family: 'rank', key: null, announced: 10, kept: 10, rate: 1 },
      { family: 'rank', key: 'rank:echo', announced: 10, kept: 10, rate: 1 },
    ]);
    expect(report.push).toEqual([]);
    expect(report.suppressed.cells).toBe(1);
  });
});

describe('un compte à plusieurs moments d’une même clé ne se distingue pas', () => {
  it('cellules et taux comptent des COMPTES : un second moment du même compte, le même jour, ne laisse aucune trace', async () => {
    const single = accounts(10).map((userId) => moment({ userId, stepId: 'rank:echo:5', keptAt: at(DAY, 11) }));
    const second = moment({ userId: accountId(1), stepId: 'rank:echo:4', presentedAt: at(DAY, 14), keptAt: at(DAY, 15) });

    const once = await measurePhotoMoments(registry({ moments: single }).reader, { ...WINDOW, now: NOW });
    const twice = await measurePhotoMoments(registry({ moments: [...single, second] }).reader, { ...WINDOW, now: NOW });

    expect(twice).toEqual(once);
    expect(twice.cells).toEqual([
      { day: DAY, family: 'rank', key: 'rank:echo', event: 'kept', surface: 'in-app', accounts: 10 },
      { day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10 },
    ]);
    expect(twice.rates).toEqual([
      { family: 'rank', key: null, announced: 10, kept: 10, rate: 1 },
      { family: 'rank', key: 'rank:echo', announced: 10, kept: 10, rate: 1 },
    ]);
  });

  it('les push comptent des comptes : une seconde notification du même compte, le même jour, ne laisse aucune trace', async () => {
    const sent = accounts(10).map((userId, i) => ({ id: notificationId(i), userId, createdAt: at(DAY, 8), readAt: null }));
    const again = { id: notificationId(50), userId: accountId(1), createdAt: at(DAY, 18), readAt: null };

    const once = await measurePhotoMoments(registry({ moments: [], notifications: sent }).reader, { ...WINDOW, now: NOW });
    const twice = await measurePhotoMoments(registry({ moments: [], notifications: [...sent, again] }).reader, { ...WINDOW, now: NOW });

    expect(twice).toEqual(once);
    expect(twice.push).toEqual([{ day: DAY, event: 'sent', accounts: 10 }]);
  });
});

describe('la conservation de 25 mois borne la mesure elle-même, pas seulement sa ligne de commande', () => {
  it('une semaine au-delà de la conservation est refusée par measurePhotoMoments, sans aucune lecture', async () => {
    const { reader, calls } = registry({ moments: accounts(10).map((userId) => moment({ userId })) });

    await expect(measurePhotoMoments(reader, { week: '2024-W01', now: NOW })).rejects.toThrow('beyond-retention');
    expect(calls.reads).toEqual([]);
  });

  it('la dernière semaine dans la conservation se mesure encore', async () => {
    const { reader } = registry({ moments: [] });

    await expect(measurePhotoMoments(reader, { week: '2024-W40', now: NOW })).resolves.toMatchObject({ window: { week: '2024-W40' } });
    await expect(measurePhotoMoments(reader, { week: '2024-W39', now: NOW })).rejects.toThrow('beyond-retention');
  });
});

describe('la base ne sert que ce que la semaine demande', () => {
  it('les moments sans aucun événement dans la semaine ne sont même pas servis', async () => {
    const inside = accounts(10).map((userId) => moment({ userId }));
    const outside = accounts(10, 10).map((userId) => moment({ userId, presentedAt: at('2026-10-10'), keptAt: at('2026-10-27') }));
    const { reader, calls } = registry({ moments: [...inside, ...outside] });

    await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.served.filter((row) => row.startsWith('gamePhotoMoment:')).sort()).toEqual(inside.map((row) => `gamePhotoMoment:${row.id}`).sort());
  });

  it('seules les notifications du jeu se comptent : un autre type, même dans la semaine, ne sort pas', async () => {
    const other = accounts(10).map((userId, i) => ({ id: notificationId(i), userId, createdAt: at(DAY, 8), readAt: at(DAY, 9), type: 'message' }));
    const { reader, calls } = registry({ moments: [], notifications: other });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toEqual([]);
    expect(calls.served.filter((row) => row.startsWith('notification:'))).toEqual([]);
  });

  it('seuls les refus sont lus : un compte sans refus compte, un compte qui a refusé ne compte pas', async () => {
    const users = accounts(11);
    const { reader, calls } = registry({ moments: users.map((userId) => moment({ userId })), withdrawn: [accountId(11)] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.served.filter((row) => row.startsWith('user:'))).toEqual([`user:${accountId(11)}`]);
    expect(report.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'presented', surface: 'in-app', accounts: 10 }]);
  });
});

describe('une garde posée dans la semaine d’une étape annoncée AVANT elle sort à part, sous le même seuil', () => {
  it('dix comptes annoncés en W42 qui gardent en W43 ⇒ une cellule kept-backlog, et aucun taux', async () => {
    const late = accounts(10).map((userId) => moment({ userId, presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) }));
    const { reader } = registry({ moments: late });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([{ day: DAY, family: 'rank', key: 'rank:echo', event: 'kept-backlog', surface: 'in-app', accounts: 10 }]);
    expect(report.rates).toEqual([]);
  });

  it('neuf comptes ⇒ la cellule kept-backlog ne sort pas', async () => {
    const late = accounts(9).map((userId) => moment({ userId, presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) }));
    const { reader } = registry({ moments: late });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.cells).toEqual([]);
    expect(report.suppressed.cells).toBe(1);
  });
});
