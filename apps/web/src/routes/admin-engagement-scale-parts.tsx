import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ENGAGEMENT_AXES, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScaleDocument } from '@meeshy/shared/types/engagement-scale';
import { engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';

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
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';
import { AdminTable, PlainTh, Td } from '@/routes/admin-table';

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

const FIELD = { minHeight: 40, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK } as const;
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
  readonly language: InterfaceLanguage;
  readonly draft: ScaleDraft;
  readonly onChange: (axis: EngagementAxisKey, patch: Partial<ScaleDraft['operations'][EngagementAxisKey]>) => void;
}) {
  return (
    <AdminTable>
      <thead>
        <tr>
          <PlainTh>{translateAdmin(language, 'admin.scale.col.operation')}</PlainTh>
          <PlainTh>{translateAdmin(language, 'admin.scale.col.points')}</PlainTh>
          <PlainTh>{translateAdmin(language, 'admin.scale.col.multiplied')}</PlainTh>
          <PlainTh>{translateAdmin(language, 'admin.scale.col.cap')}</PlainTh>
        </tr>
      </thead>
      <tbody>
        {ENGAGEMENT_AXES.map((axis) => {
          const operation = engagementAxisLabel(language, axis);
          const rule = draft.operations[axis];
          return (
            <tr key={axis} data-scale-operation={axis}>
              <Td>{operation}</Td>
              <Td>
                <NumberField
                  value={rule.points}
                  label={translateAdmin(language, 'admin.scale.pointsFor', { operation })}
                  onChange={(points) => onChange(axis, { points })}
                  data={{ 'data-scale-points': axis }}
                />
              </Td>
              <Td>
                <input
                  type="checkbox"
                  checked={rule.multiplied}
                  aria-label={translateAdmin(language, 'admin.scale.multipliedFor', { operation })}
                  onChange={(event) => onChange(axis, { multiplied: event.currentTarget.checked })}
                  data-scale-multiplied={axis}
                  style={{ minHeight: 24, minWidth: 24, accentColor: BRAND }}
                />
              </Td>
              <Td>
                <NumberField
                  value={rule.dailyCap}
                  label={translateAdmin(language, 'admin.scale.capFor', { operation })}
                  placeholder={translateAdmin(language, 'admin.scale.cap.none')}
                  onChange={(dailyCap) => onChange(axis, { dailyCap })}
                  data={{ 'data-scale-cap': axis }}
                />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </AdminTable>
  );
}

function LevelCapsTable({
  language,
  draft,
  onDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
}) {
  return (
    <div className="grid gap-3">
      {draft.levelCaps.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }} data-scale-levels-empty>
          {translateAdmin(language, 'admin.scale.levels.empty')}
        </p>
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <PlainTh>{translateAdmin(language, 'admin.scale.col.minLevel')}</PlainTh>
              <PlainTh>{translateAdmin(language, 'admin.scale.col.maxFactor')}</PlainTh>
              <PlainTh />
            </tr>
          </thead>
          <tbody>
            {draft.levelCaps.map((cap, index) => {
              const row = String(index + 1);
              return (
                <tr key={index} data-scale-level-row={index}>
                  <Td>
                    <NumberField
                      value={cap.minLevel}
                      label={translateAdmin(language, 'admin.scale.minLevelFor', { row })}
                      onChange={(minLevel) => onDraft(withLevelCap(draft, index, { minLevel }))}
                      data={{ 'data-scale-level-min': String(index) }}
                    />
                  </Td>
                  <Td>
                    <NumberField
                      value={cap.maxFactor}
                      label={translateAdmin(language, 'admin.scale.maxFactorFor', { row })}
                      onChange={(maxFactor) => onDraft(withLevelCap(draft, index, { maxFactor }))}
                      data={{ 'data-scale-level-factor': String(index) }}
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onDraft(withoutLevelCap(draft, index))}
                      data-scale-level-remove={index}
                      className="rounded-chip px-3 text-body"
                      style={{ minHeight: 40, color: 'var(--color-error)' }}
                    >
                      {translateAdmin(language, 'admin.scale.levels.remove', { level: cap.minLevel })}
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      )}
      <button
        type="button"
        onClick={() => onDraft(withAddedLevelCap(draft))}
        data-scale-level-add
        className="w-fit rounded-chip px-4 text-body font-medium"
        style={{ minHeight: 40, color: BRAND, border: `1px solid ${EDGE}` }}
      >
        {translateAdmin(language, 'admin.scale.levels.add')}
      </button>
    </div>
  );
}

function ScaleEditor({
  language,
  deps,
  document,
}: {
  readonly language: InterfaceLanguage;
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
      className="grid gap-6"
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

      <section aria-labelledby="scale-operations" className="grid gap-3">
        <h2 id="scale-operations" className="text-body font-semibold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.scale.operations.title')}
        </h2>
        <OperationsTable language={language} draft={draft} onChange={(axis, patch) => setDraft(withOperation(draft, axis, patch))} />
      </section>

      <section aria-labelledby="scale-multiplier" className="grid gap-3">
        <h2 id="scale-multiplier" className="text-body font-semibold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.scale.multiplier.title')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {MULTIPLIER_FIELDS.map((field) => (
            <label key={field} className="flex items-center justify-between gap-3 text-body" style={{ color: INK }}>
              <span>{translateAdmin(language, MULTIPLIER_LABELS[field])}</span>
              <NumberField
                value={draft.multiplier[field]}
                label={translateAdmin(language, MULTIPLIER_LABELS[field])}
                onChange={(value) => setDraft(withMultiplier(draft, field, value))}
                data={{ 'data-scale-multiplier': field }}
              />
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="scale-levels" className="grid gap-3">
        <h2 id="scale-levels" className="text-body font-semibold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.scale.levels.title')}
        </h2>
        <LevelCapsTable language={language} draft={draft} onDraft={setDraft} />
      </section>

      {error === '' ? null : (
        <p role="alert" className="text-caption font-medium" style={{ color: 'var(--color-error)' }} data-scale-error>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pb-8">
        <button
          type="submit"
          disabled={saving}
          data-scale-save
          className="rounded-chip px-5 text-body font-semibold"
          style={{ minHeight: 44, backgroundColor: BRAND, color: 'white', opacity: saving ? 0.6 : 1 }}
        >
          {translateAdmin(language, saving ? 'admin.scale.saving' : 'admin.scale.save')}
        </button>
        <button
          type="button"
          onClick={reset}
          data-scale-reset
          className="rounded-chip px-4 text-body font-medium"
          style={{ minHeight: 44, color: BRAND }}
        >
          {translateAdmin(language, 'admin.scale.reset')}
        </button>
      </div>

      <AdminAnnouncement text={announcement} />
    </form>
  );
}

export function AdminEngagementScalePanel({ language, deps }: { readonly language: InterfaceLanguage; readonly deps: AdminDeps }) {
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
    <div className="grid gap-3" data-scale-load-failed>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.scale.loadFailed')}
      </p>
      <button
        type="button"
        onClick={() => void query.refetch()}
        className="w-fit rounded-chip px-4 text-body font-medium"
        style={{ minHeight: 40, color: BRAND }}
      >
        {translateAdmin(language, 'admin.scale.retry')}
      </button>
    </div>
  );
}
