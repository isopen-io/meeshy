import type { ReactNode } from 'react';

import { AdminFicheSection } from '@/components/admin/fiche';
import { INK2 } from '@/components/admin/tone';
import {
  ABUSE_FIELDS,
  LINK_VISIT_FIELDS,
  withAbuse,
  withLinkVisit,
  type AbuseField,
  type LinkVisitField,
  type ScaleDraft,
} from '@/lib/admin/engagement-scale-form';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { LabeledNumber, NumberField } from '@/routes/admin-engagement-scale-fields';

/**
 * LES RÈGLES TRANSVERSES DU BARÈME (#8959) — la visite de lien progressive et les
 * garde-fous des gros poids (les paliers de constance vivent dans `admin-engagement-scale-tiers.tsx`, #10395). Chacune se règle ici et
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
