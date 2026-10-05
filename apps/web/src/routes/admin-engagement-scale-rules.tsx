import type { ReactNode } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { INK2 } from '@/components/admin/tone';
import {
  ABUSE_FIELDS,
  LINK_VISIT_FIELDS,
  withAbuse,
  withAddedStreakBonus,
  withLinkVisit,
  withStreakBonus,
  withoutStreakBonus,
  type AbuseField,
  type LinkVisitField,
  type ScaleDraft,
} from '@/lib/admin/engagement-scale-form';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { LabeledNumber, NumberField } from '@/routes/admin-engagement-scale-fields';

/**
 * LES RÈGLES TRANSVERSES DU BARÈME (#8959) — la visite de lien progressive, les
 * bonus de constance et les garde-fous des gros poids. Chacune se règle ici et
 * s'applique partout où la passerelle crédite. Chacune est un bloc titré du kit
 * (`AdminFicheSection`), comme les opérations, le multiplicateur et les niveaux.
 */

type DraftProps = {
  readonly language: AdminLanguage;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
};

const LINK_VISIT_LABELS: Readonly<Record<LinkVisitField, AdminPlainCatalogKey>> = {
  basePoints: 'admin.scale.links.basePoints',
  firstTier: 'admin.scale.links.firstTier',
  stepPerDoubling: 'admin.scale.links.stepPerDoubling',
  maxPoints: 'admin.scale.links.maxPoints',
  dedupHours: 'admin.scale.links.dedupHours',
  dailyCapPerCreator: 'admin.scale.links.dailyCapPerCreator',
};

const ABUSE_LABELS: Readonly<Record<AbuseField, AdminPlainCatalogKey>> = {
  heavyPoints: 'admin.scale.abuse.heavyPoints',
  clawbackHours: 'admin.scale.abuse.clawbackHours',
  unverifiedMaxPoints: 'admin.scale.abuse.unverifiedMaxPoints',
};

function RuleSection({
  id,
  title,
  intro,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
}) {
  return (
    <AdminFicheSection id={id} title={title}>
      {intro === undefined ? null : (
        <p className="text-caption" style={{ color: INK2 }}>
          {intro}
        </p>
      )}
      {children}
    </AdminFicheSection>
  );
}

export function LinkVisitSection({ language, draft, onDraft }: DraftProps) {
  return (
    <RuleSection
      id="scale-links"
      title={translateAdmin(language, 'admin.scale.links.title')}
      intro={translateAdmin(language, 'admin.scale.links.intro')}
    >
      <div className="grid gap-3 @2xl:grid-cols-2">
        {LINK_VISIT_FIELDS.map((field) => {
          const label = translateAdmin(language, LINK_VISIT_LABELS[field]);
          return (
            <LabeledNumber key={field} label={label}>
              <NumberField
                value={draft.linkVisits[field]}
                label={label}
                {...(field === 'dailyCapPerCreator' ? { placeholder: translateAdmin(language, 'admin.scale.cap.none') } : {})}
                onChange={(value) => onDraft(withLinkVisit(draft, field, value))}
                data={{ 'data-scale-link': field }}
              />
            </LabeledNumber>
          );
        })}
      </div>
    </RuleSection>
  );
}

type StreakRow = { readonly bonus: ScaleDraft['streakBonuses'][number]; readonly index: number };

export function StreakBonusSection({ language, draft, onDraft }: DraftProps) {
  const rows: readonly StreakRow[] = draft.streakBonuses.map((bonus, index) => ({ bonus, index }));
  const columns: readonly AdminColumn<StreakRow>[] = [
    {
      id: 'days',
      header: translateAdmin(language, 'admin.scale.streak.col.days'),
      primary: true,
      cell: ({ bonus, index }) => (
        <NumberField
          value={bonus.days}
          label={translateAdmin(language, 'admin.scale.streak.daysFor', { row: String(index + 1) })}
          onChange={(days) => onDraft(withStreakBonus(draft, index, { days }))}
          data={{ 'data-scale-streak-days': String(index) }}
        />
      ),
    },
    {
      id: 'points',
      header: translateAdmin(language, 'admin.scale.streak.col.points'),
      cell: ({ bonus, index }) => (
        <NumberField
          value={bonus.points}
          label={translateAdmin(language, 'admin.scale.streak.pointsFor', { row: String(index + 1) })}
          onChange={(points) => onDraft(withStreakBonus(draft, index, { points }))}
          data={{ 'data-scale-streak-points': String(index) }}
        />
      ),
    },
    {
      id: 'remove',
      header: translateAdmin(language, 'admin.col.actions'),
      cell: ({ bonus, index }) => (
        <AdminButton tone="danger" data={{ 'data-scale-streak-remove': String(index) }} onClick={() => onDraft(withoutStreakBonus(draft, index))}>
          {translateAdmin(language, 'admin.scale.streak.remove', { days: bonus.days })}
        </AdminButton>
      ),
    },
  ];

  return (
    <RuleSection id="scale-streak" title={translateAdmin(language, 'admin.scale.streak.title')}>
      {rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }} data-scale-streak-empty>
          {translateAdmin(language, 'admin.scale.streak.empty')}
        </p>
      ) : (
        <AdminResponsiveRows
          columns={columns}
          rows={rows}
          rowKey={({ index }) => String(index)}
          rowAttributes={({ index }) => ({ 'data-scale-streak-row': String(index) })}
          caption={translateAdmin(language, 'admin.scale.streak.title')}
        />
      )}
      <div>
        <AdminButton data={{ 'data-scale-streak-add': '' }} onClick={() => onDraft(withAddedStreakBonus(draft))}>
          {translateAdmin(language, 'admin.scale.streak.add')}
        </AdminButton>
      </div>
    </RuleSection>
  );
}

export function AbuseSection({ language, draft, onDraft }: DraftProps) {
  return (
    <RuleSection
      id="scale-abuse"
      title={translateAdmin(language, 'admin.scale.abuse.title')}
      intro={translateAdmin(language, 'admin.scale.abuse.intro')}
    >
      <div className="grid gap-3 @2xl:grid-cols-2">
        {ABUSE_FIELDS.map((field) => {
          const label = translateAdmin(language, ABUSE_LABELS[field]);
          return (
            <LabeledNumber key={field} label={label}>
              <NumberField
                value={draft.abuse[field]}
                label={label}
                onChange={(value) => onDraft(withAbuse(draft, field, value))}
                data={{ 'data-scale-abuse': field }}
              />
            </LabeledNumber>
          );
        })}
      </div>
    </RuleSection>
  );
}
