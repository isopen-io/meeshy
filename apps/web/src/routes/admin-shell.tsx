import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { AdminGlyph } from '@/components/admin/admin-glyph';
import { Glyph } from '@/components/glyph';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import type { AdminBack } from '@/lib/admin/admin-routes';
import {
  activeAdminSectionId,
  adminSpaceOf,
  readSidebarFolded,
  routeInSpace,
  writeSidebarFolded,
  type AdminSpace,
} from '@/lib/admin/admin-space';
import { ADMIN_GROUPS, visibleAdminSections, type ServedAdminSection } from '@/lib/admin/sections';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOptionalRoute } from '@/lib/router';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { Link } from '@/routes/route-table';

/**
 * **LE CADRE DE L'ADMINISTRATION** (#7873) — un back-office, pas un écran de
 * téléphone agrandi.
 *
 * Directive porteur du 2026-09-25 : « le contenu de pleine largeur, les
 * contrôleurs et le menu à gauche et le contenu à droite ; un menu toujours
 * accessible, repliable, et le contenu suit ».
 *
 * - Dès `md`, le menu est une COLONNE à gauche, repliable en rail d'icônes ;
 *   le repli est retenu par navigateur (`admin-space.ts`), et le contenu
 *   prend toute la largeur qui reste.
 * - Sous `md`, la colonne n'a pas la place : le menu reste accessible depuis
 *   l'en-tête, en TIROIR, qui se ferme sur un choix, sur Échap et sur le voile.
 *
 * Les sections viennent de `visibleAdminSections` — la même loi que le hub,
 * lue sur la matrice SERVIE : le menu n'offre jamais une section que la
 * passerelle refuserait. Et chaque lien reste dans l'ESPACE courant (`/adm`
 * ou `/admin`, D-76).
 */

export const ADMIN_HEADER_HEIGHT = 64;

