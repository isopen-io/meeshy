import { ENGAGEMENT_STREAK_ACTS, ENGAGEMENT_STREAK_TIER_LABEL_MAX } from '@meeshy/shared/types/engagement-act-streaks';

import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminInlineNotice } from '@/components/admin/states';
import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { formatCount } from '@/lib/admin/interpret/numbers';
import {
  bigPointsTiers,
  tiersOf,
  withAddedTier,
  withLoyaltyYearPreset,
  withTier,
  withoutTier,
  type ScaleDraft,
  type TierDraft,
  type TierListKey,
} from '@/lib/admin/engagement-scale-form';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { NumberField } from '@/routes/admin-engagement-scale-fields';

/**
 * **LES SÉRIES PAR ACTE ET LA FIDÉLITÉ** (#10395) — les paliers de la série globale, de
 * chacun des neuf actes (conversation, post, réel, story, commentaire, humeur, réaction à
 * un post, à un réel, à une story) et de la fidélité (jours depuis la création du compte).
 * Sans plafond à 1000 : un an peut valoir 100 000 points ; au-delà de 10 000, un
 * avertissement le dit sans rien bloquer. Chaque palier : jours, points (dits en grand
 * nombre formaté), libellé facultatif.
 *
 * La série GLOBALE garde les ancres d'avant (`data-scale-streak-*`) ; un acte et la
 * fidélité portent les leurs (`data-scale-tier-*="<liste>:<rang>"`).
 */
type DraftProps = {
  readonly language: AdminLanguage;
  readonly draft: ScaleDraft;
  readonly onDraft: (next: ScaleDraft) => void;
};

type Row = { readonly tier: TierDraft; readonly index: number };

const listId = (key: TierListKey): string => (key.kind === 'act' ? key.act : key.kind);

const anchorOf = (key: TierListKey, part: 'days' | 'points' | 'label' | 'remove' | 'row', index: number): Readonly<Record<string, string>> =>
  key.kind === 'global' && part !== 'label' ? { [`data-scale-streak-${part}`]: String(index) } : { [`data-scale-tier-${part}`]: `${listId(key)}:${index}` };

function listLabel(language: AdminLanguage, key: TierListKey): string {
  if (key.kind === 'global') return translateAdmin(language, 'admin.scale.streaks.global.title');
  if (key.kind === 'loyalty') return translateAdmin(language, 'admin.scale.loyalty.title');
  return translateAdmin(language, `admin.scale.act.${key.act}`);
}

const formatted = (language: AdminLanguage, points: string): string => {
  const value = Number(points.trim().replace(',', '.'));
  return Number.isFinite(value) && points.trim() !== '' ? translateAdmin(language, 'admin.scale.tier.formatted', { points: formatCount(value, language) }) : '';
};

