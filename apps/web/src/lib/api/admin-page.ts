import { asCount, asRecord } from './admin';
import type { ApiResult } from './http';

/**
 * **UNE PAGE D'ADMINISTRATION, QUELLE QUE SOIT SA FORME SERVIE** (#8876) — le
 * site UNIQUE où les quatre pagination que la passerelle sert se ramènent à une
 * seule : `{ rows, total, hasMore }`.
 *
 * | forme | charge |
 * |---|---|
 * | `top` | `data` est le TABLEAU ; la pagination est à côté, sur l'`ApiResult` (`sendPaginatedSuccess`) |
 * | `nested` | `data = { [clé]: [...], pagination: { total, hasMore } }` |
 * | `total-only` | `data = { [clé]: [...], total }` — sans `hasMore` : il se déduit de l'offset |
 * | `page-based` | `data` tableau, pagination `{ total, page, limit, hasMore }` (par PAGE, pas par offset) |
 *
 * **Une ligne illisible est ÉCARTÉE, jamais « réparée »** : un décodeur qui
 * fabriquerait un nom ou un identifiant pour garder la ligne afficherait une
 * personne qui n'existe pas. `total` reste celui du serveur (il compte aussi la
 * ligne écartée) — la liste ne prétend pas qu'elle est plus courte qu'elle n'est.
 */
export type AdminPage<Row> = {
  readonly rows: readonly Row[];
  readonly total: number;
  readonly hasMore: boolean;
};

export type AdminPageShape =
  | { readonly kind: 'top' }
  | { readonly kind: 'nested'; readonly key: string }
  | { readonly kind: 'total-only'; readonly key: string; readonly offset?: number }
  | { readonly kind: 'page-based' };

type Served = { readonly rows: readonly unknown[]; readonly meta: Readonly<Record<string, unknown>>; readonly offset: number };

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function served(result: { readonly data: unknown; readonly pagination?: unknown }, shape: AdminPageShape): Served {
  const payload = asRecord(result.data);
  const sibling = asRecord(result.pagination) ?? {};

  switch (shape.kind) {
    case 'top':
      return { rows: listOf(result.data), meta: sibling, offset: asCount(sibling.offset) };
    case 'page-based': {
      const limit = asCount(sibling.limit);
      const page = Math.max(1, asCount(sibling.page));
      return { rows: listOf(result.data), meta: sibling, offset: (page - 1) * limit };
    }
    case 'nested': {
      const meta = asRecord(payload?.pagination) ?? sibling;
      return { rows: listOf(payload?.[shape.key]), meta, offset: asCount(meta.offset) };
    }
    case 'total-only':
      return { rows: listOf(payload?.[shape.key]), meta: { total: payload?.total }, offset: shape.offset ?? 0 };
  }
}

export function adminPageOf<Row>(
  result: ApiResult<unknown>,
  decodeRow: (raw: unknown) => Row | null,
  shape: AdminPageShape,
): ApiResult<AdminPage<Row>> {
  if (!result.ok) return result;

  const { rows: raw, meta, offset } = served(result, shape);
  const rows = raw.flatMap((entry) => {
    const row = decodeRow(entry);
    return row === null ? [] : [row];
  });

  const total = asCount(meta.total) || rows.length;
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + raw.length < total;

  return { ok: true, data: { rows, total, hasMore }, ...(result.status === undefined ? {} : { status: result.status }) };
}
