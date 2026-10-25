/**
 * AUCUNE SOUSTRACTION ENTRE LIGNES PUBLIÉES N'ISOLE MOINS DE DIX COMPTES (#10176, deuxième audit adversarial).
 *
 * Chaque témoin construit un scénario où le rapport d'avant rendait un compte seul — par un nombre de 1 à 9, ou par
 * l'écart de deux nombres publiés — et exige qu'il n'en rende plus aucun (`isolations`, indifférent à la forme du
 * rapport : il lit tous les nombres de comptes publiés). Les scénarios A1, A1bis, A2 et A3 sont ceux de l'audit.
 */

import { measurePhotoMoments } from '../photoMomentsMeasure';
import { DAY, NOW, WEEK, accountId, accounts, at, carnetKept, isolations, moment, pushed, registry, type MomentRow, type NotificationRow } from './photoMomentsMeasureFixtures';

const measure = (moments: readonly MomentRow[], notifications: readonly NotificationRow[] = [], week = WEEK) =>
  measurePhotoMoments(registry({ moments, notifications }).reader, { week, now: NOW });

describe('les scénarios de l’audit n’isolent plus aucun compte', () => {
  it('A1 — clé − cellules rembourrées : neuf comptes à deux Écho, et un vingt-et-unième compte, ne sortent pas à 1', async () => {
    const sameDay = accounts(20).map((userId) => moment({ userId, presentedAt: at(DAY), keptAt: at(DAY, 11) }));
    const pad1 = accounts(5).map((userId) => moment({ userId, stepId: 'rank:echo:4', presentedAt: at('2026-10-21'), keptAt: at('2026-10-21', 11) }));
    const pad2 = accounts(4, 5).map((userId) => moment({ userId, stepId: 'rank:echo:4', presentedAt: at('2026-10-22'), keptAt: at('2026-10-22', 11) }));
    const target = moment({ userId: accountId(99), stepId: 'rank:echo:3', presentedAt: at('2026-10-22'), keptAt: at('2026-10-22', 12) });

    const report = await measure([...sameDay, ...pad1, ...pad2, target]);

    expect(isolations(report)).toEqual([]);
  });

  it('A1bis — famille − clé : le seul compte Légende ne se déduit d’aucune ligne', async () => {
    const echo = accounts(20).map((userId) => moment({ userId, presentedAt: at(DAY), keptAt: at(DAY, 11) }));
    const padA = accounts(5).map((userId) => moment({ userId, stepId: 'rank:voix:5', presentedAt: at('2026-10-21'), keptAt: at('2026-10-21', 11) }));
    const padB = accounts(4, 5).map((userId) => moment({ userId, stepId: 'rank:conteur:5', presentedAt: at('2026-10-22'), keptAt: at('2026-10-22', 11) }));
    const legende = moment({ userId: accountId(99), stepId: 'rank:legende:5', presentedAt: at('2026-10-23'), keptAt: at('2026-10-23', 11) });

    const report = await measure([...echo, ...padA, ...padB, legende]);

    expect(isolations(report)).toEqual([]);
  });

  it('A2 — push envoyés − annoncés : le seul compte poussé pour une Meesh ne se déduit pas', async () => {
    const echo = accounts(10).map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 8) }));
    const other = moment({ userId: accountId(99), stepId: 'meesh:10', presentedAt: null, notifiedAt: at(DAY, 8) });
    const notifications = [...echo, other].map((row) => pushed(row.userId, at(DAY, 8)));

    const report = await measure([...echo, other], notifications);

    expect(isolations(report)).toEqual([]);
  });

  it('A3 — annoncés − gardés : onze annoncés dont dix gardent ne disent pas qu’un seul n’a pas gardé', async () => {
    const rows = accounts(11).map((userId, i) => moment({ userId, presentedAt: at(DAY), keptAt: i < 10 ? at(DAY, 11) : null }));

    const report = await measure(rows);

    expect(isolations(report)).toEqual([]);
  });
});

describe('chaque complément d’une ligne publiée vaut zéro ou au moins dix comptes', () => {
  it('annoncés − gardés : 20 annoncés, 11 gardés ⇒ la ligne est retenue (le complément serait 9)', async () => {
    const rows = accounts(20).map((userId, i) => moment({ userId, keptAt: i < 11 ? at(DAY, 11) : null }));

    const report = await measure(rows);

    expect(isolations(report)).toEqual([]);
    expect(report.suppressed).toBeGreaterThan(0);
  });

  it('gardés : 15 annoncés, 5 gardés ⇒ la ligne est retenue (les gardés seraient 5)', async () => {
    const rows = accounts(15).map((userId, i) => moment({ userId, keptAt: i < 5 ? at(DAY, 11) : null }));

    const report = await measure(rows);

    expect(isolations(report)).toEqual([]);
  });

  it('envoyés − lus : 11 comptes poussés, 10 lisent ⇒ la ligne push est retenue', async () => {
    const notifications = accounts(11).map((userId, i) => pushed(userId, at(DAY, 8), i < 10 ? at(DAY, 9) : null));

    const report = await measure([], notifications);

    expect(isolations(report)).toEqual([]);
  });

  it('lus : 15 comptes poussés, 5 lisent ⇒ la ligne push est retenue', async () => {
    const notifications = accounts(15).map((userId, i) => pushed(userId, at(DAY, 8), i < 5 ? at(DAY, 9) : null));

    const report = await measure([], notifications);

    expect(isolations(report)).toEqual([]);
  });
});

