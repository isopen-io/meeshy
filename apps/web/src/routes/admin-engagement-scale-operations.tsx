import {
  ENGAGEMENT_OPERATIONS,
  ENGAGEMENT_OPERATION_CATALOG,
  ENGAGEMENT_OPERATION_DOMAINS,
  hasConfigurableCap,
  type EngagementOperationDomain,
  type EngagementOperationKey,
} from '@meeshy/shared/types/engagement-operations';

import { withOperation, withVariant, type ScaleDraft } from '@/lib/admin/engagement-scale-form';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AdminTable, PlainTh, Td } from '@/routes/admin-table';
import { NumberField, scaleTokens } from '@/routes/admin-engagement-scale-fields';

/**
 * LES OPÉRATIONS DU BARÈME (#8959), rangées par DOMAINE comme la liste du
 * porteur : chaque ligne dit sa fréquence, ses points (un champ par variante
 * quand la visibilité ou la position en décide), son « multiplié » et son
 * plafond avec sa portée. Une opération unique par cible ou par compte n'a pas
 * de plafond à régler : la ligne le dit. Les deux opérations progressives (la
 * visite de lien, le bonus de constance) se règlent dans leurs propres
 * sections.
 */

const EDITABLE_OPERATIONS = ENGAGEMENT_OPERATIONS.filter(
  (key) => ENGAGEMENT_OPERATION_CATALOG[key].frequency !== 'progressive',
);

const operationsOf = (domain: EngagementOperationDomain): readonly EngagementOperationKey[] =>
  EDITABLE_OPERATIONS.filter((key) => ENGAGEMENT_OPERATION_CATALOG[key].domain === domain);

const VARIANT_LABELS = {
  public: 'admin.scale.variant.public',
  community: 'admin.scale.variant.community',
  friends: 'admin.scale.variant.friends',
  other: 'admin.scale.variant.other',
  live: 'admin.scale.variant.live',
  static: 'admin.scale.variant.static',
} as const;

const isVariantKey = (variant: string): variant is keyof typeof VARIANT_LABELS => variant in VARIANT_LABELS;

const variantLabel = (language: InterfaceLanguage, variant: string): string =>
  isVariantKey(variant) ? translateAdmin(language, VARIANT_LABELS[variant]) : variant;

export const operationLabel = (language: InterfaceLanguage, key: EngagementOperationKey): string =>
  translateAdmin(language, `admin.scale.op.${key}`);

function CapCell({
  language,
  draft,
  operationKey,
  operation,
  onDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly draft: ScaleDraft;
  readonly operationKey: EngagementOperationKey;
  readonly operation: string;
  readonly onDraft: (next: ScaleDraft) => void;
}) {
  const definition = ENGAGEMENT_OPERATION_CATALOG[operationKey];
  if (definition.frequency === 'per-target') return <span data-scale-cap-fixed={operationKey}>{translateAdmin(language, 'admin.scale.cap.perTarget')}</span>;
  if (definition.frequency === 'per-account') return <span data-scale-cap-fixed={operationKey}>{translateAdmin(language, 'admin.scale.cap.perAccount')}</span>;
  if (!hasConfigurableCap(operationKey)) {
    return <span data-scale-cap-fixed={operationKey}>{translateAdmin(language, 'admin.scale.cap.none')}</span>;
  }
  const scope = definition.capScope;
  return (
    <span className="inline-flex items-center gap-2">
      <NumberField
        value={draft.operations[operationKey].cap}
        label={translateAdmin(language, 'admin.scale.capFor', { operation })}
        placeholder={translateAdmin(language, 'admin.scale.cap.none')}
        onChange={(cap) => onDraft(withOperation(draft, operationKey, { cap }))}
        data={{ 'data-scale-cap': operationKey }}
      />
      {scope === 'none' ? null : (
        <span className="text-caption" style={{ color: scaleTokens.INK2 }}>
          {translateAdmin(language, `admin.scale.scope.${scope}`)}
        </span>
      )}
    </span>
  );
}

