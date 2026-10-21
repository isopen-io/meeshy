import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import type { AdminDeps } from '@/lib/api/admin';
import { adminSeasonsQueryKey, loadAdminSeasons, type AdminSeasonList, type AdminSeasonRow } from '@/lib/api/admin-game-seasons';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { SeasonEditor } from '@/routes/admin-game-seasons-editor';
import { ExportSection } from '@/routes/admin-game-seasons-export';
import { longDay, themeLabel } from '@/routes/admin-game-seasons-fields';
import { ProposalsSection } from '@/routes/admin-game-seasons-proposals';

/**
 * **JEU — SAISONS** (#10232, #10233) — le calendrier des saisons servi par la passerelle, à piloter : la liste des
 * saisons (passée, en cours, à venir, en pause ; une saison qui n'est plus à venir est grisée et ne se modifie pas),
 * le formulaire d'une saison à venir, la proposition de l'IA (en attente d'un humain) et l'export App Store.
 */

const WINDOW = 12;

const TENSE_TONE = { past: 'neutral', current: 'success', upcoming: 'info' } as const;

function SeasonState({ language, row }: { readonly language: AdminLanguage; readonly row: AdminSeasonRow }) {
  if (row.status === 'paused') return <AdminBadge tone="warning" glyph="clock" anchor="season-paused">{translateAdmin(language, 'admin.gameSeasons.status.paused')}</AdminBadge>;
  return (
    <AdminBadge tone={TENSE_TONE[row.tense]} anchor={`season-${row.tense}`}>
      {translateAdmin(language, `admin.gameSeasons.tense.${row.tense}`)}
    </AdminBadge>
  );
}

function SeasonsList({
  language,
  list,
  selected,
  onSelect,
}: {
  readonly language: AdminLanguage;
  readonly list: AdminSeasonList;
  readonly selected: number | null;
  readonly onSelect: (number: number) => void;
}) {
  const columns: readonly AdminColumn<AdminSeasonRow>[] = [
    {
      id: 'number',
      header: translateAdmin(language, 'admin.gameSeasons.col.number'),
      primary: true,
      cell: (row) => (
        <span className="font-semibold" style={row.editable ? undefined : { color: INK2 }}>
          {translateAdmin(language, 'admin.gameSeasons.season', { number: String(row.number) })}
          {row.explicit ? null : <span className="ms-2 text-caption font-normal" style={{ color: INK2 }}>{translateAdmin(language, 'admin.gameSeasons.derived')}</span>}
        </span>
      ),
    },
    {
      id: 'dates',
      header: translateAdmin(language, 'admin.gameSeasons.col.dates'),
      cell: (row) => (
        <span style={row.editable ? undefined : { color: INK2 }}>
          {row.status === 'paused' || row.endDay === null
            ? translateAdmin(language, 'admin.gameSeasons.noDates')
            : translateAdmin(language, 'admin.gameSeasons.dates', { start: longDay(row.startDay, language), end: longDay(row.endDay, language) })}
        </span>
      ),
    },
    { id: 'state', header: translateAdmin(language, 'admin.gameSeasons.col.state'), cell: (row) => <SeasonState language={language} row={row} /> },
    { id: 'theme', header: translateAdmin(language, 'admin.gameSeasons.col.theme'), priority: 3, cell: (row) => themeLabel(row.themeKey, language) },
    {
      id: 'points',
      header: translateAdmin(language, 'admin.gameSeasons.col.points'),
      priority: 3,
      cell: (row) => translateAdmin(language, 'admin.gameSeasons.pointsValue', { points: String(row.stepPoints) }),
    },
    {
      id: 'actions',
      header: translateAdmin(language, 'admin.gameSeasons.col.actions'),
      align: 'end',
      priority: 1,
      cell: (row) =>
        row.editable ? (
          <AdminButton
            tone={selected === row.number ? 'primary' : 'secondary'}
            label={translateAdmin(language, 'admin.gameSeasons.editFor', { number: String(row.number) })}
            onClick={() => onSelect(row.number)}
            data={{ 'data-gameseasons-edit': String(row.number) }}
          >
            {translateAdmin(language, 'admin.gameSeasons.edit')}
          </AdminButton>
        ) : (
          <span className="text-caption" style={{ color: INK2 }} title={translateAdmin(language, 'admin.gameSeasons.lockedNote')} data-gameseasons-locked={row.number}>
            {translateAdmin(language, 'admin.gameSeasons.locked')}
          </span>
        ),
    },
  ];

  return (
    <AdminResponsiveRows
      columns={columns}
      rows={list.seasons}
      rowKey={(row) => String(row.number)}
      caption={translateAdmin(language, 'admin.gameSeasons.list.caption')}
      rowAttributes={(row) => ({
        'data-gameseasons-row': String(row.number),
        'data-gameseasons-tense': row.tense,
        'data-gameseasons-row-status': row.status,
        'data-gameseasons-editable': String(row.editable),
        ...(row.editable ? {} : { 'aria-disabled': 'true' }),
      })}
    />
  );
}

export function AdminGameSeasonsPanel({ language, deps }: { readonly language: AdminLanguage; readonly deps: AdminDeps }) {
  const [from, setFrom] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const query = useQuery({
    queryKey: [...adminSeasonsQueryKey(), from],
    queryFn: async ({ signal }) => {
      const result = await loadAdminSeasons({ ...deps, from, count: WINDOW, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const list = query.data;
  const row = list?.seasons.find((candidate) => candidate.number === selected);

  return (
    <div className="grid gap-4" data-admin-game-seasons>
      <AdminFicheSection id="gameseasons-list" title={translateAdmin(language, 'admin.gameSeasons.list.title')}>
        {list !== undefined ? (
          <>
            <p className="text-caption" style={{ color: INK2 }} data-gameseasons-revision={list.revision}>
              {translateAdmin(language, 'admin.gameSeasons.revision', { revision: String(list.revision) })} · {translateAdmin(language, 'admin.gameSeasons.today', { date: longDay(list.now.dayKey, language) })}
            </p>
            <SeasonsList language={language} list={list} selected={selected} onSelect={setSelected} />
            <div className="flex flex-wrap justify-between gap-3">
              <AdminButton disabled={from <= 1} onClick={() => setFrom(Math.max(1, from - WINDOW))} data={{ 'data-gameseasons-previous': '' }}>
                {translateAdmin(language, 'admin.gameSeasons.list.previous')}
              </AdminButton>
              <AdminButton disabled={list.seasons.length < WINDOW} onClick={() => setFrom(from + WINDOW)} data={{ 'data-gameseasons-next': '' }}>
                {translateAdmin(language, 'admin.gameSeasons.list.next')}
              </AdminButton>
            </div>
          </>
        ) : query.isPending ? (
          <AdminSkeleton rows={4} />
        ) : (
          <div data-gameseasons-load-failed>
            <AdminErrorState language={language} message={translateAdmin(language, 'admin.gameSeasons.loadFailed')} onRetry={() => void query.refetch()} />
          </div>
        )}
      </AdminFicheSection>

      {list !== undefined && row !== undefined && row.editable ? (
        <SeasonEditor key={row.number} language={language} deps={deps} list={list} row={row} onClose={() => setSelected(null)} />
      ) : null}

      <ProposalsSection language={language} deps={deps} list={list} />
      <ExportSection language={language} deps={deps} />
    </div>
  );
}