describe('un rembourrage de moments ne laisse jamais un compte en différence', () => {
  it('neuf comptes à deux moments et un compte neuf à un seul ⇒ dix comptes, aucun écart', async () => {
    const twice = accounts(9).flatMap((userId) => [
      moment({ userId, stepId: 'rank:echo:5', keptAt: at(DAY, 11) }),
      moment({ userId, stepId: 'rank:echo:4', presentedAt: at('2026-10-22'), keptAt: at('2026-10-22', 11) }),
    ]);
    const fresh = moment({ userId: accountId(50), stepId: 'rank:echo:4', presentedAt: at('2026-10-22'), keptAt: at('2026-10-22', 11) });

    const report = await measure([...twice, fresh]);

    expect(isolations(report)).toEqual([]);
    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 10, rate: 1 }]);
  });
});

describe('aucune ligne publiée n’en contient une autre à moins de dix comptes près', () => {
  it('kept-backlog face à kept : onze rattrapages, dont les dix comptes qui ont aussi gardé une annonce neuve', async () => {
    const fresh = accounts(10).map((userId) => moment({ userId, keptAt: at(DAY, 11) }));
    const backlog = accounts(11).map((userId) => moment({ userId, stepId: 'rank:echo:2', presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) }));

    const report = await measure([...fresh, ...backlog]);

    expect(isolations(report)).toEqual([]);
    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 10, rate: 1 }]);
    expect(report.keptBacklog).toEqual([]);
  });

  it('push face à une famille : onze annoncés, dont dix par push ⇒ la ligne push est retenue', async () => {
    const byPush = accounts(10).map((userId) => moment({ userId, presentedAt: null, notifiedAt: at(DAY, 8) }));
    const inApp = moment({ userId: accountId(99) });
    const notifications = byPush.map((row) => pushed(row.userId, at(DAY, 8)));

    const report = await measure([...byPush, inApp], notifications);

    expect(isolations(report)).toEqual([]);
    expect(report.families).toEqual([{ family: 'rank', announced: 11, kept: 0, rate: 0 }]);
    expect(report.push).toBeNull();
  });

  it('kept-backlog face au push et à la famille : dix rattrapages parmi onze comptes poussés et annoncés', async () => {
    const announced = accounts(11).map((userId) => moment({ userId, stepId: 'meesh:20', presentedAt: null, notifiedAt: at(DAY, 8) }));
    const notifications = announced.map((row) => pushed(row.userId, at(DAY, 8)));
    const backlog = accounts(10).map((userId) => moment({ userId, stepId: 'meesh:10', presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) }));

    const report = await measure([...announced, ...backlog], notifications);

    expect(isolations(report)).toEqual([]);
    expect(report.keptBacklog).toEqual([]);
  });
});

describe('une semaine ne se soustrait pas de la précédente', () => {
  it('une famille dont toute l’histoire tient en une semaine : ses rattrapages de la suivante ne sortent pas à un compte près', async () => {
    const announcedW42 = accounts(11).map((userId, i) =>
      moment({ userId, stepId: 'season:3', presentedAt: at('2026-10-13'), keptAt: i < 10 ? at(DAY, 12) : null }),
    );

    const w42 = await measure(announcedW42, [], '2026-W42');
    const w43 = await measure(announcedW42);

    expect(w42.families).toEqual([{ family: 'season', announced: 11, kept: 0, rate: 0 }]);
    expect(isolations(w42, w43)).toEqual([]);
  });

  it('des rattrapages venus de deux semaines différentes sortent, puisque l’union de deux semaines n’est publiée nulle part', async () => {
    const fromW41 = accounts(6).map((userId) => moment({ userId, stepId: 'season:3', presentedAt: at('2026-10-06'), keptAt: at(DAY, 12) }));
    const fromW42 = accounts(6, 6).map((userId) => moment({ userId, stepId: 'season:3', presentedAt: at('2026-10-13'), keptAt: at(DAY, 12) }));

    const report = await measure([...fromW41, ...fromW42]);

    expect(report.keptBacklog).toEqual([{ family: 'season', accounts: 12 }]);
  });
});

describe('« annoncé » ne se lit jamais dans l’horodatage que la garde a posé elle-même', () => {
  it('une garde depuis le carnet d’un moment jamais annoncé (presentedAt = keptAt) n’est ni annoncée, ni gardée au taux', async () => {
    const announcedKept = accounts(10).map((userId) => moment({ userId, keptAt: at(DAY, 11) }));
    const fromCarnet = accounts(10, 10).map((userId) => carnetKept(userId, at(DAY, 11)));

    const report = await measure([...announcedKept, ...fromCarnet]);

    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 10, rate: 1 }]);
    expect(report.keptBacklog).toEqual([]);
  });

  it('une étape notifiée puis gardée depuis le carnet est annoncée par son push, et gardée', async () => {
    const rows = accounts(10).map((userId) => carnetKept(userId, at(DAY, 11), { notifiedAt: at(DAY, 8) }));

    const report = await measure(rows);

    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 10, rate: 1 }]);
  });

  it('une étape notifiée en W42 et présentée en W43 a été annoncée en W42 : sa garde en W43 est un rattrapage', async () => {
    const rows = accounts(10).map((userId) => moment({ userId, notifiedAt: at('2026-10-14', 8), presentedAt: at(DAY), keptAt: at(DAY, 11) }));

    const report = await measure(rows);

    expect(report.families).toEqual([]);
    expect(report.keptBacklog).toEqual([{ family: 'rank', accounts: 10 }]);
  });
});
