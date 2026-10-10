import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { BRAND, EDGE, INK, INK2, SURFACE } from './tone';

/** 44 px : la cible tactile minimale (WCAG 2.5.5) — le choix de taille de page n'y fait pas exception. */
const FIELD = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND } as const;

const STEP = { minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK, outlineColor: BRAND } as const;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * **LE PIED D'UNE LISTE PAGINÉE PAR OFFSET** (#7873, repris par le kit en #9463) — l'intervalle
 * servi, la taille de page, Précédents / Suivants. Toutes les listes d'administration sont courtes
 * et paginées par offset : une même pagination pour toutes, jamais la mécanique sans fin du fil.
 */
export function AdminPager({
  language,
  offset,
  limit,
  count,
  total,
  hasMore,
  pageSizes,
  onPage,
}: {
  readonly language: AdminLanguage;
  readonly offset: number;
  readonly limit: number;
  readonly count: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly pageSizes: readonly number[];
  readonly onPage: (page: { readonly offset?: number; readonly limit?: number }) => void;
}) {
  const step = `rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${FOCUS}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-caption tabular-nums" style={{ color: INK2 }} data-admin-list-range>
        {translateAdmin(language, 'admin.list.range', {
          from: String(count === 0 ? 0 : offset + 1),
          to: String(offset + count),
          total: String(total),
        })}
      </p>
      {/* `flex-wrap` : à 375 px les trois contrôles (taille de page, précédent, suivant) mesuraient
          349 px dans une colonne de 343 px — la page débordait. Ils passent à la ligne. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.list.pageSize')}
          <select
            value={String(limit)}
            data-admin-page-size
            onChange={(event) => onPage({ limit: Number(event.target.value) })}
            className={`rounded-chip px-2 text-body ${FOCUS}`}
            style={FIELD}
          >
            {pageSizes.map((taille) => (
              <option key={taille} value={String(taille)}>
                {taille}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-admin-list-prev disabled={offset === 0} onClick={() => onPage({ offset: offset - limit })} className={step} style={STEP}>
          {translateAdmin(language, 'admin.users.previous')}
        </button>
        <button type="button" data-admin-list-next disabled={!hasMore} onClick={() => onPage({ offset: offset + limit })} className={step} style={STEP}>
          {translateAdmin(language, 'admin.users.next')}
        </button>
      </div>
    </div>
  );
}
