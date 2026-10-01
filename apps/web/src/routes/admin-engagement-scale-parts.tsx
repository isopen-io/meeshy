import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScaleDocument } from '@meeshy/shared/types/engagement-scale';

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
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';
import { AdminTable, PlainTh, Td } from '@/routes/admin-table';
import { LabeledNumber, NumberField, scaleTokens } from '@/routes/admin-engagement-scale-fields';
import { OperationsSections } from '@/routes/admin-engagement-scale-operations';
import { AbuseSection, LinkVisitSection, StreakBonusSection } from '@/routes/admin-engagement-scale-rules';

/**
 * LE BARÈME DE POINTS (#8906, #8959) — chaque opération de la plateforme,
 * rangée par domaine, avec ses points (par variante), son « multiplié » et son
 * plafond ; la règle des liens ; les bonus de constance ; les garde-fous des
 * gros poids ; les règles du multiplicateur et le plafond par niveau.
 *
 * Le brouillon est validé ICI par la loi partagée avant tout `PUT`
 * (`scaleOfDraft` → `parseEngagementScale`) : un barème invalide ne part pas.
 * Un refus serveur est montré tel qu'il est dit.
 */

const { INK, INK2, EDGE, BRAND } = scaleTokens;

const MULTIPLIER_LABELS: Readonly<Record<MultiplierField, AdminPlainCatalogKey>> = {
  windowDays: 'admin.scale.field.windowDays',
  stepPerExtraFamily: 'admin.scale.field.stepPerExtraFamily',
  standingBonus: 'admin.scale.field.standingBonus',
  achievementsForStanding: 'admin.scale.field.achievementsForStanding',
  highBadgeThreshold: 'admin.scale.field.highBadgeThreshold',
  highBadgesForStanding: 'admin.scale.field.highBadgesForStanding',
  maxFactor: 'admin.scale.field.maxFactor',
};

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
        <OperationsSections language={language} draft={draft} onDraft={setDraft} />
      </section>

      <LinkVisitSection language={language} draft={draft} onDraft={setDraft} />

      <StreakBonusSection language={language} draft={draft} onDraft={setDraft} />

      <AbuseSection language={language} draft={draft} onDraft={setDraft} />

      <section aria-labelledby="scale-multiplier" className="grid gap-3">
        <h2 id="scale-multiplier" className="text-body font-semibold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.scale.multiplier.title')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
          style={{ minHeight: 44, backgroundColor: BRAND, color: 'var(--ios-on-brand)', opacity: saving ? 0.6 : 1 }}
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
