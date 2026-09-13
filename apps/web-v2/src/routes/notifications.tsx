import { useCallback, useMemo, useRef, useState } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import { NOTIFICATIONS_GLYPHS, type NotificationsGlyphName } from '@/components/glyphs-notifications';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { NotificationRow } from '@/components/notification-row';
import { PullIndicator } from '@/components/pull-indicator';
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/api/notifications';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { NOTIFICATION_CATEGORIES, categoryHue, type NotificationCategory } from '@/lib/notifications/categories';
import type { NotificationRecord } from '@/lib/notifications/record';
import { useSearch } from '@/lib/router';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { useNotificationCounts } from '@/lib/view/use-notification-counts';
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  refreshNotificationsAction,
  useNotifications,
} from '@/lib/view/use-notifications';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { Link } from '@/routes/route-table';

/**
 * **LA CLOCHE** (#6288) — deuxième barreau de l'échelle, miroir de
 * `NotificationListView` (`packages/MeeshySDK/Sources/MeeshyUI/Notifications/
 * NotificationListView.swift`) : en-tête avec retour, compte de non-lues et
 * « Tout lire » ; rail de onze catégories ; liste paginée, tirer pour
 * rafraîchir. Remplace l'écran d'attente de #6214.
 *
 * **La catégorie vit dans l'ADRESSE** (`?categorie=`), jamais dans un état
 * local : le retour arrière la rend, un lien la partage, et la mémoire de
 * défilement (`useScrollportMemory`) se tient par catégorie. « Toutes » est
 * l'absence du paramètre.
 *
 * **Cache d'abord, à chaque niveau** : une catégorie en cache se peint sans
 * requête visible ; une catégorie jamais ouverte se peint avec les lignes de
 * « Toutes » qui lui appartiennent (`use-notifications.ts`) ; le squelette ne
 * vient que sur un cache vide. Ouvrir une ligne, la marquer lue, la supprimer
 * ou tout lire sont OPTIMISTES (`notifications-actions.ts`) : la pastille du
 * bouton flottant baisse au geste, et revient si la passerelle refuse — l'écran
 * annonce alors l'échec.
 *
 * **Le couloir des disques flottants.** Les deux disques se posent sous
 * l'en-tête et le rail (`floating-corridor.ts`, 126 → 178) ; la première
 * rangée commence SOUS eux au repos, jamais dessous — sinon le disque de
 * gauche couvrirait l'avatar, celui de droite l'heure et le menu de la ligne.
 * `scripts/check-notifications.mjs` le mesure par `elementFromPoint`.
 */

export const NOTIFICATIONS_HEADER_HEIGHT = 64;
export const NOTIFICATIONS_RAIL_HEIGHT = 52;
export const NOTIFICATIONS_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - NOTIFICATIONS_HEADER_HEIGHT - NOTIFICATIONS_RAIL_HEIGHT;

/** La hauteur d'une rangée à deux lignes — l'échelle de la marge du défilement infini. */
const ROW_HEIGHT_ESTIMATE = 84;

const CATEGORY_PARAM = 'categorie';

const EMPTY: readonly NotificationRecord[] = [];

/** L'encre indigo lisible dans les deux schémas — celle du pied de liste
 * (`lens-pagination-footer.tsx`, 6,29:1 en clair) : `--color-ios-brand` nu
 * tombe sous AA pour un texte de cette taille sur fond clair. */
const BRAND_INK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';

type CategoryGlyph = { readonly set: 'socle'; readonly name: GlyphName } | { readonly set: 'ecran'; readonly name: NotificationsGlyphName };

/** `NotificationCategory.icon` d'iOS, glyphe pour glyphe (`extract-glyphs.mjs` § NOTIFICATIONS). */
const CATEGORY_GLYPHS: Readonly<Record<NotificationCategory, CategoryGlyph>> = {
  all: { set: 'socle', name: 'bell' },
  unread: { set: 'ecran', name: 'circle' },
  messages: { set: 'ecran', name: 'chatCircle' },
  reactions: { set: 'ecran', name: 'heart' },
  mentions: { set: 'ecran', name: 'at' },
  social: { set: 'ecran', name: 'thumbsUp' },
  contacts: { set: 'ecran', name: 'userPlus' },
  groups: { set: 'ecran', name: 'usersThree' },
  calls: { set: 'socle', name: 'phone' },
  translations: { set: 'ecran', name: 'globe' },
  system: { set: 'ecran', name: 'gear' },
};

