import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ENGAGEMENT_AXES, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScaleDocument } from '@meeshy/shared/types/engagement-scale';
import { engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';

import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { AdminErrorState } from '@/components/admin/states';
import { adminMoment } from '@/lib/admin/format';
import {
  MULTIPLIER_FIELDS,
  draftOf,
  scaleOfDraft,
  withAddedLevelCap,
  withLevelCap,
  withMultiplier,
  withOperation,
  withoutLevelCap,
  type MultiplierField,
  type ScaleDraft,
} from '@/lib/admin/engagement-scale-form';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_ENGAGEMENT_SCALE_QUERY_KEY,
  loadEngagementScale,
  saveEngagementScale,
} from '@/lib/api/admin-engagement-scale';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';

/**
 * LE BARÈME DE POINTS (#8906) — chaque opération (axe d'engagement) avec ses
 * points, son « multiplié », son plafond journalier par conversation ; les
 * règles du multiplicateur ; le plafond par niveau.
 *
 * Le brouillon est validé ICI par la loi partagée avant tout `PUT`
 * (`scaleOfDraft` → `parseEngagementScale`) : un barème invalide ne part pas.
 * Un refus serveur est montré tel qu'il est dit.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const SURFACE = 'var(--color-ios-surface)';
const EDGE = 'var(--color-edge)';
const BRAND = 'var(--color-ios-brand)';

const FIELD = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK } as const;
const FIELD_CLASS = 'w-24 rounded-chip px-3 text-body tabular-nums';

const MULTIPLIER_LABELS: Readonly<Record<MultiplierField, AdminPlainCatalogKey>> = {
  windowDays: 'admin.scale.field.windowDays',
  stepPerExtraFamily: 'admin.scale.field.stepPerExtraFamily',
  standingBonus: 'admin.scale.field.standingBonus',
  achievementsForStanding: 'admin.scale.field.achievementsForStanding',
  highBadgeThreshold: 'admin.scale.field.highBadgeThreshold',
  highBadgesForStanding: 'admin.scale.field.highBadgesForStanding',
  maxFactor: 'admin.scale.field.maxFactor',
};

function NumberField({
  value,
  label,
  placeholder,
  onChange,
  data,
}: {
  readonly value: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
  readonly data: Readonly<Record<string, string>>;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      aria-label={label}
      {...(placeholder === undefined ? {} : { placeholder })}
      onInput={(event) => onChange(event.currentTarget.value)}
      className={FIELD_CLASS}
      style={FIELD}
      {...data}
    />
  );
}

function OperationsTable({
  language,
  draft,
  onChange,
}: {
  readonly language: AdminLanguage;
  readonly draft: ScaleDraft;
  readonly onChange: (axis: EngagementAxisKey, patch: Partial<ScaleDraft['operations'][EngagementAxisKey]>) => void;
}) {
  const columns: readonly AdminColumn<EngagementAxisKey>[] = [
    {
      id: 'operation',
      header: translateAdmin(language, 'admin.scale.col.operation'),
      primary: true,
      cell: (axis) => <span className="min-w-0 break-words text-start text-body font-medium">{engagementAxisLabel(language, axis)}</span>,
    },
    {
      id: 'points',
      header: translateAdmin(language, 'admin.scale.col.points'),
      cell: (axis) => (
        <NumberField
          value={draft.operations[axis].points}
          label={translateAdmin(language, 'admin.scale.pointsFor', { operation: engagementAxisLabel(language, axis) })}
          onChange={(points) => onChange(axis, { points })}
          data={{ 'data-scale-points': axis }}
        />
      ),
    },
    {
      id: 'multiplied',
      header: translateAdmin(language, 'admin.scale.col.multiplied'),
      cell: (axis) => (
        /* La case fait 24 px ; sa zone d'appui, le libellé qui l'enveloppe, en fait 44. */
        <label className="inline-flex items-center justify-center" style={{ minHeight: 44, minWidth: 44 }}>
          <input
            type="checkbox"
            checked={draft.operations[axis].multiplied}
            aria-label={translateAdmin(language, 'admin.scale.multipliedFor', { operation: engagementAxisLabel(language, axis) })}
            onChange={(event) => onChange(axis, { multiplied: event.currentTarget.checked })}
            data-scale-multiplied={axis}
            style={{ height: 24, width: 24, accentColor: BRAND }}
          />
        </label>
      ),
    },
    {
      id: 'cap',
      header: translateAdmin(language, 'admin.scale.col.cap'),
      cell: (axis) => (
        <NumberField
          value={draft.operations[axis].dailyCap}
          label={translateAdmin(language, 'admin.scale.capFor', { operation: engagementAxisLabel(language, axis) })}
          placeholder={translateAdmin(language, 'admin.scale.cap.none')}
          onChange={(dailyCap) => onChange(axis, { dailyCap })}
          data={{ 'data-scale-cap': axis }}
        />
      ),
    },
  ];

  return (
    <AdminResponsiveRows
      columns={columns}
      rows={ENGAGEMENT_AXES}
      rowKey={(axis) => axis}
      rowAttributes={(axis) => ({ 'data-scale-operation': axis })}
      caption={translateAdmin(language, 'admin.scale.operations.title')}
    />
  );
}

