import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';

import { CollapsingHeader } from '@/components/collapsing-header';
import { PRESS } from '@/components/game-press';
import { GlassBack } from '@/components/glass-surface';
import { Glyph } from '@/components/glyph';
import { chainBelow, gameScreenOf, parentOf, upMove, type GameScreen, type HistoryEntry, type NavTarget } from '@/lib/game/progression-nav';
import { currentHistory, reelsExitOf } from '@/lib/reels/exit';
import { gameText } from '@/lib/view/game-copy';
import { useOptionalRoute } from '@/lib/router';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * LA COQUILLE D'UNE PAGE DE « PROGRESSION » (#9563, amendements n° 2, 3 et 4) —
 * la première page, les fiches, les sous-pages, le carnet des règles et le carnet
 * de progression la partagent : le conteneur qui défile, son verrou horizontal,
 * et l'en-tête qui se réduit posé DEDANS, pour que le contenu passe sous le verre.
 *
 * Aucune route n'écrit plus son `<header>` ni son `<main>` : un en-tête statique
 * au-dessus du défilement est le défaut que le porteur a relevé, et quinze pages
 * qui le réécrivent le feraient revenir une par une.
 *
 * LE RETOUR VIENT DE LA CARTE DE NAVIGATION (`lib/game/progression-nav.ts`),
 * jamais d'une page : la coquille lit l'écran que la route EST et remonte à son
 * parent. Trois mécanismes, pour une navigation qui ne souffre de rien :
 *
 *   · « retour » RECULE jusqu'au parent quand il est dans la suite d'écrans du
 *     jeu qui précède — même entrée d'historique, donc même position — et
 *     REMPLACE l'écran par son parent sinon (`upMove`) ;
 *   · un écran ouvert de l'EXTÉRIEUR (notification, bandeau, lien profond)
 *     reçoit ses ancêtres sous lui (`chainBelow`) : le retour système d'Android
 *     remonte alors au parent comme le disque de verre ;
 *   · chaque entrée d'historique retrouve sa position de défilement ; une entrée
 *     neuve part du haut.
 *
 * Sans l'API Navigation (qui seule dit ce qu'il y a sous l'écran), « retour »
 * avance vers le parent : jamais d'impasse, au prix d'une entrée de plus.
 */

export const pathOfTarget = (target: NavTarget): string =>
  target.to === 'progressionConcept' ? href('progressionConcept', { concept: target.concept }) : href(target.to);

type NavigationEntryLike = { readonly url: string | null; readonly key: string; readonly index: number };
type NavigationLike = { readonly currentEntry: NavigationEntryLike | null; readonly entries: () => readonly NavigationEntryLike[] };

function navigationApi(): NavigationLike | null {
  const navigation = (window as Window & { readonly navigation?: Partial<NavigationLike> }).navigation;
  return navigation !== undefined && typeof navigation.entries === 'function' && navigation.currentEntry !== undefined ? (navigation as NavigationLike) : null;
}

const pathOfUrl = (url: string | null): string => {
  if (url === null) return '';
  const parsed = new URL(url, window.location.href);
  return parsed.origin === window.location.origin ? `${parsed.pathname}${parsed.search}` : '';
};

/** L'historique de l'onglet, tel que l'API Navigation le montre ; `null` là où elle n'existe pas. */
function readHistory(): { readonly entries: readonly HistoryEntry[]; readonly index: number } | null {
  const navigation = navigationApi();
  const current = navigation?.currentEntry ?? null;
  if (navigation === null || current === null) return null;
  return { entries: navigation.entries().map((entry) => ({ path: pathOfUrl(entry.url), key: entry.key })), index: current.index };
}

function goUp(screen: GameScreen | null): void {
  const parent: NavTarget = screen === null ? { to: 'progression' } : parentOf(screen);
  if (parent.to === 'list') {
    if (reelsExitOf(currentHistory()) === 'back') window.history.back();
    else navigate(href('list'), true);
    return;
  }
  const parentPath = pathOfTarget(parent);
  const history = readHistory();
  const move = upMove({ parentPath, entries: history?.entries ?? null, index: history?.index ?? 0 });
  if (move.kind === 'traverse') window.history.go(move.delta);
  else navigate(parentPath, move.kind === 'replace');
}

