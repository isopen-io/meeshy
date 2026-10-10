import { useId, type ReactNode } from 'react';

import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminGlyph, type AdminGlyphName } from './admin-glyph';
import { AdminDeniedInline } from './states';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE } from './tone';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const SKELETON = 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)';

export type AdminSummaryValue = { readonly label: string; readonly value: string };

/**
 * **UNE ZONE, RÉSUMÉE** (spec 2026-10-04 § 1, patron « synthèse → modale ») —
 * le hub et les fiches ne rendent plus tout d'un coup : chaque zone se dit en
 * une carte (titre, glyphe, deux à quatre chiffres DÉJÀ formatés par la
 * bibliothèque d'interprétation, une phrase d'état) et son bouton « Ouvrir »
 * montre le détail dans une `AdminDetailSheet`.
 *
 * Les valeurs viennent des lectures LÉGÈRES déjà servies pour les chiffres ;
 * le détail (graphiques, classements, listes) ne se lit qu'à l'ouverture.
 *
 * Quatre états, sans saut de mise en page :
 * - `ready` — les valeurs ;
 * - `loading` — les libellés restent, les valeurs sont des squelettes
 *   (`aria-busy`), « Ouvrir » reste offert (le détail a ses propres états) ;
 * - `error` — une ligne d'erreur et « Réessayer » (`onRetry`), « Ouvrir » reste
 *   offert ;
 * - `denied` — la ligne de refus du kit, ni « Réessayer » (rejouer un refus
 *   d'audit n'apprend rien) ni « Ouvrir » (un détail refusé n'est pas un
 *   détail).
 *
 * « Ouvrir » fait 44 px, porte un focus visible et un nom accessible qui dit
 * QUOI s'ouvre (« Ouvrir Plateforme ») : cinq boutons « Ouvrir » identiques ne
 * se distinguent pas à l'oreille.
 */
export function AdminSummaryCard({
  language,
  id,
  title,
  glyph,
  values,
  sentence,
  state = 'ready',
  onRetry,
  onOpen,
  children,
}: {
  readonly language: AdminLanguage;
  /** L'ancre de recette : `data-admin-summary="<id>"`. */
  readonly id: string;
  readonly title: string;
  readonly glyph?: AdminGlyphName;
  /** De zéro à quatre chiffres, déjà dits en mots ; au-delà, la carte n'est plus un résumé. */
  readonly values: readonly AdminSummaryValue[];
  /** La phrase d'état (« Rien à signaler », « 2 services injoignables »). */
  readonly sentence?: string | null;
  readonly state?: 'ready' | 'loading' | 'error' | 'denied';
  readonly onRetry?: () => void;
  readonly onOpen: () => void;
  /** Un contenu propre à la zone, sous les chiffres (une alerte, une pastille). */
  readonly children?: ReactNode;
}) {
  const heading = useId();
  const shown = values.slice(0, 4);

  return (
    <section
      data-admin-summary={id}
      data-admin-summary-state={state}
      aria-labelledby={heading}
      aria-busy={state === 'loading'}
      className="grid content-start gap-3 rounded-card p-4 md:p-5"
      style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}
    >
      <div className="flex items-center gap-2">
        {glyph === undefined ? null : (
          <span aria-hidden="true" style={{ color: BRAND }}>
            <AdminGlyph name={glyph} size={20} />
          </span>
        )}
        <h3 id={heading} className="min-w-0 flex-1 text-body font-semibold" style={{ color: INK }}>
          {title}
        </h3>
      </div>

      {state === 'denied' ? (
        <AdminDeniedInline language={language} />
      ) : state === 'error' ? (
        <div className="grid gap-2">
          <p role="alert" className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.kit.error')}
          </p>
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
        </div>
      ) : shown.length === 0 ? null : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {shown.map((item) => (
            <div key={item.label} className="grid min-w-0 gap-1">
              <dt className="text-caption" style={{ color: INK2 }}>
                {item.label}
              </dt>
              <dd className="break-words text-title font-bold tabular-nums" style={{ color: INK }}>
                {state === 'loading' ? <span aria-hidden="true" className="block h-6 w-16 rounded-chip" style={{ backgroundColor: SKELETON }} /> : item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {state === 'ready' && sentence !== undefined && sentence !== null && sentence !== '' ? (
        <p data-admin-summary-sentence className="text-caption" style={{ color: INK3 }}>
          {sentence}
        </p>
      ) : null}

      {children}

      {state === 'denied' ? null : (
        <button
          type="button"
          data-admin-summary-open
          onClick={onOpen}
          aria-label={translateAdmin(language, 'admin.kit.summary.openNamed', { title })}
          className={`inline-flex w-fit items-center gap-1 justify-self-end rounded-chip px-4 text-body font-semibold ${FOCUS}`}
          style={{ minHeight: 44, minWidth: 44, color: BRAND, border: `1px solid ${EDGE}`, outlineColor: BRAND }}
        >
          {translateAdmin(language, 'admin.kit.summary.open')}
          <AdminGlyph name="caretRight" size={16} />
        </button>
      )}
    </section>
  );
}

/** La grille des cartes résumées : une colonne sous 32 rem de CONTENU, deux au-delà, trois dès 56 rem. */
export function AdminSummaryGrid({ children }: { readonly children: ReactNode }) {
  return (
    <div data-admin-summary-grid className="grid grid-cols-1 items-start gap-3 @lg:grid-cols-2 md:gap-4 @4xl:grid-cols-3">
      {children}
    </div>
  );
}