type LevelRow = { readonly cap: ScaleDraft['levelCaps'][number]; readonly index: number };

function LevelCapsTable({
  language,
  draft,
  onDraft,
}: {
  readonly language: AdminLanguage;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
}) {
  const rows: readonly LevelRow[] = draft.levelCaps.map((cap, index) => ({ cap, index }));
  const columns: readonly AdminColumn<LevelRow>[] = [
    {
      id: 'minLevel',
      header: translateAdmin(language, 'admin.scale.col.minLevel'),
      primary: true,
      cell: ({ cap, index }) => (
        <NumberField
          value={cap.minLevel}
          label={translateAdmin(language, 'admin.scale.minLevelFor', { row: String(index + 1) })}
          onChange={(minLevel) => onDraft(withLevelCap(draft, index, { minLevel }))}
          data={{ 'data-scale-level-min': String(index) }}
        />
      ),
    },
    {
      id: 'maxFactor',
      header: translateAdmin(language, 'admin.scale.col.maxFactor'),
      cell: ({ cap, index }) => (
        <NumberField
          value={cap.maxFactor}
          label={translateAdmin(language, 'admin.scale.maxFactorFor', { row: String(index + 1) })}
          onChange={(maxFactor) => onDraft(withLevelCap(draft, index, { maxFactor }))}
          data={{ 'data-scale-level-factor': String(index) }}
        />
      ),
    },
    {
      id: 'remove',
      header: translateAdmin(language, 'admin.col.actions'),
      cell: ({ cap, index }) => (
        <AdminButton tone="danger" data={{ 'data-scale-level-remove': String(index) }} onClick={() => onDraft(withoutLevelCap(draft, index))}>
          {translateAdmin(language, 'admin.scale.levels.remove', { level: cap.minLevel })}
        </AdminButton>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      {rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }} data-scale-levels-empty>
          {translateAdmin(language, 'admin.scale.levels.empty')}
        </p>
      ) : (
        <AdminResponsiveRows
          columns={columns}
          rows={rows}
          rowKey={({ index }) => String(index)}
          rowAttributes={({ index }) => ({ 'data-scale-level-row': String(index) })}
          caption={translateAdmin(language, 'admin.scale.levels.title')}
        />
      )}
      <div>
        <AdminButton data={{ 'data-scale-level-add': '' }} onClick={() => onDraft(withAddedLevelCap(draft))}>
          {translateAdmin(language, 'admin.scale.levels.add')}
        </AdminButton>
      </div>
    </div>
  );
}

