import type { ReactNode } from 'react';

import type { AdminTarget } from '@/lib/admin/admin-routes';
import { formatCount } from '@/lib/admin/interpret/numbers';
import type { AdminTone } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminSparkline } from './charts/sparkline';
import { AdminGlyph } from './admin-glyph';
import { AdminLink } from './entity-chip';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE, TONE_COLOR } from './tone';

export type AdminDelta = {
  /** `(courant − précédent) / précédent` : 0,12 = +12 %. */
  readonly ratio: number;
  /** « vs 7 jours précédents » — déjà traduit. */
  readonly period: string;
  /** Ce qui est BON : une hausse du nombre de comptes, une baisse des échecs. Le ton en découle. */
  readonly goodWhen: 'up' | 'down' | 'neutral';
};

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const MINUS = '−';

function deltaTone(delta: AdminDelta): AdminTone {
  if (delta.ratio === 0 || delta.goodWhen === 'neutral') return 'neutral';
  const up = delta.ratio > 0;
  return up === (delta.goodWhen === 'up') ? 'success' : 'danger';
}

/**
 * La variation : flèche + signe + pourcentage + la période, et un MOT pour le
 * lecteur d'écran (« en hausse de 12 % ») — le ton ne porte jamais seul le sens.
 */
function Delta({ language, delta }: { readonly language: AdminLanguage; readonly delta: AdminDelta }) {
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(delta.ratio));
  const tone = deltaTone(delta);
  const word =
    delta.ratio === 0
      ? translateAdmin(language, 'admin.kit.stat.flat')
      : translateAdmin(language, delta.ratio > 0 ? 'admin.kit.stat.up' : 'admin.kit.stat.down', { value: percent });
  return (
    <span data-admin-delta={tone} className="inline-flex flex-wrap items-center gap-x-1 text-caption">
      <span className="inline-flex items-center gap-1 font-medium" style={{ color: TONE_COLOR[tone] }}>
        <AdminGlyph name={delta.ratio === 0 ? 'minus' : delta.ratio > 0 ? 'trendUp' : 'trendDown'} size={14} />
        <span aria-hidden="true">{delta.ratio === 0 ? percent : `${delta.ratio > 0 ? '+' : MINUS}${percent}`}</span>
        <span className="sr-only">{word}</span>
      </span>
      <span style={{ color: INK3 }}>{delta.period}</span>
    </span>
  );
}

/**
 * **UNE CARTE DE CHIFFRE** (#8876) — le libellé, le chiffre clé (DÉJÀ formaté par
 * la bibliothèque d'interprétation), sa légende, sa variation, sa tendance. Avec
 * une `target`, toute la carte devient UN lien de 44 px vers la liste filtrée
 * correspondante.
 *
 * Trois états, sans saut de mise en page : prête, squelette, erreur avec
 * « Réessayer ».
 */
export function AdminStatCard({
  language,
  label,
  value,
  caption,
  delta,
  trend,
  target,
  anchor,
  state = 'ready',
  onRetry,
}: {
  readonly language: AdminLanguage;
  readonly label: string;
  readonly value: string;
  readonly caption?: string;
  readonly delta?: AdminDelta | null;
  readonly trend?: readonly number[];
  readonly target?: AdminTarget;
  readonly anchor: string;
  readonly state?: 'ready' | 'loading' | 'error';
  readonly onRetry?: () => void;
}) {
  const card = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;

  if (state !== 'ready') {
    return (
      <div data-admin-stat={anchor} data-admin-stat-state={state} aria-busy={state === 'loading'} className="grid gap-2 rounded-card p-4 md:p-5" style={{ ...card, minHeight: 112 }}>
        <span className="text-caption" style={{ color: INK2 }}>
          {label}
        </span>
        {state === 'loading' ? (
          <span aria-hidden="true" className="h-8 w-24 rounded-chip" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }} />
        ) : (
          <>
            <span role="alert" className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.kit.error')}
            </span>
            {onRetry === undefined ? null : (
              <button
                type="button"
                data-admin-retry
                onClick={onRetry}
                className={`inline-flex w-fit items-center gap-1 rounded-chip px-3 text-caption font-medium ${FOCUS}`}
                style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
              >
                <AdminGlyph name="arrowClockwise" size={14} />
                {translateAdmin(language, 'admin.kit.retry')}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  const first = trend?.[0];
  const last = trend?.[trend.length - 1];
  const body: ReactNode = (
    <>
      <span className="text-caption" style={{ color: INK2 }}>
        {label}
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="min-w-0 break-words text-screen font-bold tabular-nums" style={{ color: INK }}>
          {value}
        </span>
        {trend === undefined || trend.length < 2 || first === undefined || last === undefined ? null : (
          <AdminSparkline
            values={trend}
            label={translateAdmin(language, 'admin.kit.stat.trend', { from: formatCount(first, language), to: formatCount(last, language) })}
          />
        )}
      </span>
      {caption === undefined ? null : (
        <span className="text-caption" style={{ color: INK3 }}>
          {caption}
        </span>
      )}
      {delta === undefined || delta === null ? null : <Delta language={language} delta={delta} />}
    </>
  );

  return (
    <div data-admin-stat={anchor} className="rounded-card" style={card}>
      {target === undefined ? (
        <div className="grid gap-1 p-4 md:p-5">{body}</div>
      ) : (
        <AdminLink target={target} className={`grid gap-1 rounded-card p-4 md:p-5 ${FOCUS}`} style={{ minHeight: 44, color: INK }}>
          {body}
        </AdminLink>
      )}
    </div>
  );
}

/** La grille des cartes : une colonne sous `sm`, deux dès `sm`, `columns` dès `lg`. */
export function AdminStatGrid({ children, columns = 4 }: { readonly children: ReactNode; readonly columns?: 2 | 3 | 4 }) {
  const lg = columns === 2 ? 'lg:grid-cols-2' : columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';
  return (
    <div data-admin-stat-grid className={`grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 ${lg}`}>
      {children}
    </div>
  );
}
