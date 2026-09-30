import type { ReactNode } from 'react';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { EDGE, INK, INK2, INK3, SURFACE } from '@/components/admin/tone';
import { accuracyConfidenceText, accuracyQuality, growthView, languageTitle, pairConfidenceText, pairLabel } from '@/lib/admin/languages-view';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import type { LanguagePair, LanguageRow, TranslationAccuracyRow } from '@/lib/api/admin-languages';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { PlainTh, Td } from '@/routes/admin-table';

type StaticColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: 'start' | 'end';
};

/**
 * **UN PETIT TABLEAU SANS FICHE** (#8876, #6728) — les langues, les paires, la
 * précision : dix lignes au plus, aucune ne mène à une fiche (une langue n'est pas
 * une entité d'administration), donc ni pagination, ni tri, ni lien. Même idiome
 * que `AdminEntityList` : un tableau dès `md`, des CARTES dessous (la première
 * colonne en titre, les autres en `dl`).
 */
function StaticTable<Row>({
  id,
  caption,
  columns,
  rows,
  rowKey,
}: {
  readonly id: string;
  readonly caption: string;
  readonly columns: readonly StaticColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
}) {
  const [first, ...rest] = columns;

  return (
    <div data-admin-static-table={id} className="grid gap-3">
      <div className="hidden overflow-x-auto rounded-card md:block" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <PlainTh key={column.id} className={column.align === 'end' ? 'text-end' : 'text-start'}>
                  {column.header}
                </PlainTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} data-admin-static-row={rowKey(row)} style={{ minHeight: 52 }}>
                {columns.map((column) => (
                  <Td key={column.id} className={column.align === 'end' ? 'text-end tabular-nums' : ''}>
                    {column.cell(row)}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} data-admin-static-card={rowKey(row)} className="grid gap-2 rounded-card p-4" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
            {first === undefined ? null : (
              <div className="min-w-0 break-words text-body font-semibold" style={{ color: INK }}>
                {first.cell(row)}
              </div>
            )}
            <dl className="grid gap-2">
              {rest.map((column) => (
                <div key={column.id} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-caption" style={{ color: INK2 }}>
                    {column.header}
                  </dt>
                  <dd className="min-w-0 break-words text-end text-body" style={{ color: INK }}>
                    {column.cell(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** « +12 % » avec sa flèche ; aucune donnée se dit « — », jamais un « 0 % » fabriqué. */
function Growth({ language, growth }: { readonly language: AdminLanguage; readonly growth: number | null }) {
  const view = growthView(growth, language);
  return view === null ? <span style={{ color: INK3 }}>—</span> : <AdminBadge tone={view.tone} glyph={view.glyph}>{view.text}</AdminBadge>;
}

/** Le détail par langue : messages, auteurs (comptes, sans les invités), part (0–100) et évolution. */
export function LanguagesDetailTable({ language, rows }: { readonly language: AdminLanguage; readonly rows: readonly LanguageRow[] }) {
  return (
    <div className="grid gap-2">
      <StaticTable
        id="languages"
        caption={translateAdmin(language, 'admin.lang.detail.caption')}
        rows={rows}
        rowKey={(row) => row.code}
        columns={[
          {
            id: 'language',
            header: translateAdmin(language, 'admin.lang.detail.language'),
            cell: (row) => <span className="font-medium">{languageTitle(row.code, language)}</span>,
          },
          { id: 'messages', header: translateAdmin(language, 'admin.lang.detail.messages'), align: 'end', cell: (row) => formatCount(row.messageCount, language) },
          { id: 'authors', header: translateAdmin(language, 'admin.lang.detail.authors'), align: 'end', cell: (row) => formatCount(row.userCount, language) },
          { id: 'share', header: translateAdmin(language, 'admin.lang.detail.share'), align: 'end', cell: (row) => formatPercent(row.percentage, 'hundred', language) },
          { id: 'growth', header: translateAdmin(language, 'admin.lang.detail.growth'), align: 'end', cell: (row) => <Growth language={language} growth={row.growth} /> },
        ]}
      />
      <p className="px-1 text-caption" style={{ color: INK3 }}>
        {translateAdmin(language, 'admin.lang.detail.note')}
      </p>
    </div>
  );
}

/** Les paires de la période : la confiance est servie en PART (0–1). */
export function LanguagePairsTable({ language, rows }: { readonly language: AdminLanguage; readonly rows: readonly LanguagePair[] }) {
  return (
    <StaticTable
      id="pairs"
      caption={translateAdmin(language, 'admin.lang.pairs.caption')}
      rows={rows}
      rowKey={(row) => `${row.from}>${row.to}`}
      columns={[
        { id: 'pair', header: translateAdmin(language, 'admin.lang.pairs.pair'), cell: (row) => <span className="font-medium">{pairLabel(row.from, row.to, language)}</span> },
        { id: 'translations', header: translateAdmin(language, 'admin.lang.pairs.translations'), align: 'end', cell: (row) => formatCount(row.translationCount, language) },
        { id: 'confidence', header: translateAdmin(language, 'admin.lang.pairs.confidence'), align: 'end', cell: (row) => pairConfidenceText(row.avgConfidence, language) },
      ]}
    />
  );
}

/** La précision : la confiance est servie en POURCENTAGE (0–100) — l'autre échelle — et la qualité se lit en mot. */
export function TranslationAccuracyTable({ language, rows }: { readonly language: AdminLanguage; readonly rows: readonly TranslationAccuracyRow[] }) {
  return (
    <StaticTable
      id="accuracy"
      caption={translateAdmin(language, 'admin.lang.accuracy.caption')}
      rows={rows}
      rowKey={(row) => `${row.from}>${row.to}`}
      columns={[
        { id: 'pair', header: translateAdmin(language, 'admin.lang.pairs.pair'), cell: (row) => <span className="font-medium">{pairLabel(row.from, row.to, language)}</span> },
        { id: 'translations', header: translateAdmin(language, 'admin.lang.pairs.translations'), align: 'end', cell: (row) => formatCount(row.translationCount, language) },
        { id: 'confidence', header: translateAdmin(language, 'admin.lang.pairs.confidence'), align: 'end', cell: (row) => accuracyConfidenceText(row.avgConfidence, language) },
        { id: 'quality', header: translateAdmin(language, 'admin.lang.accuracy.quality'), align: 'end', cell: (row) => <AdminInterpretedBadge value={accuracyQuality(row, language)} /> },
      ]}
    />
  );
}
