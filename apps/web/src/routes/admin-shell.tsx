import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph } from '@/components/glyph';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import {
  activeAdminSectionId,
  adminSpaceOf,
  readSidebarFolded,
  routeInSpace,
  writeSidebarFolded,
  type AdminSpace,
} from '@/lib/admin/admin-space';
import { visibleAdminSections, type ServedAdminSection } from '@/lib/admin/sections';
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
const EDGE = 'var(--color-edge)';

type Back = 'list' | 'admin' | 'adminUsers' | 'admUsers' | 'adminAnonymous' | 'admAnonymous';

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

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
  return (
    <nav aria-label={translateAdmin(language, 'admin.shell.menu')} className="min-h-0 flex-1 overflow-y-auto px-2">
      <ul className="grid gap-1">
        {sections.map((section) => {
          const libelle = translateAdmin(language, section.labelKey);
          const actif = section.id === active;
          return (
            <li key={section.id}>
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
                <span aria-hidden="true" className="shrink-0 text-body">
                  {section.glyph}
                </span>
                <span className={folded ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{libelle}</span>
              </Link>
            </li>
          );
        })}
      </ul>
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
      <Glyph name="caretLeft" size={16} />
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

export function AdminHeader({
  language,
  title,
  back,
  onMenu,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  /**
   * Un écran de DÉTAIL revient à la liste d'où l'on vient, et dans l'ESPACE
   * d'où l'on vient (#6819, D-76). Le menu latéral couvre le reste.
   */
  readonly back: Back;
  readonly onMenu?: () => void;
}) {
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
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-center text-body font-semibold md:text-left md:text-title" style={{ color: INK }}>
        {title}
      </h1>
      <span aria-hidden="true" className="block shrink-0 md:hidden" style={{ width: 44 }} />
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
  children,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly back: Back;
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
        <AdminHeader language={language} title={title} back={back} onMenu={() => setDrawer(true)} />
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
