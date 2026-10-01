import {
  ENGAGEMENT_OPERATIONS,
  ENGAGEMENT_OPERATION_CATALOG,
  ENGAGEMENT_OPERATION_DOMAINS,
  hasConfigurableCap,
  type EngagementOperationDomain,
  type EngagementOperationKey,
} from '@meeshy/shared/types/engagement-operations';

import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { BRAND, INK, INK2 } from '@/components/admin/tone';
import { withOperation, withVariant, type ScaleDraft } from '@/lib/admin/engagement-scale-form';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { NumberField } from '@/routes/admin-engagement-scale-fields';

/**
 * LES OPÉRATIONS DU BARÈME (#8959), rangées par DOMAINE comme la liste du
 * porteur : chaque ligne dit sa fréquence, ses points (un champ par variante
 * quand la visibilité ou la position en décide), son « multiplié » et son
 * plafond avec sa portée. Une opération unique par cible ou par compte n'a pas
 * de plafond à régler : la ligne le dit. Les deux opérations progressives (la
 * visite de lien, le bonus de constance) se règlent dans leurs propres
 * sections.
 *
 * Chaque domaine est un tableau dès `@3xl` et des cartes dessous (le gabarit
 * commun du kit, `AdminResponsiveRows`) ; chaque champ y fait 44 px et la case
 * « multiplié » de 24 px s'appuie dans une zone de 44 px.
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

const variantLabel = (language: AdminLanguage, variant: string): string =>
  isVariantKey(variant) ? translateAdmin(language, VARIANT_LABELS[variant]) : variant;

export const operationLabel = (language: AdminLanguage, key: EngagementOperationKey): string =>
  translateAdmin(language, `admin.scale.op.${key}`);

type DraftProps = {
  readonly language: AdminLanguage;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
};

type OperationProps = DraftProps & { readonly operationKey: EngagementOperationKey; readonly operation: string };

function CapCell({ language, draft, operationKey, operation, onDraft }: OperationProps) {
  const definition = ENGAGEMENT_OPERATION_CATALOG[operationKey];
  if (definition.frequency === 'per-target') return <span data-scale-cap-fixed={operationKey}>{translateAdmin(language, 'admin.scale.cap.perTarget')}</span>;
  if (definition.frequency === 'per-account') return <span data-scale-cap-fixed={operationKey}>{translateAdmin(language, 'admin.scale.cap.perAccount')}</span>;
  if (!hasConfigurableCap(operationKey)) {
    return <span data-scale-cap-fixed={operationKey}>{translateAdmin(language, 'admin.scale.cap.none')}</span>;
  }
  const scope = definition.capScope;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <NumberField
        value={draft.operations[operationKey].cap}
        label={translateAdmin(language, 'admin.scale.capFor', { operation })}
        placeholder={translateAdmin(language, 'admin.scale.cap.none')}
        onChange={(cap) => onDraft(withOperation(draft, operationKey, { cap }))}
        data={{ 'data-scale-cap': operationKey }}
      />
      {scope === 'none' ? null : (
        <span className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, `admin.scale.scope.${scope}`)}
        </span>
      )}
    </span>
  );
}

function PointsCell({ language, draft, operationKey, operation, onDraft }: OperationProps) {
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
          <label key={variant} className="flex items-center justify-between gap-2 text-caption" style={{ color: INK2 }}>
            <span className="min-w-0 break-words">{name}</span>
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

function MultipliedCell({ language, draft, operationKey, operation, onDraft }: OperationProps) {
  return (
    /* La case fait 24 px ; sa zone d'appui, le libellé qui l'enveloppe, en fait 44. */
    <label className="inline-flex items-center justify-center" style={{ minHeight: 44, minWidth: 44 }}>
      <input
        type="checkbox"
        checked={draft.operations[operationKey].multiplied}
        aria-label={translateAdmin(language, 'admin.scale.multipliedFor', { operation })}
        onChange={(event) => onDraft(withOperation(draft, operationKey, { multiplied: event.currentTarget.checked }))}
        data-scale-multiplied={operationKey}
        style={{ height: 24, width: 24, accentColor: BRAND }}
      />
    </label>
  );
}

function DomainRows({ language, domain, draft, onDraft }: DraftProps & { readonly domain: EngagementOperationDomain }) {
  const operations = operationsOf(domain);
  if (operations.length === 0) return null;
  const headingId = `scale-domain-${domain}`;
  const title = translateAdmin(language, `admin.scale.domain.${domain}`);
  const cell = (key: EngagementOperationKey) => ({ language, draft, onDraft, operationKey: key, operation: operationLabel(language, key) });
  const columns: readonly AdminColumn<EngagementOperationKey>[] = [
    {
      id: 'operation',
      header: translateAdmin(language, 'admin.scale.col.operation'),
      primary: true,
      cell: (key) => <span className="min-w-0 break-words text-start text-body font-medium">{operationLabel(language, key)}</span>,
    },
    {
      id: 'frequency',
      header: translateAdmin(language, 'admin.scale.col.frequency'),
      cell: (key) => translateAdmin(language, `admin.scale.freq.${ENGAGEMENT_OPERATION_CATALOG[key].frequency}`),
    },
    {
      id: 'points',
      header: translateAdmin(language, 'admin.scale.col.points'),
      cell: (key) => <PointsCell {...cell(key)} />,
    },
    {
      id: 'multiplied',
      header: translateAdmin(language, 'admin.scale.col.multiplied'),
      cell: (key) => <MultipliedCell {...cell(key)} />,
    },
    {
      id: 'cap',
      header: translateAdmin(language, 'admin.scale.col.cap'),
      cell: (key) => <CapCell {...cell(key)} />,
    },
  ];
  return (
    <section aria-labelledby={headingId} className="grid gap-2" data-scale-domain={domain}>
      <h3 id={headingId} className="text-body font-semibold" style={{ color: INK }}>
        {title}
      </h3>
      <AdminResponsiveRows
        columns={columns}
        rows={operations}
        rowKey={(key) => key}
        rowAttributes={(key) => ({ 'data-scale-operation': key })}
        caption={title}
      />
    </section>
  );
}

export function OperationsSections({ language, draft, onDraft }: DraftProps) {
  return (
    <div className="grid gap-5">
      {ENGAGEMENT_OPERATION_DOMAINS.map((domain) => (
        <DomainRows key={domain} language={language} domain={domain} draft={draft} onDraft={onDraft} />
      ))}
    </div>
  );
}

/** Le nombre de lignes d'opération que l'écran montre — les progressives ont leur section. */
export const EDITABLE_OPERATION_COUNT = EDITABLE_OPERATIONS.length;