function PointsCell({
  language,
  draft,
  operationKey,
  operation,
  onDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly draft: ScaleDraft;
  readonly operationKey: EngagementOperationKey;
  readonly operation: string;
  readonly onDraft: (next: ScaleDraft) => void;
}) {
  const rule = draft.operations[operationKey];
  const variants = ENGAGEMENT_OPERATION_CATALOG[operationKey].variants;
  if (variants.length === 0) {
    return (
      <NumberField
        value={rule.points}
        label={translateAdmin(language, 'admin.scale.pointsFor', { operation })}
        onChange={(points) => onDraft(withOperation(draft, operationKey, { points }))}
        data={{ 'data-scale-points': operationKey }}
      />
    );
  }
  return (
    <div className="grid gap-2">
      {variants.map((variant) => {
        const name = variantLabel(language, variant);
        return (
          <label key={variant} className="flex items-center justify-between gap-2 text-caption" style={{ color: scaleTokens.INK2 }}>
            <span>{name}</span>
            <NumberField
              value={rule.variants[variant] ?? ''}
              label={translateAdmin(language, 'admin.scale.variantFor', { variant: name, operation })}
              onChange={(points) => onDraft(withVariant(draft, operationKey, variant, points))}
              data={{ 'data-scale-variant': `${operationKey}:${variant}` }}
            />
          </label>
        );
      })}
    </div>
  );
}

function DomainTable({
  language,
  domain,
  draft,
  onDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly domain: EngagementOperationDomain;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
}) {
  const operations = operationsOf(domain);
  if (operations.length === 0) return null;
  const headingId = `scale-domain-${domain}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-2" data-scale-domain={domain}>
      <h3 id={headingId} className="text-body font-semibold" style={{ color: scaleTokens.INK }}>
        {translateAdmin(language, `admin.scale.domain.${domain}`)}
      </h3>
      <AdminTable>
        <thead>
          <tr>
            <PlainTh>{translateAdmin(language, 'admin.scale.col.operation')}</PlainTh>
            <PlainTh>{translateAdmin(language, 'admin.scale.col.frequency')}</PlainTh>
            <PlainTh>{translateAdmin(language, 'admin.scale.col.points')}</PlainTh>
            <PlainTh>{translateAdmin(language, 'admin.scale.col.multiplied')}</PlainTh>
            <PlainTh>{translateAdmin(language, 'admin.scale.col.cap')}</PlainTh>
          </tr>
        </thead>
        <tbody>
          {operations.map((key) => {
            const operation = operationLabel(language, key);
            return (
              <tr key={key} data-scale-operation={key}>
                <Td>{operation}</Td>
                <Td>{translateAdmin(language, `admin.scale.freq.${ENGAGEMENT_OPERATION_CATALOG[key].frequency}`)}</Td>
                <Td>
                  <PointsCell language={language} draft={draft} operationKey={key} operation={operation} onDraft={onDraft} />
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    checked={draft.operations[key].multiplied}
                    aria-label={translateAdmin(language, 'admin.scale.multipliedFor', { operation })}
                    onChange={(event) => onDraft(withOperation(draft, key, { multiplied: event.currentTarget.checked }))}
                    data-scale-multiplied={key}
                    style={{ minHeight: 24, minWidth: 24, accentColor: scaleTokens.BRAND }}
                  />
                </Td>
                <Td>
                  <CapCell language={language} draft={draft} operationKey={key} operation={operation} onDraft={onDraft} />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </AdminTable>
    </section>
  );
}

export function OperationsSections({
  language,
  draft,
  onDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
}) {
  return (
    <div className="grid gap-5">
      {ENGAGEMENT_OPERATION_DOMAINS.map((domain) => (
        <DomainTable key={domain} language={language} domain={domain} draft={draft} onDraft={onDraft} />
      ))}
    </div>
  );
}

/** Le nombre de lignes d'opération que l'écran montre — les progressives ont leur section. */
export const EDITABLE_OPERATION_COUNT = EDITABLE_OPERATIONS.length;