function ScaleEditor({
  language,
  deps,
  document,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly document: EngagementScaleDocument;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ScaleDraft>(() => draftOf(document.scale));
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState('');

  const save = async (): Promise<void> => {
    const scale = scaleOfDraft(draft);
    if (scale === null) {
      setError(translateAdmin(language, 'admin.scale.invalid'));
      setAnnouncement('');
      return;
    }
    setError('');
    setSaving(true);
    const result = await saveEngagementScale({ ...deps, scale });
    setSaving(false);
    if (!result.ok) {
      setError(translateAdmin(language, 'admin.scale.saveFailed', { error: result.error }));
      return;
    }
    queryClient.setQueryData(ADMIN_ENGAGEMENT_SCALE_QUERY_KEY, result.data);
    setDraft(draftOf(result.data.scale));
    setAnnouncement(translateAdmin(language, 'admin.scale.saved'));
  };

  const reset = (): void => {
    setDraft(draftOf(DEFAULT_ENGAGEMENT_SCALE));
    setError('');
    setAnnouncement(translateAdmin(language, 'admin.scale.resetDone'));
  };

  return (
    <form
      className="grid gap-4"
      data-admin-engagement-scale
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-caption" style={{ color: INK2 }} data-scale-updated>
        {document.updatedAt === null
          ? translateAdmin(language, 'admin.scale.defaults')
          : translateAdmin(language, 'admin.scale.updated', {
              date: adminMoment(document.updatedAt, language),
              by: document.updatedBy ?? '—',
            })}
      </p>

      <AdminFicheSection id="scale-operations" title={translateAdmin(language, 'admin.scale.operations.title')}>
        <OperationsTable language={language} draft={draft} onChange={(axis, patch) => setDraft(withOperation(draft, axis, patch))} />
      </AdminFicheSection>

      <AdminFicheSection id="scale-multiplier" title={translateAdmin(language, 'admin.scale.multiplier.title')}>
        <div className="grid gap-3 @2xl:grid-cols-2">
          {MULTIPLIER_FIELDS.map((field) => (
            <label key={field} className="flex items-center justify-between gap-3 text-body" style={{ color: INK }}>
              <span className="min-w-0 break-words">{translateAdmin(language, MULTIPLIER_LABELS[field])}</span>
              <NumberField
                value={draft.multiplier[field]}
                label={translateAdmin(language, MULTIPLIER_LABELS[field])}
                onChange={(value) => setDraft(withMultiplier(draft, field, value))}
                data={{ 'data-scale-multiplier': field }}
              />
            </label>
          ))}
        </div>
      </AdminFicheSection>

      <AdminFicheSection id="scale-levels" title={translateAdmin(language, 'admin.scale.levels.title')}>
        <LevelCapsTable language={language} draft={draft} onDraft={setDraft} />
      </AdminFicheSection>

      {error === '' ? null : (
        <p role="alert" className="text-caption font-medium" style={{ color: 'var(--color-danger)' }} data-scale-error>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pb-8">
        <AdminButton type="submit" tone="primary" busy={saving} data={{ 'data-scale-save': '' }}>
          {translateAdmin(language, saving ? 'admin.scale.saving' : 'admin.scale.save')}
        </AdminButton>
        <AdminButton data={{ 'data-scale-reset': '' }} onClick={reset}>
          {translateAdmin(language, 'admin.scale.reset')}
        </AdminButton>
      </div>

      <AdminAnnouncement text={announcement} />
    </form>
  );
}

export function AdminEngagementScalePanel({ language, deps }: { readonly language: AdminLanguage; readonly deps: AdminDeps }) {
  const query = useQuery({
    queryKey: ADMIN_ENGAGEMENT_SCALE_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadEngagementScale({ ...deps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  if (query.data !== undefined) return <ScaleEditor language={language} deps={deps} document={query.data} />;
  if (query.isPending) return <AdminSkeleton rows={6} />;
  return (
    <div data-scale-load-failed>
      <AdminErrorState language={language} message={translateAdmin(language, 'admin.scale.loadFailed')} onRetry={() => void query.refetch()} />
    </div>
  );
}
