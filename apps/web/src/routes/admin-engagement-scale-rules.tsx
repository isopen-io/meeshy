import type { ReactNode } from 'react';

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
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AdminTable, PlainTh, Td } from '@/routes/admin-table';
import { LabeledNumber, NumberField, scaleTokens } from '@/routes/admin-engagement-scale-fields';

/**
 * LES RÈGLES TRANSVERSES DU BARÈME (#8959) — la visite de lien progressive, les
 * bonus de constance et les garde-fous des gros poids. Chacune se règle ici et
 * s'applique partout où la passerelle crédite.
 */

type DraftProps = {
  readonly language: InterfaceLanguage;
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
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-body font-semibold" style={{ color: scaleTokens.INK }}>
        {title}
      </h2>
      {intro === undefined ? null : (
        <p className="text-caption" style={{ color: scaleTokens.INK2 }}>
          {intro}
        </p>
      )}
      {children}
    </section>
  );
}

export function LinkVisitSection({ language, draft, onDraft }: DraftProps) {
  return (
    <RuleSection
      id="scale-links"
      title={translateAdmin(language, 'admin.scale.links.title')}
      intro={translateAdmin(language, 'admin.scale.links.intro')}
    >
      <div className="grid gap-3 sm:grid-cols-2">
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

export function StreakBonusSection({ language, draft, onDraft }: DraftProps) {
  return (
    <RuleSection id="scale-streak" title={translateAdmin(language, 'admin.scale.streak.title')}>
      {draft.streakBonuses.length === 0 ? (
        <p className="text-caption" style={{ color: scaleTokens.INK2 }} data-scale-streak-empty>
          {translateAdmin(language, 'admin.scale.streak.empty')}
        </p>
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <PlainTh>{translateAdmin(language, 'admin.scale.streak.col.days')}</PlainTh>
              <PlainTh>{translateAdmin(language, 'admin.scale.streak.col.points')}</PlainTh>
              <PlainTh />
            </tr>
          </thead>
          <tbody>
            {draft.streakBonuses.map((bonus, index) => {
              const row = String(index + 1);
              return (
                <tr key={index} data-scale-streak-row={index}>
                  <Td>
                    <NumberField
                      value={bonus.days}
                      label={translateAdmin(language, 'admin.scale.streak.daysFor', { row })}
                      onChange={(days) => onDraft(withStreakBonus(draft, index, { days }))}
                      data={{ 'data-scale-streak-days': String(index) }}
                    />
                  </Td>
                  <Td>
                    <NumberField
                      value={bonus.points}
                      label={translateAdmin(language, 'admin.scale.streak.pointsFor', { row })}
                      onChange={(points) => onDraft(withStreakBonus(draft, index, { points }))}
                      data={{ 'data-scale-streak-points': String(index) }}
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onDraft(withoutStreakBonus(draft, index))}
                      data-scale-streak-remove={index}
                      className="rounded-chip px-3 text-body"
                      style={{ minHeight: 40, color: 'var(--color-error)' }}
                    >
                      {translateAdmin(language, 'admin.scale.streak.remove', { days: bonus.days })}
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
        onClick={() => onDraft(withAddedStreakBonus(draft))}
        data-scale-streak-add
        className="w-fit rounded-chip px-4 text-body font-medium"
        style={{ minHeight: 40, color: scaleTokens.BRAND, border: `1px solid ${scaleTokens.EDGE}` }}
      >
        {translateAdmin(language, 'admin.scale.streak.add')}
      </button>
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
      <div className="grid gap-3 sm:grid-cols-2">
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
