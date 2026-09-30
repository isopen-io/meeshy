import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import type { UserPresenceStatus } from '@/lib/api/types';
import type { AdminEntityKind, AdminTarget } from '@/lib/admin/admin-routes';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminGlyph, type AdminGlyphName } from './admin-glyph';
import { AdminLink } from './entity-chip';
import { EDGE, INK, INK2, SURFACE, toneBackground } from './tone';

const CARD = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;

/**
 * **LA FICHE D'UNE ENTITÉ** (#8876) — l'en-tête d'identité, le bandeau de
 * chiffres, une colonne principale et, dès `lg`, une colonne latérale de 20 rem
 * (les métadonnées interprétées). Sans `aside`, la colonne principale prend toute
 * la largeur. `data-admin-fiche` porte le genre, pour les recettes.
 */
export function AdminFiche({
  header,
  stats,
  aside,
  children,
  kind,
}: {
  readonly header: ReactNode;
  readonly stats?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly kind: AdminEntityKind;
}) {
  return (
    <div data-admin-fiche={kind} className="grid gap-6">
      {header}
      {stats}
      <div className={aside === undefined ? 'grid gap-6' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]'}>
        <div className="grid min-w-0 content-start gap-6">{children}</div>
        {aside === undefined ? null : (
          <aside data-admin-fiche-aside className="grid min-w-0 content-start gap-6">
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * L'EN-TÊTE D'IDENTITÉ — le VRAI nom (jamais un identifiant), son secondaire
 * (`@username`, type), l'avatar ou, sans avatar, le glyphe du genre, les badges
 * d'état et les gestes. Le nom est un `<h2>` : le `<h1>` de la page appartient à
 * `AdminPageHeader`.
 */
export function AdminIdentityHeader({
  title,
  secondary,
  avatar,
  glyph,
  badges,
  actions,
}: {
  readonly language: AdminLanguage;
  readonly title: string;
  readonly secondary?: string;
  readonly avatar?: {
    readonly initials: string;
    readonly color: string;
    readonly src?: string | null;
    readonly presence?: UserPresenceStatus;
  };
  readonly glyph?: AdminGlyphName;
  readonly badges?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div data-admin-identity className="flex flex-wrap items-center gap-4 rounded-card p-4 md:p-5" style={CARD}>
      {avatar === undefined ? (
        glyph === undefined ? null : (
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full" style={{ backgroundColor: toneBackground('brand'), color: 'var(--color-ios-brand)' }}>
            <AdminGlyph name={glyph} size={28} />
          </span>
        )
      ) : (
        <Avatar
          initials={avatar.initials}
          color={avatar.color}
          size={56}
          name={title}
          {...(avatar.src === undefined || avatar.src === null ? {} : { src: avatar.src })}
          {...(avatar.presence === undefined ? {} : { presence: avatar.presence })}
        />
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 className="min-w-0 break-words text-title font-semibold" style={{ color: INK }}>
          {title}
        </h2>
        {secondary === undefined ? null : (
          <p className="min-w-0 break-words text-caption" style={{ color: INK2 }}>
            {secondary}
          </p>
        )}
        {badges === undefined ? null : <div className="flex flex-wrap items-center gap-2 pt-1">{badges}</div>}
      </div>
      {actions === undefined ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type AdminStatStripItem = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly target?: AdminTarget;
};

/** Le bandeau de chiffres d'une fiche (quatre à huit) ; chacun est un lien vers la liste filtrée quand elle existe. */
export function AdminStatStrip({ items }: { readonly items: readonly AdminStatStripItem[] }) {
  return (
    <dl data-admin-stat-strip className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => {
        const inner = (
          <>
            <dt className="text-caption" style={{ color: INK2 }}>
              {item.label}
            </dt>
            <dd className="text-title font-bold tabular-nums" style={{ color: INK }}>
              {item.value}
            </dd>
          </>
        );
        return (
          <div key={item.id} data-admin-stat={item.id} className="rounded-card" style={CARD}>
            {item.target === undefined ? (
              <div className="grid gap-0.5 p-3 md:p-4">{inner}</div>
            ) : (
              <AdminLink target={item.target} className="grid gap-0.5 rounded-card p-3 focus-visible:outline-2 focus-visible:outline-offset-2 md:p-4" style={{ minHeight: 44 }}>
                {inner}
              </AdminLink>
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** Un bloc titré de la colonne principale : contenu, entités liées, activité, historique. */
export function AdminFicheSection({
  id,
  title,
  actions,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} data-admin-fiche-section={id} className="grid gap-3 rounded-card p-4 md:p-5" style={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-title font-semibold" style={{ color: INK }}>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
