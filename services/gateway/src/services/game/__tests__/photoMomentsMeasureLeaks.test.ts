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
  it('une garde d’un moment annoncé AVANT la semaine n’est publiée nulle part, pas même à côté de dix gardes neuves', async () => {
    const fresh = accounts(10).map((userId) => moment({ userId, keptAt: at(DAY, 11) }));
    const late = accounts(11).map((userId) => moment({ userId, stepId: 'rank:echo:2', presentedAt: at('2026-10-12'), keptAt: at(DAY, 12) }));

    const report = await measure([...fresh, ...late]);

    expect(isolations(report)).toEqual([]);
    expect(report).toEqual(await measure(fresh));
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
});

/** Une ligne par (compte, étape) — `@@unique([userId, stepId])` : `start` n'a qu'un moment par compte, annoncé dans UNE semaine. */
const reports = (moments: readonly MomentRow[], notifications: readonly NotificationRow[] = []) =>
  Promise.all(['2026-W41', '2026-W42', '2026-W43'].map((week) => measure(moments, notifications, week)));

describe('aucune combinaison de lignes, sur plusieurs semaines, n’isole un compte (troisième audit)', () => {
  it('S1 — 21 départs annoncés en W41, 10 gardés en W42, 10 en W43, 1 jamais : A − B(W42) − B(W43) ne vaut plus 1', async () => {
    const rows = accounts(21).map((userId, i) =>
      moment({ userId, stepId: 'start', presentedAt: at('2026-10-06'), keptAt: i < 10 ? at('2026-10-13', 12) : i < 20 ? at(DAY, 12) : null }),
    );

    const [w41, w42, w43] = await reports(rows);

    expect(isolations(w41, w42, w43)).toEqual([]);
    expect(w41?.families).toEqual([{ family: 'start', announced: 21, kept: 0, rate: 0 }]);
  });

  it('S2 — deux semaines sources : A(W41) + A(W42) − B(W43) ne vaut plus 1', async () => {
    const fromW41 = accounts(10).map((userId) => moment({ userId, stepId: 'start', presentedAt: at('2026-10-06'), keptAt: at(DAY, 12) }));
    const fromW42 = accounts(10, 10).map((userId, i) => moment({ userId, stepId: 'start', presentedAt: at('2026-10-13'), keptAt: i < 9 ? at(DAY, 12) : null }));

    const [w41, w42, w43] = await reports([...fromW41, ...fromW42]);

    expect(isolations(w41, w42, w43)).toEqual([]);
  });

  it('trois familles à clé unique par compte et le push, sur trois semaines : chaque semaine porte des groupes, leur somme n’isole personne', async () => {
    const start = accounts(30).map((userId, i) =>
      moment({ userId, stepId: 'start', presentedAt: at(['2026-10-06', '2026-10-13', DAY][i % 3] ?? DAY), keptAt: i < 29 ? at(['2026-10-06', '2026-10-13', DAY][i % 3] ?? DAY, 12) : null }),
    );
    const season = accounts(20, 100).map((userId, i) => moment({ userId, stepId: 'season:3', presentedAt: null, notifiedAt: at(i < 10 ? '2026-10-07' : '2026-10-21', 8) }));
    const summit = accounts(11, 200).map((userId, i) => moment({ userId, stepId: 'level-100:0', presentedAt: at('2026-10-14'), keptAt: i < 10 ? at('2026-10-14', 12) : at(DAY, 12) }));
    const notifications = season.map((row) => pushed(row.userId, row.notifiedAt ?? at(DAY), null));

    const weeks = await reports([...start, ...season, ...summit], notifications);

    expect(isolations(...weeks)).toEqual([]);
  });
});

describe('« annoncé » ne se lit jamais dans l’horodatage que la garde a posé elle-même', () => {
  it('une garde depuis le carnet d’un moment jamais annoncé (presentedAt = keptAt) n’est ni annoncée, ni gardée au taux', async () => {
    const announcedKept = accounts(10).map((userId) => moment({ userId, keptAt: at(DAY, 11) }));
    const fromCarnet = accounts(10, 10).map((userId) => carnetKept(userId, at(DAY, 11)));

    const report = await measure([...announcedKept, ...fromCarnet]);

    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 10, rate: 1 }]);
  });

  it('une étape notifiée puis gardée depuis le carnet est annoncée par son push, et gardée', async () => {
    const rows = accounts(10).map((userId) => carnetKept(userId, at(DAY, 11), { notifiedAt: at(DAY, 8) }));

    const report = await measure(rows);

    expect(report.families).toEqual([{ family: 'rank', announced: 10, kept: 10, rate: 1 }]);
  });

  it('une étape notifiée en W42 et présentée en W43 a été annoncée en W42 : sa garde en W43 n’entre dans aucune ligne de W43', async () => {
    const rows = accounts(10).map((userId) => moment({ userId, notifiedAt: at('2026-10-14', 8), presentedAt: at(DAY), keptAt: at(DAY, 11) }));

    const report = await measure(rows);

    expect(report.families).toEqual([]);
    expect(report.suppressed).toBe(0);
  });
});
