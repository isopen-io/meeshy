import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, GRAN, prevKey, pctOf, tally, buckets, periodStats, dueState, closedInLastDays, median, horizonOrder } from './compute.mjs';

const item = (o) => ({ status: 'Todo', createdAt: '2026-08-01T10:00:00Z', closedAt: null, ...o });

test('ymd projette un instant UTC sur le jour civil de Paris', () => {
  assert.equal(ymd('2026-08-26T23:30:00Z'), '2026-08-27');
  assert.equal(ymd('2026-01-15T23:30:00Z'), '2026-01-16');
  assert.equal(ymd('2026-08-26T10:00:00Z'), '2026-08-26');
});

test('jour : clé identité, lendemain qui franchit le mois', () => {
  assert.equal(GRAN.day.key('2026-08-26'), '2026-08-26');
  assert.equal(GRAN.day.next('2026-02-28'), '2026-03-01');
  assert.equal(prevKey(GRAN.day, '2026-01-01'), '2025-12-31');
});

test('semaine : clé = lundi de la semaine, dimanche compris', () => {
  assert.equal(GRAN.week.key('2026-08-26'), '2026-08-24');
  assert.equal(GRAN.week.key('2026-08-24'), '2026-08-24');
  assert.equal(GRAN.week.key('2026-08-23'), '2026-08-17');
  assert.equal(GRAN.week.next('2026-08-24'), '2026-08-31');
  assert.equal(prevKey(GRAN.week, '2026-08-24'), '2026-08-17');
});

test('mois, trimestre, semestre, année : clés, bascule d’année, libellés', () => {
  assert.equal(GRAN.month.key('2026-12-05'), '2026-12');
  assert.equal(GRAN.month.next('2026-12'), '2027-01');
  assert.equal(GRAN.month.start('2026-12'), Date.UTC(2026, 11, 1));
  assert.equal(prevKey(GRAN.month, '2027-01'), '2026-12');
  assert.equal(GRAN.quarter.key('2026-08-26'), '2026-Q3');
  assert.equal(GRAN.quarter.next('2026-Q4'), '2027-Q1');
  assert.equal(GRAN.quarter.label('2026-Q3'), 'T3 2026');
  assert.equal(GRAN.semester.key('2026-06-30'), '2026-H1');
  assert.equal(GRAN.semester.key('2026-07-01'), '2026-H2');
  assert.equal(GRAN.semester.next('2026-H2'), '2027-H1');
  assert.equal(GRAN.semester.label('2026-H2'), 'S2 2026');
  assert.equal(GRAN.year.key('2026-08-26'), '2026');
  assert.equal(GRAN.year.next('2026'), '2027');
  assert.equal(prevKey(GRAN.year, '2026'), '2025');
});

test('tally compte Done / In Progress / le reste', () => {
  const t = tally([item({ status: 'Done' }), item({ status: 'In Progress' }), item({ status: 'Todo' }), item({ status: null })]);
  assert.deepEqual(t, { total: 4, done: 1, wip: 1, todo: 2 });
  assert.deepEqual(tally([]), { total: 0, done: 0, wip: 0, todo: 0 });
});

test('pctOf arrondit et survit à un total nul', () => {
  assert.equal(pctOf(1, 3), 33);
  assert.equal(pctOf(2, 3), 67);
  assert.equal(pctOf(0, 0), 0);
});

test('buckets par jour : périodes vides comblées, cumuls livrées / périmètre', () => {
  const items = [
    item({ createdAt: '2026-08-25T10:00:00Z', closedAt: '2026-08-26T09:00:00Z', status: 'Done' }),
    item({ createdAt: '2026-08-25T11:00:00Z', closedAt: '2026-08-28T09:00:00Z', status: 'Done' }),
    item({ createdAt: '2026-08-27T11:00:00Z' }),
  ];
  const b = buckets(items, GRAN.day, '2026-08-28');
  assert.deepEqual(b.map(x => x.key), ['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']);
  assert.deepEqual(b.map(x => x.closed), [0, 1, 0, 1]);
  assert.deepEqual(b.map(x => x.created), [2, 0, 1, 0]);
  assert.deepEqual(b.map(x => x.cumDone), [0, 1, 1, 2]);
  assert.deepEqual(b.map(x => x.cumScope), [2, 2, 3, 3]);
});

