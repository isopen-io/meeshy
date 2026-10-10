import { describe, expect, test } from 'bun:test';

import { parseListState, serializeListState, toggleSort, withFilter, withIdFilter } from './list-state';
import { REPORT_LIST_SPEC, reportListQuery, type ReportListState } from './report-list';

/**
 * **LA LISTE DES SIGNALEMENTS** (#8876, #6726) — ce que l'adresse peut porter
 * (liste blanche) et ce que la passerelle reçoit. Les clés de tri sont EXACTEMENT
 * celles de `REPORT_SORT_KEYS` (`routes/admin/reports.ts`) ; une autre retomberait
 * sur `createdAt` côté serveur, et un écran qui l'offrirait promettrait un tri
 * qui n'a pas lieu.
 */

const NOW = new Date('2026-09-30T12:00:00.000Z');
const parse = (search: string): ReportListState => parseListState(new URLSearchParams(search), REPORT_LIST_SPEC);
const OBJECT_ID = '64f1c2a9e8b7d6c5b4a39281';

describe('REPORT_LIST_SPEC — la liste blanche de l’adresse', () => {
  test('le tri par défaut est la réception, la plus récente d’abord ; trois clés, pas une de plus', () => {
    const state = parse('');

    expect(REPORT_LIST_SPEC.sortKeys).toEqual(['createdAt', 'updatedAt', 'resolvedAt']);
    expect(state.sort).toBe('createdAt');
    expect(state.order).toBe('desc');
  });

  test('une clé de tri inconnue retombe sur la réception, jamais transmise', () => {
    expect(parse('sort=reporterName').sort).toBe('createdAt');
  });

  test('les cinq filtres connus passent, une valeur inconnue est ignorée', () => {
    const state = parse('status=under_review&reportType=hate_speech&reportedType=story&assigned=me&period=7d');

    expect(state.filters).toEqual({ status: 'under_review', reportType: 'hate_speech', reportedType: 'story', assigned: 'me', period: '7d' });
    expect(parse('status=archived&reportType=typo&reportedType=video&assigned=all&period=1y').filters).toEqual({});
  });

  test('reportedEntityId n’est accepté qu’avec la forme d’un identifiant, sinon ignoré', () => {
    expect(parse(`reportedEntityId=${OBJECT_ID}`).ids).toEqual({ reportedEntityId: OBJECT_ID });
    expect(parse('reportedEntityId=../../etc').ids).toEqual({});
  });

  test('l’état se réécrit dans l’adresse : tri, filtre, identifiant', () => {
    const sorted = toggleSort(parse(''), 'resolvedAt', REPORT_LIST_SPEC);
    const filtered = withFilter(sorted, 'status', 'pending', REPORT_LIST_SPEC);
    const scoped = withIdFilter(filtered, 'reportedEntityId', OBJECT_ID, REPORT_LIST_SPEC);

    const address = serializeListState(scoped, REPORT_LIST_SPEC).toString();

    expect(parse(address)).toEqual(scoped);
    expect(address).toContain('status=pending');
    expect(address).toContain('sort=resolvedAt');
  });

  test('aucune recherche n’est portée : la passerelle ne cherche pas dans les signalements', () => {
    expect('q' in REPORT_LIST_SPEC).toBe(false);
  });
});

describe('reportListQuery — ce que la passerelle reçoit', () => {
  test('pagine par offset et passe le tri et l’ordre', () => {
    const query = reportListQuery({ ...parse('sort=updatedAt&order=asc&limit=50&offset=100'), offset: 100 }, NOW);

    expect(query.get('offset')).toBe('100');
    expect(query.get('limit')).toBe('50');
    expect(query.get('sortBy')).toBe('updatedAt');
    expect(query.get('sortOrder')).toBe('asc');
  });

  test('ne pose que les filtres présents', () => {
    const query = reportListQuery(parse('status=pending&assigned=none'), NOW);

    expect(query.get('status')).toBe('pending');
    expect(query.get('assigned')).toBe('none');
    expect(query.has('reportType')).toBe(false);
    expect(query.has('reportedType')).toBe(false);
    expect(query.has('createdAfter')).toBe(false);
    expect(query.has('reportedEntityId')).toBe(false);
  });

  test('la période devient createdAfter, calculée sur l’horloge injectée', () => {
    expect(reportListQuery(parse('period=24h'), NOW).get('createdAfter')).toBe('2026-09-29T12:00:00.000Z');
    expect(reportListQuery(parse('period=7d'), NOW).get('createdAfter')).toBe('2026-09-23T12:00:00.000Z');
    expect(reportListQuery(parse('period=90d'), NOW).get('createdAfter')).toBe('2026-07-02T12:00:00.000Z');
  });

  test('passe reportedEntityId tel quel', () => {
    expect(reportListQuery(parse(`reportedEntityId=${OBJECT_ID}`), NOW).get('reportedEntityId')).toBe(OBJECT_ID);
  });

  test('ne transmet jamais de paramètre de recherche', () => {
    expect(reportListQuery(parse('q=secret&status=pending'), NOW).has('search')).toBe(false);
  });
});
