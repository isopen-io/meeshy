import type { ReactNode } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminMomentText } from '@/components/admin/meta';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE, TONE_COLOR } from '@/components/admin/tone';
import { formatDuration } from '@/lib/admin/interpret/time';
import type { AdminMoment, Interpreted } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { PlainTh, Td } from '@/routes/admin-table';

/**
 * **LES PIÈCES DE LA SUPERVISION** (#8876, #6734) — un bloc titré, le bouton
 * « Actualiser », la carte d'une dépendance, le tableau d'usage (en cartes sous
 * `md`). Toute couleur est un jeton ; un état porte toujours son mot.
 */
const CARD = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

export function MonitoringSection({
  id,
  title,
  hint,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`admin-monitoring-${id}`} data-admin-monitoring-section={id} className="grid gap-3">
      <div className="grid gap-1">
        <h2 id={`admin-monitoring-${id}`} className="text-title font-semibold" style={{ color: INK }}>
          {title}
        </h2>
        {hint === undefined ? null : (
          <p className="text-caption" style={{ color: INK2 }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function RefreshButton({ language, busy, onRefresh }: { readonly language: AdminLanguage; readonly busy: boolean; readonly onRefresh: () => void }) {
  return (
    <button
      type="button"
      data-admin-action="refresh"
      disabled={busy}
      aria-busy={busy}
      onClick={onRefresh}
      className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-medium disabled:opacity-60 ${FOCUS}`}
      style={{ minHeight: 44, color: BRAND, border: `1px solid ${EDGE}`, backgroundColor: SURFACE, outlineColor: BRAND }}
    >
      <AdminGlyph name="arrowClockwise" size={16} />
      {translateAdmin(language, busy ? 'admin.monitoring.refreshing' : 'admin.monitoring.refresh')}
    </button>
  );
}


/**
 * **LA CARTE D'UNE DÉPENDANCE** (base de données, Redis) — son état en MOT (badge
 * interprété : « Opérationnel », « Hors service »), son temps de réponse, ou
 * « Aucune réponse ». Une dépendance tombée n'a pas de latence : `—`, jamais 0 ms.
 */
export function ServiceCard({
  language,
  anchor,
  title,
  status,
  latencyMs,
}: {
  readonly language: AdminLanguage;
  readonly anchor: string;
  readonly title: string;
  readonly status: Interpreted;
  readonly latencyMs: number | null;
}) {
  return (
    <div data-admin-service={anchor} className="grid gap-2 rounded-card p-4 md:p-5" style={CARD}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption" style={{ color: INK2 }}>
          {title}
        </span>
        <AdminInterpretedBadge value={status} />
      </span>
      <span className="text-screen font-bold tabular-nums" style={{ color: INK }}>
        {latencyMs === null ? '—' : formatDuration(latencyMs, 'ms', language)}
      </span>
      <span className="text-caption" style={{ color: INK3 }}>
        {translateAdmin(language, latencyMs === null ? 'admin.monitoring.dependency.noAnswer' : 'admin.monitoring.dependency.latency')}
      </span>
    </div>
  );
}

export type UsageColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: 'start' | 'end';
  /** La colonne qui NOMME la ligne : elle ouvre la carte, sous `md`. */
  readonly primary?: true;
};

/**
 * Un tableau d'usage : `<table>` dès `md`, liste de CARTES dessous (colonne primaire
 * en tête, les autres en `dl`). `dimmed` atténue la page précédente pendant qu'une
 * relecture arrive — jamais un spinner sur des données déjà reçues.
 */
export function UsageTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  anchor,
  dimmed = false,
}: {
  readonly caption: string;
  readonly columns: readonly UsageColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly anchor: string;
  readonly dimmed?: boolean;
}) {
  const primary = columns.find((column) => column.primary === true);

  return (
    <div data-admin-usage-table={anchor}>
      <div className="hidden overflow-x-auto rounded-card @3xl:block" style={CARD}>
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <PlainTh key={column.id} className={column.align === 'end' ? 'text-end' : ''}>
                  {column.header}
                </PlainTh>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={dimmed} style={{ opacity: dimmed ? 0.6 : 1 }}>
            {rows.map((row) => (
              <tr key={rowKey(row)} data-admin-row={rowKey(row)} className="transition-colors hover:bg-[color-mix(in_srgb,var(--color-ios-ink-3)_6%,transparent)]" style={{ minHeight: 52 }}>
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

      <ul className="grid gap-3 @3xl:hidden" aria-busy={dimmed} style={{ opacity: dimmed ? 0.6 : 1 }}>
        {rows.map((row) => (
          <li key={rowKey(row)} data-admin-card={rowKey(row)} className="grid gap-3 rounded-card p-4" style={CARD}>
            {primary === undefined ? null : <div className="min-w-0 break-words text-body font-medium">{primary.cell(row)}</div>}
            <dl className="grid gap-2">
              {columns
                .filter((column) => column.primary !== true)
                .map((column) => (
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

/** Une route : en chasse fixe, qui passe à la ligne n'importe où — jamais tronquée ni en défilement horizontal. */
export function RouteText({ route }: { readonly route: string }) {
  return (
    <code className="font-mono text-caption" style={{ color: INK, overflowWrap: 'anywhere' }}>
      {route}
    </code>
  );
}

export function MethodText({ method }: { readonly method: string }) {
  return (
    <span className="font-mono text-caption font-semibold" style={{ color: TONE_COLOR.neutral }}>
      {method}
    </span>
  );
}

export function LastSeen({ moment, never }: { readonly moment: AdminMoment | null; readonly never: string }) {
  return moment === null ? <span>{never}</span> : <AdminMomentText moment={moment} />;
}