function TierTable({ language, draft, onDraft, tierKey }: DraftProps & { readonly tierKey: TierListKey }) {
  const name = listLabel(language, tierKey);
  const rows: readonly Row[] = tiersOf(draft, tierKey).map((tier, index) => ({ tier, index }));
  const columns: readonly AdminColumn<Row>[] = [
    {
      id: 'days',
      header: translateAdmin(language, 'admin.scale.tier.col.days'),
      primary: true,
      cell: ({ tier, index }) => (
        <NumberField
          value={tier.days}
          label={translateAdmin(language, 'admin.scale.tier.daysFor', { list: name, row: String(index + 1) })}
          onChange={(days) => onDraft(withTier(draft, tierKey, index, { days }))}
          data={anchorOf(tierKey, 'days', index)}
        />
      ),
    },
    {
      id: 'points',
      header: translateAdmin(language, 'admin.scale.tier.col.points'),
      cell: ({ tier, index }) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <NumberField
            value={tier.points}
            label={translateAdmin(language, 'admin.scale.tier.pointsFor', { list: name, row: String(index + 1) })}
            onChange={(points) => onDraft(withTier(draft, tierKey, index, { points }))}
            data={anchorOf(tierKey, 'points', index)}
          />
          <span className="text-caption tabular-nums" style={{ color: INK2 }} aria-hidden="true" data-scale-tier-formatted>
            {formatted(language, tier.points)}
          </span>
        </span>
      ),
    },
    {
      id: 'label',
      header: translateAdmin(language, 'admin.scale.tier.col.label'),
      cell: ({ tier, index }) => (
        <input
          type="text"
          value={tier.label}
          maxLength={ENGAGEMENT_STREAK_TIER_LABEL_MAX}
          aria-label={translateAdmin(language, 'admin.scale.tier.labelFor', { list: name, row: String(index + 1) })}
          onInput={(event) => onDraft(withTier(draft, tierKey, index, { label: event.currentTarget.value }))}
          className="w-44 rounded-chip px-3 text-body"
          style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK }}
          {...anchorOf(tierKey, 'label', index)}
        />
      ),
    },
    {
      id: 'remove',
      header: translateAdmin(language, 'admin.col.actions'),
      cell: ({ tier, index }) => (
        <AdminButton tone="danger" data={anchorOf(tierKey, 'remove', index)} onClick={() => onDraft(withoutTier(draft, tierKey, index))}>
          {translateAdmin(language, 'admin.scale.tier.remove', { days: tier.days })}
        </AdminButton>
      ),
    },
  ];

  return (
    <div className="grid gap-3" data-scale-tiers={listId(tierKey)}>
      {rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }} {...(tierKey.kind === 'global' ? { 'data-scale-streak-empty': '' } : { 'data-scale-tier-empty': listId(tierKey) })}>
          {translateAdmin(language, 'admin.scale.tier.empty')}
        </p>
      ) : (
        <AdminResponsiveRows columns={columns} rows={rows} rowKey={({ index }) => String(index)} rowAttributes={({ index }) => anchorOf(tierKey, 'row', index)} caption={name} />
      )}
      <div>
        <AdminButton data={tierKey.kind === 'global' ? { 'data-scale-streak-add': '' } : { 'data-scale-tier-add': listId(tierKey) }} onClick={() => onDraft(withAddedTier(draft, tierKey))}>
          {translateAdmin(language, 'admin.scale.tier.add')}
        </AdminButton>
      </div>
    </div>
  );
}

/** Ce qui dépasse 10 000 points se dit, partout où l'on règle des paliers ; rien n'est bloqué. */
export function BigPointsNotice({ language, draft }: { readonly language: AdminLanguage; readonly draft: ScaleDraft }) {
  const big = bigPointsTiers(draft);
  if (big.length === 0) return null;
  return (
    <div data-scale-big-warning>
      <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.scale.big.warning', { count: formatCount(big.length, language) })} />
    </div>
  );
}

export function StreaksTab({ language, draft, onDraft }: DraftProps) {
  return (
    <div className="grid gap-4">
      <AdminFicheSection id="scale-streak" title={translateAdmin(language, 'admin.scale.streaks.global.title')}>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.scale.streaks.global.intro')}
        </p>
        <TierTable language={language} draft={draft} onDraft={onDraft} tierKey={{ kind: 'global' }} />
      </AdminFicheSection>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.scale.streaks.acts.intro')}
      </p>
      {ENGAGEMENT_STREAK_ACTS.map((act) => (
        <AdminFicheSection key={act} id={`scale-act-${act}`} title={translateAdmin(language, `admin.scale.act.${act}`)}>
          <TierTable language={language} draft={draft} onDraft={onDraft} tierKey={{ kind: 'act', act }} />
        </AdminFicheSection>
      ))}
    </div>
  );
}

export function LoyaltyTab({ language, draft, onDraft }: DraftProps) {
  return (
    <AdminFicheSection id="scale-loyalty" title={translateAdmin(language, 'admin.scale.loyalty.title')}>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.scale.loyalty.intro')}
      </p>
      <div>
        <AdminButton tone="primary" data={{ 'data-scale-loyalty-preset': '' }} onClick={() => onDraft(withLoyaltyYearPreset(draft, translateAdmin(language, 'admin.scale.loyalty.presetLabel')))}>
          {translateAdmin(language, 'admin.scale.loyalty.preset')}
        </AdminButton>
      </div>
      <TierTable language={language} draft={draft} onDraft={onDraft} tierKey={{ kind: 'loyalty' }} />
    </AdminFicheSection>
  );
}
