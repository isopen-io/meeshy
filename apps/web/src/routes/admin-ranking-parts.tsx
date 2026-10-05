import type { ReactNode } from 'react';

import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminLoading } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE, TONE_COLOR, toneBackground } from '@/components/admin/tone';
import { formatCount } from '@/lib/admin/interpret/numbers';
import type { RankingRowView } from '@/lib/admin/ranking-view';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { PlainTh, Td } from '@/routes/admin-table';

/**
 * **LES PIÈCES DU CLASSEMENT** (#8876, #6730) — le rang, le podium des trois
 * premiers, le tableau des suivants (en cartes sous `md`), le squelette.
 *
 * Toute couleur est un jeton ; le rang porte son NUMÉRO en toutes lettres pour le
 * lecteur d'écran, la teinte du premier ne dit jamais seule qu'il est premier.
 */
const CARD = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;

export type RankingLabels = {
  /** En-tête de la colonne du nom (« Membre », « Conversation »…). */
  readonly entity: string;
  /** Le libellé du critère : il dit ce que la valeur compte. */
  readonly value: string;
  /** En-tête de la colonne d'instant (« Dernière activité », « Créé »). */
  readonly when: string;
  readonly creator: string;
};

function RankMark({ language, rank }: { readonly language: AdminLanguage; readonly rank: number }) {
  const first = rank === 1;
  return (
    <span
      role="img"
      data-admin-rank={rank}
      aria-label={translateAdmin(language, 'admin.ranking.rank', { rank: String(rank) })}
      className="grid size-9 shrink-0 place-items-center rounded-full font-bold tabular-nums"
      style={{ backgroundColor: toneBackground(first ? 'brand' : 'neutral'), color: first ? BRAND : TONE_COLOR.neutral }}
    >
      {rank}
    </span>
  );
}

function CreatorLine({ language, view, label }: { readonly language: AdminLanguage; readonly view: RankingRowView; readonly label: string }) {
  if (view.creator === null) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2">
      <span className="text-caption" style={{ color: INK2 }}>
        {label}
      </span>
      <AdminEntityChip language={language} entity={view.creator} size="sm" />
    </span>
  );
}