function CategoryGlyphView({ category, size }: { readonly category: NotificationCategory; readonly size: number }) {
  const glyph = CATEGORY_GLYPHS[category];
  return glyph.set === 'socle' ? <Glyph name={glyph.name} size={size} /> : <GlyphSvg glyph={NOTIFICATIONS_GLYPHS[glyph.name]} size={size} />;
}

const categoryLabel = (language: InterfaceLanguage, category: NotificationCategory): string =>
  translate(language, `notifications.category.${category}` as const);

function categoryFromSearch(raw: string | null): NotificationCategory {
  return NOTIFICATION_CATEGORIES.find((category) => category === raw) ?? 'all';
}

export function NotificationsHeader({
  language,
  unread,
  onMarkAllRead,
}: {
  readonly language: InterfaceLanguage;
  readonly unread: number;
  readonly onMarkAllRead: () => void;
}) {
  const count =
    unread > 0
      ? translate(language, unread === 1 ? 'notifications.unreadCount.one' : 'notifications.unreadCount.other', { count: String(unread) })
      : null;

  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: NOTIFICATIONS_HEADER_HEIGHT }}>
      <Link
        to="list"
        aria-label={translate(language, 'pending.back')}
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'root.menu.notifications')}
        </h1>
        {count === null ? null : (
          <p data-unread-count className={`text-chip font-medium ${BRAND_INK}`}>
            {count}
          </p>
        )}
      </div>
      {unread > 0 ? (
        <button
          type="button"
          data-mark-all-read
          onClick={onMarkAllRead}
          className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 ${BRAND_INK}`}
          style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'notifications.markAllRead')}
        </button>
      ) : null}
    </header>
  );
}

/**
 * Le rail de iOS (`filterBar`) : une capsule par catégorie, teintée de sa
 * couleur. Divergence ASSUMÉE sur un point : iOS peint le texte de la puce
 * sélectionnée en BLANC sur la teinte pleine — 1,9:1 sur le jaune de « Social »,
 * illisible. Ici le texte reste à l'encre (`--color-ios-ink`), la teinte porte
 * le fond et le filet : le code couleur survit, le contraste aussi.
 */
export function NotificationCategoryRail({
  language,
  selected,
  onSelect,
}: {
  readonly language: InterfaceLanguage;
  readonly selected: NotificationCategory;
  readonly onSelect: (category: NotificationCategory) => void;
}) {
  return (
    <div
      role="group"
      aria-label={translate(language, 'notifications.categories')}
      className="scrollbar-none flex shrink-0 items-center gap-2 overflow-x-auto px-4"
      style={{ height: NOTIFICATIONS_RAIL_HEIGHT }}
    >
      {NOTIFICATION_CATEGORIES.map((category) => {
        const pressed = category === selected;
        const hue = categoryHue(category);
        return (
          <button
            key={category}
            type="button"
            data-category={category}
            aria-pressed={pressed}
            onClick={() => onSelect(category)}
            className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
            style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
          >
            <span
              className="flex items-center gap-1.5 rounded-chip px-3 text-caption font-semibold"
              style={{
                height: 30,
                color: 'var(--color-ios-ink)',
                backgroundColor: `color-mix(in srgb, ${hue} ${pressed ? 24 : 10}%, transparent)`,
                boxShadow: pressed ? `inset 0 0 0 1.5px ${hue}` : 'none',
              }}
            >
              <span className="grid place-items-center" style={{ color: 'var(--color-ios-ink-2)' }}>
                <CategoryGlyphView category={category} size={12} />
              </span>
              {categoryLabel(language, category)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function emptyTitle(language: InterfaceLanguage, category: NotificationCategory): string {
  if (category === 'all') return translate(language, 'notifications.empty.all');
  if (category === 'unread') return translate(language, 'notifications.empty.unread');
  return translate(language, 'notifications.empty.category', { category: categoryLabel(language, category) });
}

export function NotificationsEmpty({ language, category }: { readonly language: InterfaceLanguage; readonly category: NotificationCategory }) {
  return (
    <li data-notifications-empty className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center">
      <span style={{ color: `color-mix(in srgb, ${categoryHue(category)} 60%, var(--color-ios-ink-2))` }}>
        <CategoryGlyphView category={category} size={44} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {emptyTitle(language, category)}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'notifications.empty.subtitle')}
      </p>
    </li>
  );
}

/** `status === 'error'` À CACHE VIDE — sur un cache non vide, la liste reste. */
export function NotificationsError({
  language,
  online,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly online: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, online ? 'notifications.error.title' : 'notifications.offline.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, online ? 'notifications.error.body' : 'notifications.offline.body')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'notifications.retry')}
      </button>
    </li>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

/** Le démarrage à froid SEUL — l'annonce « Chargement » vit sur le scrollport. */
export function NotificationsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {SKELETON_ROWS.map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--color-edge)' }}>
          <div className="shrink-0 rounded-full" style={{ width: 44, height: 44, backgroundColor: 'var(--color-edge)' }} />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="rounded-chip" style={{ width: '70%', height: 12, backgroundColor: 'var(--color-edge)' }} />
            <div className="rounded-chip" style={{ width: '45%', height: 10, backgroundColor: 'var(--color-edge)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsScreen() {
  const language = currentInterfaceLanguage();
  const [search, setSearch] = useSearch();
  const category = categoryFromSearch(search.get(CATEGORY_PARAM));
  const frame = useRef<HTMLUListElement | null>(null);
  useScrollportMemory(frame);
  const online = useOnline();
  /* `minute` est la CLÉ qui refait `now` chaque minute (motif `feed.tsx`) :
     l'heure relative des rangées avance sans que rien d'autre ne bouge. */
  const minute = useMinute();
  const now = useMemo(() => new Date(), [minute]);
  const list = useNotifications(category);
  const counts = useNotificationCounts();
  const [announcement, setAnnouncement] = useState('');

  const notifications = list.data ?? EMPTY;
  const unread = counts.data?.unread ?? notifications.filter((n) => !n.state.isRead).length;
  const loading = list.data === undefined && !list.isError;
  const paginationState = paginationStateOf(list);

  const onSelect = useCallback(
    (next: NotificationCategory) => {
      const kept = [...search.entries()].filter(([name]) => name !== CATEGORY_PARAM);
      setSearch(new URLSearchParams(next === 'all' ? kept : [...kept, [CATEGORY_PARAM, next]]), true);
    },
    [search, setSearch],
  );

  const announceFailure = useCallback(
    (ok: boolean) => {
      if (!ok) setAnnouncement(translate(language, 'notifications.failure'));
    },
    [language],
  );
  const onOpen = useCallback((id: string) => void markNotificationReadAction(id).then(announceFailure), [announceFailure]);
  const onDelete = useCallback((id: string) => void deleteNotificationAction(id).then(announceFailure), [announceFailure]);
  const onMarkAllRead = useCallback(() => void markAllNotificationsReadAction().then(announceFailure), [announceFailure]);
  const onRefresh = useCallback(() => refreshNotificationsAction(category), [category]);

  const pull = usePullToRefresh({ root: frame, onRefresh, threshold: PULL_THRESHOLD });
  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(ROW_HEIGHT_ESTIMATE),
    enabled: paginationState === 'idle' && notifications.length > 0,
    onReach: () => void list.fetchNextPage(),
  });

  const body =
    list.data === undefined && list.isError ? (
      <NotificationsError language={language} online={online} onRetry={() => void list.refetch()} />
    ) : loading ? (
      <li>
        <NotificationsSkeleton />
      </li>
    ) : notifications.length === 0 ? (
      <NotificationsEmpty language={language} category={category} />
    ) : (
      <>
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            language={language}
            now={now}
            onOpen={onOpen}
            onMarkRead={onOpen}
            onDelete={onDelete}
          />
        ))}
        <LensPaginationFooter
          state={paginationState}
          showsAllLoadedHint={showsAllLoadedHint(notifications.length, NOTIFICATIONS_PAGE_SIZE)}
          exhaustedLabel={translate(language, 'notifications.allLoaded')}
          onRetry={() => void list.fetchNextPage()}
          sentinelRef={observeTail}
        />
      </>
    );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <NotificationsHeader language={language} unread={unread} onMarkAllRead={onMarkAllRead} />
      <NotificationCategoryRail language={language} selected={category} onSelect={onSelect} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <ul
        ref={frame}
        id="contenu"
        data-notifications-category={category}
        className="scrollbar-none overscroll-contain flex flex-1 flex-col overflow-y-auto pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(loading ? { 'aria-busy': true, 'aria-label': translate(language, 'notifications.loading') } : {})}
      >
        <li aria-hidden="true" className="shrink-0" style={{ height: NOTIFICATIONS_TOP_RESERVE }} />
        {body}
      </ul>
    </main>
  );
}