/** Glisse les ancêtres de l'écran sous lui quand il est ouvert de l'extérieur du jeu (voir `chainBelow`). */
function buildChain(screen: GameScreen): void {
  const history = readHistory();
  if (history === null) return;
  const previous = history.index > 0 ? (history.entries[history.index - 1]?.path ?? null) : null;
  const chain = chainBelow({ screen, previousPath: previous, pathOf: pathOfTarget });
  const [first, ...rest] = chain;
  if (first === undefined) return;
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const state: unknown = window.history.state;
  window.history.replaceState(null, '', first);
  rest.forEach((path) => window.history.pushState(null, '', path));
  window.history.pushState(state, '', here);
}

/** Les positions de défilement, par entrée d'historique (clé de l'API Navigation, sinon l'adresse). Bornées. */
const positions = new Map<string, number>();
const MAX_POSITIONS = 40;

const entryKey = (): string => navigationApi()?.currentEntry?.key ?? `${window.location.pathname}${window.location.search}`;

function remember(key: string, top: number): void {
  positions.delete(key);
  positions.set(key, top);
  const oldest = positions.keys().next().value;
  if (positions.size > MAX_POSITIONS && oldest !== undefined) positions.delete(oldest);
}

const BACK = `${PRESS} grid size-11 shrink-0 place-items-center`;
const BRAND = 'var(--color-ios-brand)';

function BackLink({ screen }: { readonly screen: GameScreen | null }) {
  const parent: NavTarget = screen === null ? { to: 'progression' } : parentOf(screen);
  const label = parent.to === 'list' ? 'Retour' : gameText('game.page.back');
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    goUp(screen);
  };
  const common = { className: BACK, style: { color: BRAND }, 'aria-label': label, onClick } as const;
  const disc = (
    <GlassBack label={label}>
      <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
    </GlassBack>
  );
  return parent.to === 'progressionConcept' ? (
    <Link to="progressionConcept" params={{ concept: parent.concept }} data-page-back={parent.concept} {...common}>
      {disc}
    </Link>
  ) : (
    <Link to={parent.to} data-page-back={parent.to} {...common}>
      {disc}
    </Link>
  );
}

export function ProgressionShell({
  title,
  trailing,
  notice,
  screen: given,
  children,
}: {
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly notice?: ReactNode;
  /** L'écran de la carte que cette page EST — lu de la route ; à donner seulement hors routeur (un témoin). */
  readonly screen?: GameScreen;
  readonly children: ReactNode;
}) {
  const route = useOptionalRoute();
  const screen = given ?? (route === null ? null : gameScreenOf(route));
  const main = useRef<HTMLElement>(null);
  const identity = screen === null ? '' : JSON.stringify(screen);

  useLayoutEffect(() => {
    const scroller = main.current;
    if (scroller === null) return undefined;
    if (screen !== null) buildChain(screen);
    const key = entryKey();
    const saved = positions.get(key);
    if (saved !== undefined) scroller.scrollTop = saved;
    const save = (): void => remember(key, scroller.scrollTop);
    scroller.addEventListener('scroll', save, { passive: true });
    return () => scroller.removeEventListener('scroll', save);
    // L'écran se lit par son identité : un objet neuf à chaque rendu ne refait rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <main ref={main} id="contenu" className="relative flex-1 overflow-y-auto overflow-x-clip overscroll-x-none break-words pb-safe">
        <CollapsingHeader title={title} back={<BackLink screen={screen} />} trailing={trailing} notice={notice} />
        {children}
      </main>
    </div>
  );
}

/** La bande « Hors ligne », collée sous la barre. */
export function OfflineNotice({ children }: { readonly children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, var(--color-ios-surface))', color: 'var(--color-ios-ink)' }}
    >
      <Glyph name="warningCircle" size={11} />
      {children}
    </p>
  );
}
