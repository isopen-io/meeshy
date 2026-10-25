/**
 * LA MESURE DE L'IMMORTALISATION (D15, #10185 — lot L20 #10176) : des agrégats ANONYMES lus dans le registre que la
 * fonctionnalité tient déjà. Ces témoins portent sur le CONTRAT de ce que le rapport sort — un seul niveau, la famille
 * à la semaine, plus les rattrapages par famille et le push de la semaine ; aucun identifiant ; aucun nombre de comptes
 * sous dix ; aucun compte qui a refusé l'analyse ; une lecture qui n'écrit rien. Les soustractions entre lignes
 * publiées ont leurs témoins à part (`photoMomentsMeasureLeaks.test.ts`).
 */

import { PHOTO_MEASURE_MIN_ACCOUNTS, measurePhotoMoments, parsePhotoMeasureArgs } from '../photoMomentsMeasure';
import { isoWeekOf, isoWeekWindow } from '../photoMeasureWeek';
import { DAY, NOW, WEEK, accountId, accounts, at, moment, pushed, registry } from './photoMomentsMeasureFixtures';

const WINDOW = { week: WEEK };
const IDENTIFIER = /[0-9a-f]{24}/;

describe('ce que le rapport sort, et rien d’autre', () => {
  it('le rapport sérialisé ne porte ni compte, ni ligne, ni notification, ni étape individuelle, ni clé', async () => {
    const users = accounts(12);
    const { reader } = registry({
      moments: users.map((userId, i) => moment({ userId, stepId: `meesh:${(i + 1) * 10}`, keptAt: at(DAY, 11) })),
      notifications: users.map((userId) => pushed(userId, at(DAY, 8), at(DAY, 9))),
    });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });
    const wire = JSON.stringify(report);

    expect(wire).not.toMatch(IDENTIFIER);
    expect(wire).not.toContain('userId');
    expect(wire).not.toMatch(/meesh:\d/);
    expect(report.families).toEqual([{ family: 'meesh', announced: 12, kept: 12, rate: 1 }]);
    expect(report.push).toEqual({ sent: 12, read: 12 });
  });

  it('les clés du rapport et de chacune de ses lignes sont celles du contrat, et seulement elles', async () => {
    const { reader } = registry({
      moments: accounts(10).map((userId) => moment({ userId })),
      notifications: accounts(10).map((userId) => pushed(userId, at(DAY, 8))),
    });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(Object.keys(report).sort()).toEqual(['families', 'minAccounts', 'push', 'pushReadMeaning', 'suppressed', 'window']);
    report.families.forEach((line) => expect(Object.keys(line).sort()).toEqual(['announced', 'family', 'kept', 'rate']));
    expect(Object.keys(report.push ?? {}).sort()).toEqual(['read', 'sent']);
  });

  it('le taux se lit par famille sur la semaine : deux clés d’une même famille font une seule ligne', async () => {
    const kept = accounts(10).map((userId) => moment({ userId, stepId: 'flame:30', keptAt: at(DAY, 12) }));
    const announcedOnly = accounts(10, 10).map((userId) => moment({ userId, stepId: 'flame:7', presentedAt: null, notifiedAt: at('2026-10-22', 7) }));
    const { reader } = registry({ moments: [...kept, ...announcedOnly] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.families).toEqual([{ family: 'flame', announced: 20, kept: 10, rate: 0.5 }]);
  });

  it('les familles sortent dans l’ordre de la loi partagée, indépendamment de l’ordre des lignes lues', async () => {
    const meesh = accounts(10).map((userId) => moment({ userId, stepId: 'meesh:10' }));
    const rank = accounts(10, 10).map((userId) => moment({ userId }));
    const { reader } = registry({ moments: [...meesh, ...rank] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.families.map((line) => line.family)).toEqual(['rank', 'meesh']);
  });

  it('un événement hors de la fenêtre et une identité hors grammaire ne comptent pas', async () => {
    const outside = accounts(10).map((userId) => moment({ userId, presentedAt: at('2026-10-10') }));
    const unknown = accounts(10, 10).map((userId) => moment({ userId, stepId: 'inconnu:1' }));
    const { reader } = registry({ moments: [...outside, ...unknown] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.families).toEqual([]);
    expect(report.suppressed).toBe(0);
  });
});

describe('aucun nombre de comptes sous dix ne sort', () => {
  it(`neuf comptes ⇒ aucune ligne ; ${PHOTO_MEASURE_MIN_ACCOUNTS} ⇒ la ligne sort`, async () => {
    expect(PHOTO_MEASURE_MIN_ACCOUNTS).toBe(10);
    const below = await measurePhotoMoments(registry({ moments: accounts(9).map((userId) => moment({ userId })) }).reader, { ...WINDOW, now: NOW });
    const at10 = await measurePhotoMoments(registry({ moments: accounts(10).map((userId) => moment({ userId })) }).reader, { ...WINDOW, now: NOW });

    expect(below.families).toEqual([]);
    expect(below.suppressed).toBe(1);
    expect(at10.families).toEqual([{ family: 'rank', announced: 10, kept: 0, rate: 0 }]);
    expect(at10.suppressed).toBe(0);
  });

  it('les seuils comptent des COMPTES, pas des lignes : un compte aux cinq divisions reste un compte', async () => {
    const divisions = [5, 4, 3, 2, 1].map((division) => moment({ userId: accountId(1), stepId: `rank:echo:${division}` }));
    const others = accounts(8, 1).map((userId) => moment({ userId }));
    const { reader } = registry({ moments: [...divisions, ...others] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.families).toEqual([]);
  });

  it('les push suivent le même seuil : neuf comptes poussés ⇒ aucune ligne push', async () => {
    const { reader } = registry({ moments: [], notifications: accounts(9).map((userId) => pushed(userId, at(DAY, 8), at(DAY, 9))) });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toBeNull();
    expect(report.suppressed).toBe(1);
  });
});

describe('le push de la semaine', () => {
  it('envoyés = comptes poussés dans la semaine ; lus = ceux d’entre eux qui en ont lu un avant sa fin', async () => {
    const readInWeek = accounts(10).map((userId) => pushed(userId, at('2026-10-19', 22), at(DAY, 9)));
    const readLater = accounts(10, 10).map((userId) => pushed(userId, at(DAY, 8), at('2026-10-27', 9)));
    const sentBefore = accounts(10, 20).map((userId) => pushed(userId, at('2026-10-12', 8), at(DAY, 9)));
    const { reader, calls } = registry({ moments: [], notifications: [...readInWeek, ...readLater, ...sentBefore] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toEqual({ sent: 20, read: 10 });
    expect(report.pushReadMeaning).toBe('ceiling-includes-carnet-visits');
    expect(calls.served.filter((row) => row.startsWith('notification:'))).toHaveLength(20);
  });

  it('une seconde notification du même compte ne laisse aucune trace', async () => {
    const sent = accounts(10).map((userId) => pushed(userId, at(DAY, 8)));
    const again = pushed(accountId(1), at('2026-10-23', 18));

    const once = await measurePhotoMoments(registry({ moments: [], notifications: sent }).reader, { ...WINDOW, now: NOW });
    const twice = await measurePhotoMoments(registry({ moments: [], notifications: [...sent, again] }).reader, { ...WINDOW, now: NOW });

    expect(twice).toEqual(once);
    expect(twice.push).toEqual({ sent: 10, read: 0 });
  });

  it('seules les notifications du jeu se comptent : un autre type, même dans la semaine, n’est pas servi', async () => {
    const other = accounts(10).map((userId) => ({ ...pushed(userId, at(DAY, 8), at(DAY, 9)), type: 'message' }));
    const { reader, calls } = registry({ moments: [], notifications: other });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toBeNull();
    expect(calls.served.filter((row) => row.startsWith('notification:'))).toEqual([]);
  });
});

describe('un compte qui a refusé l’analyse ne compte nulle part', () => {
  it('dix comptes dont un a refusé ⇒ neuf ⇒ la ligne de famille disparaît', async () => {
    const users = accounts(10);
    const { reader } = registry({ moments: users.map((userId) => moment({ userId })), withdrawn: [users[0] ?? ''] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.families).toEqual([]);
  });

  it('ses push ne comptent pas non plus', async () => {
    const users = accounts(11);
    const { reader } = registry({ moments: [], notifications: users.map((userId) => pushed(userId, at(DAY, 8))), withdrawn: [users[0] ?? ''] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.push).toEqual({ sent: 10, read: 0 });
  });

  it('seuls les refus sont lus : un compte sans refus compte, un compte qui a refusé ne compte pas', async () => {
    const { reader, calls } = registry({ moments: accounts(11).map((userId) => moment({ userId })), withdrawn: [accountId(11)] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.served.filter((row) => row.startsWith('user:'))).toEqual([`user:${accountId(11)}`]);
    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 0, rate: 0 }]);
  });
});

describe('rejouer le script ne modifie rien en base', () => {
  it('seules des lectures partent, et deux passages rendent le même rapport', async () => {
    const users = accounts(12);
    const { reader, calls } = registry({
      moments: users.map((userId) => moment({ userId, keptAt: at(DAY, 11) })),
      notifications: users.map((userId) => pushed(userId, at(DAY, 8), at(DAY, 9))),
      withdrawn: [accountId(99)],
    });

    const first = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });
    const second = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.writes).toEqual([]);
    expect(new Set(calls.reads)).toEqual(new Set(['gamePhotoMoment', 'notification', 'user']));
    expect(second).toEqual(first);
  });

  it('les lignes se lisent par pages : un registre plus grand qu’une page est lu en entier', async () => {
    const { reader } = registry({ moments: accounts(2_100).map((userId) => moment({ userId })) });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(report.families).toEqual([{ family: 'rank', announced: 2_100, kept: 0, rate: 0 }]);
  });

  it('une ligne dont seule la GARDE tombe dans la semaine n’est pas servie : elle n’entre dans aucun nombre publié', async () => {
    const inside = accounts(10).map((userId) => moment({ userId }));
    const keptOnly = [
      ...accounts(10, 10).map((userId) => moment({ userId, presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) })),
      ...accounts(10, 20).map((userId) => moment({ userId, presentedAt: at('2024-03-04'), keptAt: at(DAY, 12) })),
    ];
    const { reader, calls } = registry({ moments: [...inside, ...keptOnly] });

    const report = await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.served.filter((row) => row.startsWith('gamePhotoMoment:')).sort()).toEqual(inside.map((row) => `gamePhotoMoment:${row.id}`).sort());
    expect(calls.reads.filter((name) => name === 'gamePhotoMoment')).toHaveLength(1);
    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 0, rate: 0 }]);
  });

  it('les moments sans aucun événement dans la semaine ne sont même pas servis', async () => {
    const inside = accounts(10).map((userId) => moment({ userId }));
    const outside = accounts(10, 10).map((userId) => moment({ userId, presentedAt: at('2026-10-10'), keptAt: at('2026-10-27') }));
    const { reader, calls } = registry({ moments: [...inside, ...outside] });

    await measurePhotoMoments(reader, { ...WINDOW, now: NOW });

    expect(calls.served.filter((row) => row.startsWith('gamePhotoMoment:')).sort()).toEqual(inside.map((row) => `gamePhotoMoment:${row.id}`).sort());
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
    const notified = users.map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 7) }));
    const then = registry({ moments: notified });
    const later = registry({ moments: notified.map((row, i) => (i === 0 ? { ...row, presentedAt: at('2026-10-28'), keptAt: at('2026-10-28', 11) } : row)) });

    const first = await measurePhotoMoments(then.reader, { week: WEEK, now: NOW });
    const second = await measurePhotoMoments(later.reader, { week: WEEK, now: new Date('2026-11-04T12:00:00.000Z') });

    expect(second).toEqual(first);
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

describe('les témoins n’emploient que des états que la production écrit', () => {
  it('le fabricant lève sur une garde sans présentation, une présentation postérieure à sa garde, une présentation antérieure à son push', () => {
    expect(() => moment({ userId: accountId(1), presentedAt: null, keptAt: at(DAY, 11) })).toThrow('une garde pose presentedAt');
    expect(() => moment({ userId: accountId(1), presentedAt: at(DAY, 12), keptAt: at(DAY, 11) })).toThrow('une garde pose presentedAt');
    expect(() => moment({ userId: accountId(1), presentedAt: at(DAY, 7), notifiedAt: at(DAY, 8) })).toThrow('le push n');
    expect(() => moment({ userId: accountId(1), notifiedAt: at(DAY, 8), presentedAt: at(DAY, 9), keptAt: at(DAY, 9) })).not.toThrow();
  });
});