test('buckets par mois s’étendent jusqu’au mois courant même sans événement', () => {
  const b = buckets([item({ createdAt: '2026-06-21T10:00:00Z' })], GRAN.month, '2026-08-26');
  assert.deepEqual(b.map(x => x.key), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(b.map(x => x.cumScope), [1, 1, 1]);
});

test('buckets sans item rend une liste vide', () => {
  assert.deepEqual(buckets([], GRAN.day, '2026-08-26'), []);
});

test('periodStats compare chaque granularité à la période précédente', () => {
  const items = [
    item({ createdAt: '2026-08-20T10:00:00Z', closedAt: '2026-08-26T08:00:00Z', status: 'Done' }),
    item({ createdAt: '2026-08-20T10:00:00Z', closedAt: '2026-08-25T08:00:00Z', status: 'Done' }),
  ];
  const rows = Object.fromEntries(periodStats(items, '2026-08-26').map(r => [r.id, r]));
  assert.deepEqual(Object.keys(rows), ['day', 'week', 'month', 'quarter', 'semester', 'year']);
  assert.equal(rows.day.closed, 1); assert.equal(rows.day.prevClosed, 1); assert.equal(rows.day.created, 0);
  assert.equal(rows.week.closed, 2); assert.equal(rows.week.prevClosed, 0); assert.equal(rows.week.created, 0); assert.equal(rows.week.prevCreated, 2);
  assert.equal(rows.month.closed, 2); assert.equal(rows.month.created, 2); assert.equal(rows.month.prevClosed, 0);
  assert.equal(rows.year.closed, 2); assert.equal(rows.year.prevClosed, 0);
  assert.equal(rows.day.label, 'mercredi 26 août 2026');
  assert.equal(rows.quarter.label, 'trimestre 3 de 2026');
});

test('dueState : clos, en retard, proche, dans les temps, sans échéance', () => {
  const today = '2026-08-26';
  assert.equal(dueState({ state: 'closed', closedAt: '2026-08-25T10:00:00Z' }, { done: 3, total: 3 }, today).kind, 'closed');
  assert.deepEqual(dueState({ state: 'open', dueOn: '2026-08-25T07:00:00Z' }, { done: 1, total: 3 }, today), { kind: 'late', days: -1 });
  assert.deepEqual(dueState({ state: 'open', dueOn: '2026-09-05T07:00:00Z' }, { done: 1, total: 3 }, today), { kind: 'soon', days: 10 });
  assert.deepEqual(dueState({ state: 'open', dueOn: '2026-09-05T07:00:00Z' }, { done: 3, total: 3 }, today), { kind: 'due', days: 10 });
  assert.deepEqual(dueState({ state: 'open', dueOn: '2026-10-31T07:00:00Z' }, { done: 0, total: 3 }, today), { kind: 'due', days: 66 });
  assert.equal(dueState({ state: 'open', dueOn: null }, { done: 0, total: 3 }, today).kind, 'none');
});

test('closedInLastDays compte une fenêtre glissante incluant aujourd’hui', () => {
  const items = [
    item({ closedAt: '2026-08-26T08:00:00Z', status: 'Done' }),
    item({ closedAt: '2026-07-28T08:00:00Z', status: 'Done' }),
    item({ closedAt: '2026-07-27T08:00:00Z', status: 'Done' }),
    item({ closedAt: null }),
  ];
  assert.equal(closedInLastDays(items, '2026-08-26', 30), 2);
  assert.equal(closedInLastDays(items, '2026-08-26', 1), 1);
});

test('median : liste vide → null, sinon médiane haute', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
});

test('horizonOrder trie les horizons par première échéance, puis par nom', () => {
  const items = [
    item({ horizon: 'Échéance 31 janvier 2027', milestoneDue: '2027-01-31T07:00:00Z' }),
    item({ horizon: 'Échéance 31 octobre 2026', milestoneDue: '2026-10-31T07:00:00Z' }),
    item({ horizon: 'Échéance 25 août 2026', milestoneDue: '2026-08-25T07:00:00Z' }),
    item({ horizon: 'Sans date B', milestoneDue: null }),
    item({ horizon: 'Sans date A', milestoneDue: null }),
    item({ horizon: null, milestoneDue: '2026-01-01T07:00:00Z' }),
  ];
  assert.deepEqual(horizonOrder(items), ['Échéance 25 août 2026', 'Échéance 31 octobre 2026', 'Échéance 31 janvier 2027', 'Sans date A', 'Sans date B']);
});
