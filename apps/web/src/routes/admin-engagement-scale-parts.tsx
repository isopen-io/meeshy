import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScaleDocument } from '@meeshy/shared/types/engagement-scale';

import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { AdminErrorState } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import { adminMoment } from '@/lib/admin/format';
import {
  MULTIPLIER_FIELDS,
  draftOf,
  scaleOfDraft,
  withAddedLevelCap,
  withLevelCap,
  withMultiplier,
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
import { LabeledNumber, NumberField } from '@/routes/admin-engagement-scale-fields';
import { OperationsSections } from '@/routes/admin-engagement-scale-operations';
import { AbuseSection, LinkVisitSection, StreakBonusSection } from '@/routes/admin-engagement-scale-rules';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';

/**
 * LE BARÈME DE POINTS (#8906, #8959) — chaque opération de la plateforme,
 * rangée par domaine, avec ses points (par variante), son « multiplié » et son
 * plafond ; la règle des liens ; les bonus de constance ; les garde-fous des
 * gros poids ; les règles du multiplicateur et le plafond par niveau.
 *
 * Le brouillon est validé ICI par la loi partagée avant tout `PUT`
 * (`scaleOfDraft` → `parseEngagementScale`) : un barème invalide ne part pas.
 * Un refus serveur est montré tel qu'il est dit. Chaque bloc est une carte
 * titrée du kit ; les listes se plient en cartes sous le seuil du contenu.
 */

const MULTIPLIER_LABELS: Readonly<Record<MultiplierField, AdminPlainCatalogKey>> = {
  windowDays: 'admin.scale.field.windowDays',
  stepPerExtraFamily: 'admin.scale.field.stepPerExtraFamily',
  standingBonus: 'admin.scale.field.standingBonus',
  achievementsForStanding: 'admin.scale.field.achievementsForStanding',
  highBadgeThreshold: 'admin.scale.field.highBadgeThreshold',
  highBadgesForStanding: 'admin.scale.field.highBadgesForStanding',
  maxFactor: 'admin.scale.field.maxFactor',
};

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
        <OperationsSections language={language} draft={draft} onDraft={setDraft} />
      </AdminFicheSection>

      <LinkVisitSection language={language} draft={draft} onDraft={setDraft} />

      <StreakBonusSection language={language} draft={draft} onDraft={setDraft} />

      <AbuseSection language={language} draft={draft} onDraft={setDraft} />

      <AdminFicheSection id="scale-multiplier" title={translateAdmin(language, 'admin.scale.multiplier.title')}>
        <div className="grid gap-3 @2xl:grid-cols-2">
          {MULTIPLIER_FIELDS.map((field) => (
            <LabeledNumber key={field} label={translateAdmin(language, MULTIPLIER_LABELS[field])}>
              <NumberField
                value={draft.multiplier[field]}
                label={translateAdmin(language, MULTIPLIER_LABELS[field])}
                onChange={(value) => setDraft(withMultiplier(draft, field, value))}
                data={{ 'data-scale-multiplier': field }}
              />
            </LabeledNumber>
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