export function RankingPodium({
  language,
  views,
  labels,
  showValue,
  dimmed,
}: {
  readonly language: AdminLanguage;
  readonly views: readonly RankingRowView[];
  readonly labels: RankingLabels;
  readonly showValue: boolean;
  readonly dimmed: boolean;
}) {
  return (
    <section aria-labelledby="admin-ranking-podium" data-admin-ranking-podium aria-busy={dimmed} className="grid gap-3" style={{ opacity: dimmed ? 0.6 : 1 }}>
      <h2 id="admin-ranking-podium" className="text-title font-semibold" style={{ color: INK }}>
        {translateAdmin(language, 'admin.ranking.podium.title')}
      </h2>
      <ol className="grid grid-cols-1 gap-3 @xl:grid-cols-3 md:gap-4">
        {views.map((view) => (
          <li key={view.key} data-admin-podium={view.rank} className="grid min-w-0 content-start gap-3 rounded-card p-4 md:p-5" style={CARD}>
            <RankMark language={language} rank={view.rank} />
            <AdminEntityChip language={language} entity={view.entity} />
            <CreatorLine language={language} view={view} label={labels.creator} />
            {showValue && view.value !== null ? (
              <span className="grid gap-0.5">
                <span className="text-screen font-bold tabular-nums" style={{ color: INK }}>
                  {formatCount(view.value, language)}
                </span>
                <span className="text-caption" style={{ color: INK2 }}>
                  {labels.value}
                </span>
              </span>
            ) : null}
            {view.when === null ? null : (
              <span className="text-caption" style={{ color: INK2 }}>
                {labels.when} · <AdminMomentText moment={view.when} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RankingTable({
  language,
  views,
  labels,
  showValue,
  title,
  caption,
  dimmed,
}: {
  readonly language: AdminLanguage;
  readonly views: readonly RankingRowView[];
  readonly labels: RankingLabels;
  readonly showValue: boolean;
  readonly title: string;
  readonly caption: string;
  readonly dimmed: boolean;
}) {
  const hasCreator = views.some((view) => view.creator !== null);
  const hasWhen = views.some((view) => view.when !== null);
  const value = (view: RankingRowView): ReactNode => formatCount(view.value, language);

  return (
    <section aria-labelledby="admin-ranking-table" data-admin-ranking-table className="grid gap-3">
      <h2 id="admin-ranking-table" className="text-title font-semibold" style={{ color: INK }}>
        {title}
      </h2>

      <div className="hidden overflow-x-auto rounded-card @3xl:block" style={CARD}>
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <PlainTh>{translateAdmin(language, 'admin.ranking.col.rank')}</PlainTh>
              <PlainTh>{labels.entity}</PlainTh>
              {hasCreator ? <PlainTh>{labels.creator}</PlainTh> : null}
              {showValue ? <PlainTh className="text-end">{labels.value}</PlainTh> : null}
              {hasWhen ? <PlainTh>{labels.when}</PlainTh> : null}
            </tr>
          </thead>
          <tbody aria-busy={dimmed} style={{ opacity: dimmed ? 0.6 : 1 }}>
            {views.map((view) => (
              <tr key={view.key} data-admin-row={view.key} className="transition-colors hover:bg-[color-mix(in_srgb,var(--color-ios-ink-3)_6%,transparent)]" style={{ height: 52 }}>
                <Td>
                  <RankMark language={language} rank={view.rank} />
                </Td>
                <Td>
                  <AdminEntityChip language={language} entity={view.entity} />
                </Td>
                {hasCreator ? <Td>{view.creator === null ? '—' : <AdminEntityChip language={language} entity={view.creator} size="sm" />}</Td> : null}
                {showValue ? <Td className="text-end tabular-nums">{value(view)}</Td> : null}
                {hasWhen ? <Td>{view.when === null ? '—' : <AdminMomentText moment={view.when} />}</Td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 @3xl:hidden" aria-busy={dimmed} style={{ opacity: dimmed ? 0.6 : 1 }}>
        {views.map((view) => (
          <li key={view.key} data-admin-card={view.key} className="grid gap-3 rounded-card p-4" style={CARD}>
            <span className="flex min-w-0 items-center gap-3">
              <RankMark language={language} rank={view.rank} />
              <AdminEntityChip language={language} entity={view.entity} />
            </span>
            <dl className="grid gap-2">
              {view.creator === null ? null : (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-caption" style={{ color: INK2 }}>
                    {labels.creator}
                  </dt>
                  <dd className="min-w-0 break-words text-end text-body" style={{ color: INK }}>
                    <AdminEntityChip language={language} entity={view.creator} size="sm" />
                  </dd>
                </div>
              )}
              {showValue ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-caption" style={{ color: INK2 }}>
                    {labels.value}
                  </dt>
                  <dd className="text-end text-body font-semibold tabular-nums" style={{ color: INK }}>
                    {value(view)}
                  </dd>
                </div>
              ) : null}
              {view.when === null ? null : (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-caption" style={{ color: INK2 }}>
                    {labels.when}
                  </dt>
                  <dd className="text-end text-body" style={{ color: INK }}>
                    <AdminMomentText moment={view.when} />
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PLACEHOLDER = 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)';

/** Le squelette : trois cartes de podium et six rangées — la forme de ce qui va arriver, jamais un spinner. */
export function RankingSkeleton({ language }: { readonly language: AdminLanguage }) {
  return (
    <AdminLoading language={language} anchor="ranking-skeleton" className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="rounded-card" style={{ height: 152, backgroundColor: PLACEHOLDER }} />
        ))}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, slot) => (
          <div key={slot} className="rounded-card" style={{ height: 52, backgroundColor: PLACEHOLDER }} />
        ))}
      </div>
    </AdminLoading>
  );
}
