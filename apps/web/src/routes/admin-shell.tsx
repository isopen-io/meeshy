import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { AdminGlyph } from '@/components/admin/admin-glyph';
import { Glyph } from '@/components/glyph';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import type { AdminBack } from '@/lib/admin/admin-routes';
import { focusMainHeading, requestMainHeadingFocus, takeMainHeadingFocusRequest, trappedTabTarget } from '@/lib/admin/drawer-focus';
import {
  activeAdminSectionId,
  adminSpaceOf,
  readSidebarFolded,
  routeInSpace,
  writeSidebarFolded,
  type AdminSpace,
} from '@/lib/admin/admin-space';
import { matchesNavQuery } from '@/lib/admin/nav-filter';
import { ADMIN_GROUPS, visibleAdminSections, type ServedAdminSection } from '@/lib/admin/sections';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
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
  readonly language: AdminLanguage;
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
 * ↑ ↓ DÉBUT FIN DANS LE MENU (#12670) — on parcourt les entrées comme une liste, sans
 * tabuler une à une ; ↑ depuis la première remonte au champ « Aller à… ».
 */
function moveInMenu(event: ReactKeyboardEvent<HTMLElement>, nav: HTMLElement | null, filter: HTMLInputElement | null): void {
  if (nav === null || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[data-admin-nav]')];
  const index = links.findIndex((link) => link === document.activeElement);
  if (index === -1 || links.length === 0) return;
  event.preventDefault();
  if (event.key === 'Home') return links[0]?.focus();
  if (event.key === 'End') return links.at(-1)?.focus();
  if (event.key === 'ArrowDown') return links[Math.min(index + 1, links.length - 1)]?.focus();
  if (index === 0 && filter !== null) return filter.focus();
  links[Math.max(index - 1, 0)]?.focus();
}

/** Le raccourci vers « Aller à… » : `Ctrl/⌘ K` partout, `/` hors d'un champ de saisie. */
function isMenuShortcut(event: KeyboardEvent): boolean {
  if (event.altKey) return false;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') return true;
  if (event.key !== '/' || event.ctrlKey || event.metaKey) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  return target === null || !(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Le menu latéral est-il à l'écran ? — dès `md` (48rem), sinon c'est le tiroir. */
const sidebarShown = (): boolean => window.matchMedia?.('(min-width: 48rem)').matches ?? true;

/**
 * LE MENU GROUPÉ (#8876) — huit groupes titrés, dans l'ordre où ils se lisent ;
 * un groupe sans section visible n'est pas rendu. Replié en rail d'icônes, le
 * titre cède la place à un séparateur : les groupes restent lisibles sans mot.
 *
 * « ALLER À… » (#10562) — déplié, un champ en tête filtre les entrées (libellé ou
 * groupe, sans casse ni accents : `matchesNavQuery`) ; Entrée suit la première
 * section trouvée, Échap efface la recherche (et seulement elle : le tiroir reste
 * ouvert). Replié, le rail n'a pas la place d'un champ : il n'en porte pas.
 *
 * Le clavier y va sans détour (#12670) : `Ctrl/⌘ K` ou `/` depuis n'importe quel écran
 * (le rail se déplie, le tiroir s'ouvre), ↓ du champ à la première entrée, puis
 * ↑ ↓ Début Fin d'une entrée à l'autre (`moveInMenu`).
 */
function AdminNav({
  language,
  sections,
  space,
  active,
  folded,
  onNavigate,
  filterRef,
}: {
  readonly language: AdminLanguage;
  readonly sections: readonly ServedAdminSection[];
  readonly space: AdminSpace;
  readonly active: string | null;
  readonly folded: boolean;
  readonly onNavigate?: () => void;
  /** Le champ « Aller à… », que le raccourci clavier du cadre vient chercher (#12670). */
  readonly filterRef?: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState('');
  const nav = useRef<HTMLElement>(null);
  const navId = useId();
  const search = folded ? '' : query;
  const groupes = ADMIN_GROUPS.map((groupe) => {
    const titre = translateAdmin(language, groupe.labelKey);
    return { groupe, entrees: sections.filter((section) => section.group === groupe.id && matchesNavQuery(search, [translateAdmin(language, section.labelKey), titre])) };
  }).filter(({ entrees }) => entrees.length > 0);

  return (
    <>
      {folded || sections.length === 0 ? null : (
        <div className="shrink-0 px-3 pb-1">
          <label className="flex items-center gap-2 rounded-chip px-3" style={{ minHeight: 44, border: `1px solid ${EDGE}`, color: INK3 }}>
            <AdminGlyph name="magnifyingGlass" size={16} />
            <input
              ref={filterRef}
              type="search"
              data-admin-nav-filter
              aria-keyshortcuts="Control+K Meta+K /"
              value={query}
              aria-label={translateAdmin(language, 'admin.navFilter.label')}
              aria-controls={navId}
              placeholder={translateAdmin(language, 'admin.navFilter.placeholder')}
              autoComplete="off"
              spellCheck={false}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onChange={() => undefined}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  nav.current?.querySelector<HTMLAnchorElement>('a[data-admin-nav]')?.focus();
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  nav.current?.querySelector<HTMLAnchorElement>('a[data-admin-nav]')?.click();
                  return;
                }
                if (event.key !== 'Escape' || query === '') return;
                event.preventDefault();
                event.stopPropagation();
                setQuery('');
              }}
              className="min-w-0 flex-1 bg-transparent text-body outline-none"
              style={{ minHeight: 42, color: INK }}
            />
            {query === '' ? (
              <kbd aria-hidden="true" className="shrink-0 rounded-chip px-1.5 text-caption" style={{ border: `1px solid ${EDGE}`, color: INK3 }}>
                /
              </kbd>
            ) : null}
          </label>
        </div>
      )}
      <nav
        ref={nav}
        id={navId}
        aria-label={translateAdmin(language, 'admin.shell.menu')}
        className="min-h-0 flex-1 overflow-y-auto px-2"
        onKeyDown={(event) => moveInMenu(event, nav.current, filterRef?.current ?? null)}
      >
        {groupes.length === 0 && search.trim() !== '' ? (
          <p role="status" data-admin-nav-empty className="px-3 pt-4 text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.navFilter.empty')}
          </p>
        ) : null}
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
    </>
  );
}

function BackToApp({ language, folded }: { readonly language: AdminLanguage; readonly folded: boolean }) {
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
  readonly language: AdminLanguage;
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
  /* L'EMPLACEMENT NE SE DIT QU'UNE FOIS (#12670) : quand l'écran pose son titre et son fil
     d'Ariane dans le contenu, le menu latéral et le fil couvrent le retour dès `md` — la
     barre ne garde alors que l'action de l'écran, et disparaît s'il n'en a pas. */
  const retourSurTelephoneSeul = titreDansLeContenu ? 'md:hidden' : '';
  const barreSurTelephoneSeule = titreDansLeContenu && actions === undefined ? 'md:hidden' : '';
  return (
    <header
      data-admin-header
      className={`flex shrink-0 items-center gap-1 px-2 md:px-6 ${barreSurTelephoneSeule}`.trim()}
      style={{ height: ADMIN_HEADER_HEIGHT, borderBottom: `1px solid ${EDGE}` }}
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
        className={`${CHROME_ACTION_HIT_CLASS} ${retourSurTelephoneSeul} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      {titreDansLeContenu ? (
        <span data-admin-back-label className={`min-w-0 flex-1 truncate text-body font-semibold ${retourSurTelephoneSeul}`} style={{ color: BRAND }}>
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
        <div className="flex shrink-0 items-center gap-2 md:ml-auto" data-admin-header-actions>
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
  focusFilter = false,
}: {
  readonly language: AdminLanguage;
  readonly sections: readonly ServedAdminSection[];
  readonly space: AdminSpace;
  readonly active: string | null;
  readonly onClose: () => void;
  /** Ouvert par le raccourci clavier (#12670) : le focus entre dans « Aller à… », pas sur la fermeture. */
  readonly focusFilter?: boolean;
}) {
  useBackDismiss(onClose);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const followed = useRef(false);

  useEffect(() => {
    if (focusFilter && filter.current !== null) filter.current.focus();
    else closeButton.current?.focus();
    return () => {
      const trigger = document.querySelector<HTMLElement>('[data-admin-menu-open]');
      if (!followed.current) {
        if (trigger?.isConnected) trigger.focus();
        return;
      }
      const screen = document.getElementById('contenu');
      requestMainHeadingFocus();
      requestAnimationFrame(() => {
        if (screen?.isConnected) focusMainHeading();
      });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || dialog.current === null) return;
      const target = trappedTabTarget(dialog.current, document.activeElement, event.shiftKey);
      if (target === null) return;
      event.preventDefault();
      target.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const follow = () => {
    followed.current = true;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex md:hidden" data-admin-drawer>
      <div
        ref={dialog}
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
            ref={closeButton}
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
          onNavigate={follow}
          filterRef={filter}
        />
        <BackToApp language={language} folded={false} />
      </div>
      <button
        type="button"
        aria-label={translateAdmin(language, 'admin.shell.close')}
        tabIndex={-1}
        onClick={onClose}
        className="flex-1"
        style={{ backgroundColor: 'var(--color-scrim-soft)' }}
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
  readonly language: AdminLanguage;
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
  const [drawer, setDrawer] = useState<false | 'menu' | 'filter'>(false);
  const [filterRequest, setFilterRequest] = useState(0);
  const sidebarFilter = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (takeMainHeadingFocusRequest()) focusMainHeading();
  }, []);

  /* LE RACCOURCI VERS « ALLER À… » (#12670) — dès `md`, le menu latéral (déplié s'il
     était en rail) reçoit le focus dans son champ ; sur un téléphone, le tiroir s'ouvre
     dessus, ou s'y place s'il est déjà ouvert. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isMenuShortcut(event)) return;
      event.preventDefault();
      if (sidebarShown()) {
        setFolded((replie) => {
          if (replie) writeSidebarFolded(false);
          return false;
        });
        setFilterRequest((demande) => demande + 1);
        return;
      }
      const ouvert = document.querySelector<HTMLInputElement>('[data-admin-drawer] [data-admin-nav-filter]');
      if (ouvert !== null) ouvert.focus();
      else setDrawer('filter');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (filterRequest > 0) sidebarFilter.current?.focus();
  }, [filterRequest]);

  const basculer = () => {
    const suivant = !folded;
    setFolded(suivant);
    writeSidebarFolded(suivant);
  };

  return (
    <div className="flex h-dvh overflow-hidden pt-safe" data-admin-shell lang={language} dir="ltr">
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
        <AdminNav language={language} sections={sections} space={space} active={active} folded={folded} filterRef={sidebarFilter} />
        <BackToApp language={language} folded={folded} />
      </aside>

      {drawer === false ? null : (
        <AdminDrawer
          language={language}
          sections={sections}
          space={space}
          active={active}
          onClose={() => setDrawer(false)}
          focusFilter={drawer === 'filter'}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          language={language}
          title={title}
          back={back}
          onMenu={() => setDrawer('menu')}
          heading={heading}
          {...(backLabel === undefined ? {} : { backLabel })}
          {...(actions === undefined ? {} : { actions })}
        />
        {fills ? (
          <main id="contenu" className="flex min-h-0 flex-1 flex-col px-4 pb-safe md:px-8">
            <div className="@container flex min-h-0 w-full flex-1 flex-col pt-4">{children}</div>
          </main>
        ) : (
          <main id="contenu" className="flex flex-1 flex-col overflow-y-auto px-4 pb-safe md:px-8">
            <div className="@container w-full pt-4 pb-24">{children}</div>
          </main>
        )}
      </div>
    </div>
  );
}
