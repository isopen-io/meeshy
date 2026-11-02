import type { ReactNode } from 'react';

import { adminEntityOfSection, adminTrailOf, type AdminPlace, type AdminTrailStep } from '@/lib/admin/admin-trail';
import type { AdminTarget } from '@/lib/admin/admin-routes';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminGlyph } from './admin-glyph';
import { AdminLink } from './entity-chip';
import { INK, INK2 } from './tone';

/**
 * L'EN-TÊTE DE PAGE (#8876) — le SEUL `<h1>` de l'écran, sa phrase d'aide, son
 * fil d'Ariane et ses gestes principaux (sous le titre sur petit écran, à sa
 * droite dès `md`).
 *
 * **L'ÉCRAN DIT OÙ IL EST, PAS COMMENT S'Y RENDRE** (#12670) — `place` nomme sa
 * section et dit s'il montre un objet ; le fil « groupe › section › objet » se
 * DÉRIVE de la table des routes (`adminTrailOf`). Il était écrit à la main sur
 * vingt-neuf écrans, et dérivait déjà du menu.
 *
 * - Sur une FICHE, le `<h1>` est le NOM de l'objet (`title`), et son genre
 *   (« Membre », « Conversation »…) passe en surtitre : on annonce qui l'on
 *   regarde, pas seulement ce que c'est.
 * - Le maillon du GROUPE mène au tableau de bord, sur ce groupe (`?group=`).
 * - Le fil ne se dessine que dès `md` : sur un téléphone, la barre du haut
 *   nomme déjà le parent (« ‹ Comptes ») — l'emplacement ne se dit qu'une fois.
 */
export function AdminPageHeader({
  language,
  title,
  subtitle,
  place,
  badges,
  actions,
}: {
  readonly language: AdminLanguage;
  readonly title: string;
  readonly subtitle?: string;
  /** Où est l'écran — sa section, et `fiche` s'il montre un objet dont `title` est le nom. */
  readonly place?: AdminPlace;
  readonly badges?: ReactNode;
  readonly actions?: ReactNode;
}) {
  const trail = place === undefined ? [] : adminTrailOf(place, place.object === null ? undefined : (place.object ?? title));
  const entity = place?.fiche === true ? adminEntityOfSection(place.section) : null;
  return (
    <header className="grid gap-3" data-admin-page-header>
      {trail.length === 0 ? null : (
        <nav aria-label={translateAdmin(language, 'admin.kit.breadcrumb')} className="hidden md:block" data-admin-trail>
          <ol className="flex flex-wrap items-center gap-1 text-caption" style={{ color: INK2 }}>
            {trail.map((step, index) => (
              <li key={`${index}-${step.kind}`} className="flex items-center gap-1" data-admin-trail-step={step.kind}>
                {index === 0 ? null : <AdminGlyph name="caretRight" size={12} />}
                <TrailStep language={language} step={step} />
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          {entity === null ? null : (
            <p data-admin-page-kind className="text-caption font-semibold uppercase" style={{ color: INK2 }}>
              {translateAdmin(language, `admin.kit.entity.${entity}`)}
            </p>
          )}
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

const LINK = 'underline-offset-2 hover:underline';

function TrailStep({ language, step }: { readonly language: AdminLanguage; readonly step: AdminTrailStep }) {
  if (step.kind === 'entity') return <span aria-current="page">{step.label}</span>;
  if (step.kind === 'section') {
    const label = translateAdmin(language, `admin.nav.${step.section}`);
    if (step.current) return <span aria-current="page">{label}</span>;
    return (
      <AdminLink target={{ kind: 'section', section: step.section }} className={LINK}>
        {label}
      </AdminLink>
    );
  }
  const target: AdminTarget = { kind: 'section', section: 'dashboard', search: { group: step.group } };
  return (
    <AdminLink target={target} className={LINK}>
      {translateAdmin(language, `admin.group.${step.group}`)}
    </AdminLink>
  );
}