const BRAND = 'var(--color-ios-brand)';
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const SURFACE = 'var(--color-ios-surface)';
const INK3 = 'var(--color-ios-ink-3)';
const EDGE = 'var(--color-edge)';

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function AdminNavItem({
  language,
  section,
  space,
  active,
  folded,
  onNavigate,
}: {
  readonly language: InterfaceLanguage;
  readonly section: ServedAdminSection;
  readonly space: AdminSpace;
  readonly active: string | null;
  readonly folded: boolean;
  readonly onNavigate?: () => void;
}) {
  const libelle = translateAdmin(language, section.labelKey);
  const actif = section.id === active;
  return (
    <li>
      <Link
        to={routeInSpace(section.route, space)}
        data-admin-nav={section.id}
        aria-current={actif ? 'page' : undefined}
        title={folded ? libelle : undefined}
        {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
        className={`flex items-center gap-3 rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2 ${folded ? 'justify-center' : ''}`}
        style={{
          minHeight: 44,
          outlineColor: BRAND,
          color: actif ? BRAND : INK,
          fontWeight: actif ? 600 : 500,
          backgroundColor: actif ? 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' : 'transparent',
        }}
      >
        <span aria-hidden="true" className="shrink-0">
          <AdminGlyph name={section.glyph} size={18} />
        </span>
        <span className={folded ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{libelle}</span>
      </Link>
    </li>
  );
}

/**
 * LE MENU GROUPÉ (#8876) — sept groupes titrés, dans l'ordre où ils se lisent ;
 * un groupe sans section visible n'est pas rendu. Replié en rail d'icônes, le
 * titre cède la place à un séparateur : les groupes restent lisibles sans mot.
 */
function AdminNav({
  language,
  sections,
  space,
  active,
  folded,
  onNavigate,
}: {
  readonly language: InterfaceLanguage;
  readonly sections: readonly ServedAdminSection[];
  readonly space: AdminSpace;
  readonly active: string | null;
  readonly folded: boolean;
  readonly onNavigate?: () => void;
}) {
  const groupes = ADMIN_GROUPS.map((groupe) => ({ groupe, entrees: sections.filter((section) => section.group === groupe.id) })).filter(
    ({ entrees }) => entrees.length > 0,
  );

  return (
    <nav aria-label={translateAdmin(language, 'admin.shell.menu')} className="min-h-0 flex-1 overflow-y-auto px-2">
      {groupes.map(({ groupe, entrees }, index) => (
        <div key={groupe.id} data-admin-nav-group={groupe.id} role="group" aria-label={translateAdmin(language, groupe.labelKey)}>
          {folded ? (
            index === 0 ? null : <hr aria-hidden="true" className="mx-3 my-2" style={{ border: 0, borderTop: `1px solid ${EDGE}` }} />
          ) : (
            <p aria-hidden="true" className="px-3 pb-1 pt-4 text-caption font-semibold uppercase" style={{ color: INK3 }}>
              {translateAdmin(language, groupe.labelKey)}
            </p>
          )}
          <ul className="grid gap-1">
            {entrees.map((section) => (
              <AdminNavItem
                key={section.id}
                language={language}
                section={section}
                space={space}
                active={active}
                folded={folded}
                {...(onNavigate === undefined ? {} : { onNavigate })}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BackToApp({ language, folded }: { readonly language: InterfaceLanguage; readonly folded: boolean }) {
  const libelle = translateAdmin(language, 'admin.shell.backToApp');
  return (
    <Link
      to="list"
      data-admin-leave
      title={folded ? libelle : undefined}
      className={`mx-2 mb-3 flex items-center gap-3 rounded-chip px-3 text-caption focus-visible:outline-2 focus-visible:outline-offset-2 ${folded ? 'justify-center' : ''}`}
      style={{ minHeight: 44, color: INK2, outlineColor: BRAND }}
    >
      <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
      <span className={folded ? 'sr-only' : 'truncate'}>{libelle}</span>
    </Link>
  );
}

function useAdminMenu() {
  const route = useOptionalRoute();
  const cle = route?.key ?? null;
  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const sections = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role);
  return { sections, space: adminSpaceOf(cle), active: activeAdminSectionId(cle) };
}

/**
 * OÙ VIT LE TITRE DE L'ÉCRAN (#8289).
 *
 * `'header'` (défaut) — dans l'en-tête, centré sur un téléphone.
 * `'content'` — l'écran pose lui-même son `<h1>` dans le contenu ; l'en-tête
 * ne garde que « ‹ libellé » à gauche et l'ACTION de l'écran à droite
 * (« Créer un compte »), comme une barre de navigation iOS.
 */
export type AdminHeading = 'header' | 'content';

export function AdminHeader({
  language,
  title,
  back,
  onMenu,
  heading = 'header',
  backLabel,
  actions,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  /**
   * Un écran de DÉTAIL revient à la liste d'où l'on vient, et dans l'ESPACE
   * d'où l'on vient (#6819, D-76). Le menu latéral couvre le reste.
   */
  readonly back: AdminBack;
  readonly onMenu?: () => void;
  readonly heading?: AdminHeading;
  /** Le libellé posé à droite du chevron de retour quand le titre vit dans le contenu. */
  readonly backLabel?: string;
  /** L'action principale de l'écran, en haut à droite de l'en-tête. */
  readonly actions?: ReactNode;
}) {
  const titreDansLeContenu = heading === 'content';
  return (
    <header
      className="flex shrink-0 items-center gap-1 px-2 md:px-6"
      style={{ height: ADMIN_HEADER_HEIGHT, borderBottom: `1px solid ${EDGE}` }}
      lang={language}
    >
      {onMenu === undefined ? null : (
        <button
          type="button"
          data-admin-menu-open
          aria-label={translateAdmin(language, 'admin.shell.open')}
          onClick={onMenu}
          className={`${CHROME_ACTION_HIT_CLASS} md:hidden focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: BRAND, outlineColor: BRAND }}
        >
          <ChromeActionDisc>
            <MenuGlyph />
          </ChromeActionDisc>
        </button>
      )}
      <Link
        to={back}
        aria-label={translate(language, 'pending.back')}
        data-admin-back
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
        </ChromeActionDisc>
      </Link>
      {titreDansLeContenu ? (
        <span data-admin-back-label className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: BRAND }}>
          {backLabel ?? title}
        </span>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-center text-body font-semibold md:text-start md:text-title" style={{ color: INK }}>
          {title}
        </h1>
      )}
      {actions === undefined ? (
        titreDansLeContenu ? null : <span aria-hidden="true" className="block shrink-0 md:hidden" style={{ width: 44 }} />
      ) : (
        <div className="flex shrink-0 items-center gap-2" data-admin-header-actions>
          {actions}
        </div>
      )}
    </header>
  );
}

/**
 * LE TIROIR DU PETIT ÉCRAN (#8020) — une couche modale comme les autres :
 * `useBackDismiss` lui donne son entrée d'historique, donc le retour matériel
 * de la coque Android le referme au lieu de quitter l'écran, comme Échap sur
 * le web.
 */
function AdminDrawer({
  language,
  sections,
  space,
  active,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly sections: readonly ServedAdminSection[];
  readonly space: AdminSpace;
  readonly active: string | null;
  readonly onClose: () => void;
}) {
  useBackDismiss(onClose);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex md:hidden" data-admin-drawer>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={translateAdmin(language, 'admin.shell.menu')}
        className="flex h-full w-[min(18rem,85vw)] flex-col pt-safe"
        style={{ backgroundColor: SURFACE, borderRight: `1px solid ${EDGE}` }}
      >
        <div className="flex shrink-0 items-center gap-2 px-3" style={{ height: ADMIN_HEADER_HEIGHT }}>
          <p className="min-w-0 flex-1 truncate text-body font-bold" style={{ color: INK }}>
            {translate(language, 'admin.title')}
          </p>
          <button
            type="button"
            data-admin-menu-close
            aria-label={translateAdmin(language, 'admin.shell.close')}
            onClick={onClose}
            className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
            style={{ color: INK2, outlineColor: BRAND }}
          >
            <Glyph name="x" size={16} />
          </button>
        </div>
        <AdminNav
          language={language}
          sections={sections}
          space={space}
          active={active}
          folded={false}
          onNavigate={onClose}
        />
        <BackToApp language={language} folded={false} />
      </div>
      <button
        type="button"
        aria-label={translateAdmin(language, 'admin.shell.close')}
        tabIndex={-1}
        onClick={onClose}
        className="flex-1"
        style={{ backgroundColor: 'color-mix(in srgb, black 40%, transparent)' }}
      />
    </div>
  );
}

export function AdminScreenFrame({
  language,
  title,
  back,
  fills = false,
  heading = 'header',
  backLabel,
  actions,
  children,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly back: AdminBack;
  /** Voir `AdminHeading` — `'content'` : l'écran pose son `<h1>` lui-même. */
  readonly heading?: AdminHeading;
  readonly backLabel?: string;
  readonly actions?: ReactNode;
  /**
   * L'ÉCRAN PORTE-T-IL SON PROPRE DÉFILEMENT ? (#6862, lot C)
   *
   * `false` (défaut) — le contenu défile dans la colonne de droite.
   * `true` — le contenu REMPLIT la hauteur et défile lui-même : la lecture
   * souveraine monte un fil VIRTUALISÉ, qui a besoin d'un conteneur de
   * hauteur BORNÉE (sans quoi il monte toutes les rangées, en silence).
   */
  readonly fills?: boolean;
  readonly children: ReactNode;
}) {
  const { sections, space, active } = useAdminMenu();
  const [folded, setFolded] = useState(readSidebarFolded);
  const [drawer, setDrawer] = useState(false);

  const basculer = () => {
    const suivant = !folded;
    setFolded(suivant);
    writeSidebarFolded(suivant);
  };

  return (
    <div className="flex h-dvh overflow-hidden pt-safe" data-admin-shell>
      <aside
        data-admin-sidebar
        data-folded={folded ? 'true' : 'false'}
        className="hidden shrink-0 flex-col transition-[width] duration-200 md:flex"
        style={{ width: folded ? 72 : 248, backgroundColor: SURFACE, borderRight: `1px solid ${EDGE}` }}
      >
        <div className={`flex shrink-0 items-center gap-2 px-3 ${folded ? 'justify-center' : ''}`} style={{ height: ADMIN_HEADER_HEIGHT }}>
          {folded ? null : (
            <p className="min-w-0 flex-1 truncate text-body font-bold" style={{ color: INK }}>
              {translate(language, 'admin.title')}
            </p>
          )}
          <button
            type="button"
            data-admin-sidebar-toggle
            aria-expanded={!folded}
            aria-label={translateAdmin(language, folded ? 'admin.shell.unfold' : 'admin.shell.fold')}
            onClick={basculer}
            className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
            style={{ color: INK2, outlineColor: BRAND }}
          >
            <Glyph name="caretLeft" size={16} style={{ transform: folded ? 'scaleX(-1)' : 'none' }} />
          </button>
        </div>
        <AdminNav language={language} sections={sections} space={space} active={active} folded={folded} />
        <BackToApp language={language} folded={folded} />
      </aside>

      {drawer ? (
        <AdminDrawer
          language={language}
          sections={sections}
          space={space}
          active={active}
          onClose={() => setDrawer(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          language={language}
          title={title}
          back={back}
          onMenu={() => setDrawer(true)}
          heading={heading}
          {...(backLabel === undefined ? {} : { backLabel })}
          {...(actions === undefined ? {} : { actions })}
        />
        {fills ? (
          <main id="contenu" className="flex min-h-0 flex-1 flex-col px-4 pb-safe md:px-8">
            <div className="flex min-h-0 w-full flex-1 flex-col pt-4">{children}</div>
          </main>
        ) : (
          <main id="contenu" className="flex flex-1 flex-col overflow-y-auto px-4 pb-safe md:px-8">
            <div className="w-full pt-4 pb-24">{children}</div>
          </main>
        )}
      </div>
    </div>
  );
}
