import { describe, expect, test } from 'bun:test';

import { resultatServi } from '@/test-support/served-pagination';

import { adminPageOf } from './admin-page';
import type { ApiResult } from './http';

/**
 * LES QUATRE PAGINATIONS SERVIES, RAMENÉES À UNE (#8876).
 *
 * Chaque témoin passe par `resultatServi` : ce que le TRANSPORT remet vraiment
 * (l'enveloppe dépaquetée, la pagination À CÔTÉ de `data`), jamais une
 * enveloppe entière que le décodeur retrouverait par hasard — c'est le défaut
 * que quatre décodeurs d'administration ont payé à la fois (#6862).
 */
type Row = { readonly id: string };
const decodeRow = (raw: unknown): Row | null =>
  typeof raw === 'object' && raw !== null && 'id' in raw && typeof raw.id === 'string' ? { id: raw.id } : null;

const page = (result: ApiResult<unknown>, shape: Parameters<typeof adminPageOf<Row>>[2]) => {
  const out = adminPageOf(result, decodeRow, shape);
  if (!out.ok) throw new Error('échec inattendu');
  return out.data;
};

describe('forme « top » — le tableau à la racine, la pagination à côté', () => {
  test('lit les lignes, le total et hasMore servis', () => {
    const served = resultatServi({ success: true, data: [{ id: 'a' }, { id: 'b' }], pagination: { total: 57, offset: 0, limit: 2, hasMore: true } });
    expect(page(served, { kind: 'top' })).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], total: 57, hasMore: true });
  });

  test('sans hasMore servi, il se calcule depuis l’offset — jamais depuis la seule longueur de page', () => {
    const milieu = resultatServi({ data: [{ id: 'a' }, { id: 'b' }], pagination: { total: 6, offset: 2, limit: 2 } });
    expect(page(milieu, { kind: 'top' }).hasMore).toBe(true);
    const fin = resultatServi({ data: [{ id: 'a' }, { id: 'b' }], pagination: { total: 4, offset: 2, limit: 2 } });
    expect(page(fin, { kind: 'top' }).hasMore).toBe(false);
  });

  test('sans pagination du tout : le total est la longueur, la fin de liste', () => {
    expect(page(resultatServi([{ id: 'a' }]), { kind: 'top' })).toEqual({ rows: [{ id: 'a' }], total: 1, hasMore: false });
  });
});

describe('forme « nested » — { [clé]: [...], pagination } dans data', () => {
  test('lit sous la clé donnée', () => {
    const served = resultatServi({ data: { reports: [{ id: 'r1' }], pagination: { total: 9, hasMore: true } } });
    expect(page(served, { kind: 'nested', key: 'reports' })).toEqual({ rows: [{ id: 'r1' }], total: 9, hasMore: true });
  });

  test('une clé absente rend une page vide, jamais une exception', () => {
    expect(page(resultatServi({ data: { autre: [] } }), { kind: 'nested', key: 'reports' })).toEqual({ rows: [], total: 0, hasMore: false });
  });
});

describe('forme « total-only » — { [clé]: [...], total } sans hasMore', () => {
  test('hasMore se déduit de l’offset', () => {
    const served = resultatServi({ data: { rows: [{ id: 'a' }, { id: 'b' }], total: 5 } });
    expect(page(served, { kind: 'total-only', key: 'rows' })).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], total: 5, hasMore: true });
    expect(page(served, { kind: 'total-only', key: 'rows', offset: 3 }).hasMore).toBe(false);
  });
});

describe('forme « page-based » — { total, page, limit, hasMore } par PAGE', () => {
  test('lit hasMore servi', () => {
    const served = resultatServi({ data: [{ id: 'c1' }], pagination: { total: 40, page: 2, limit: 20, hasMore: false } });
    expect(page(served, { kind: 'page-based' })).toEqual({ rows: [{ id: 'c1' }], total: 40, hasMore: false });
  });

  test('sans hasMore, l’offset se déduit de la page (pas d’`offset` dans cette forme)', () => {
    const milieu = resultatServi({ data: [{ id: 'c1' }, { id: 'c2' }], pagination: { total: 6, page: 2, limit: 2 } });
    expect(page(milieu, { kind: 'page-based' }).hasMore).toBe(true);
    const fin = resultatServi({ data: [{ id: 'c1' }, { id: 'c2' }], pagination: { total: 4, page: 2, limit: 2 } });
    expect(page(fin, { kind: 'page-based' }).hasMore).toBe(false);
  });
});

describe('les lignes illisibles sont écartées, jamais réparées', () => {
  test('une ligne sans identifiant disparaît ; le total reste celui du serveur', () => {
    const served = resultatServi({ data: [{ id: 'a' }, { nom: 'sans id' }, null, 42, { id: 'b' }], pagination: { total: 5, offset: 0, limit: 5 } });
    expect(page(served, { kind: 'top' })).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], total: 5, hasMore: false });
  });
});

describe('un échec traverse tel quel', () => {
  test('l’ApiFailure est rendue sans être touchée', () => {
    const echec: ApiResult<unknown> = { ok: false, status: 403, error: 'Accès refusé' };
    expect(adminPageOf(echec, decodeRow, { kind: 'top' })).toBe(echec);
  });
});
