import type { ReactNode } from 'react';

import type { AdminTarget } from '@/lib/admin/admin-routes';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminGlyph } from './admin-glyph';
import { AdminLink } from './entity-chip';
import { INK, INK2 } from './tone';

export type AdminCrumb = { readonly label: string; readonly target?: AdminTarget };

/**
 * L'EN-TÊTE DE PAGE (#8876) — le SEUL `<h1>` de l'écran, sa phrase d'aide, son
 * fil d'Ariane « Groupe › Section › Nom » et ses gestes principaux (sous le
 * titre sur petit écran, à sa droite dès `md`).
 */
export function AdminPageHeader({
  language,
  title,
  subtitle,
  crumbs,
  badges,
  actions,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly subtitle?: string;
  readonly crumbs?: readonly AdminCrumb[];
  readonly badges?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="grid gap-3" data-admin-page-header>
      {crumbs === undefined || crumbs.length === 0 ? null : (
        <nav aria-label={translateAdmin(language, 'admin.kit.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-1 text-caption" style={{ color: INK2 }}>
            {crumbs.map((crumb, index) => (
              <li key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index === 0 ? null : <AdminGlyph name="caretRight" size={12} className="rtl:-scale-x-100" />}
                {crumb.target === undefined || index === crumbs.length - 1 ? (
                  <span {...(index === crumbs.length - 1 ? { 'aria-current': 'page' as const } : {})}>{crumb.label}</span>
                ) : (
                  <AdminLink target={crumb.target} className="underline-offset-2 hover:underline">
                    {crumb.label}
                  </AdminLink>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 data-admin-page-title className="min-w-0 break-words text-screen font-bold" style={{ color: INK }}>
              {title}
            </h1>
            {badges}
          </div>
          {subtitle === undefined ? null : (
            <p className="text-body" style={{ color: INK2 }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions === undefined ? null : (
          <div data-admin-page-actions className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
