import { lazy, Suspense, useState } from 'react';

import type { PostActionOutcome } from '@/lib/api/publication-actions';
import type { ReportReason } from '@/lib/api/reports';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { postMenuEntries } from '@/lib/feed/publication-menu';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';

import { GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';

/**
 * LE PANNEAU, À LA DEMANDE — le fil ne paie que ce bouton (voir le
 * doc-comment de `publication-menu-panel.tsx`).
 */
const PostMenuPanel = lazy(() => import('./publication-menu-panel').then((m) => ({ default: m.PostMenuPanel })));

/**
 * **LE MENU « ⋯ » D'UNE CARTE DU FIL** (#7533, directive porteur du
 * 2026-09-23) — en HAUT À DROITE de la carte post comme de la carte réel,
 * miroir `FeedPostCard+Header.swift:235` et `ReelFeedCard.swift:308`.
 *
 * Les ENTRÉES sont une loi pure (`postMenuEntries`, `lib/feed/publication-menu.ts`) ;
 * le panneau (`publication-menu-panel.tsx`) les peint. La MÉCANIQUE est celle
 * des menus de rangée du dépôt (`notification-row-menu.tsx`, `row-actions.tsx`)
 * : portail, clavier par `useRovingMenu`, placement par `popover.ts`, 44 px
 * par entrée. Seul écart : le bouton est TOUJOURS visible — sur iOS il l'est,
 * et une carte du fil n'a pas de survol au doigt.
 *
 * Les GESTES viennent de l'hôte (`usePostGesture().menu`), comme le cœur et le
 * signet : c'est lui qui tient la région d'annonce et les caisses. Sans hôte
 * de menu, le bouton ne se monte pas — loi 4.
 */
export type PostMenuHost = {
  readonly viewerId: string | null;
  readonly onCopyText: (text: string) => void;
  readonly onPin: (postId: string) => void;
  /** MODIFIER LE TEXTE (#7534) — la SEULE entrée du menu qui rend son issue :
   * la feuille l'attend pour se fermer (`'done'`) ou rester ouverte
   * (`'offline'`/`'failed'`), là où les autres gestes n'ont pas de surface
   * qui attend. */
  readonly onEdit: (postId: string, content: string) => Promise<PostActionOutcome>;
  readonly onDelete: (postId: string) => void;
  readonly onReport: (postId: string, reason: ReportReason) => void;
};

const MENU_WIDTH = 240;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;
/** Le disque DESSINÉ ; la cible, elle, fait 44 (`size-11`). */
const DISC_SIZE = 34;

export function FeedPostMenu({
  postId,
  authorId,
  authorName,
  text,
  originalText,
  bookmarked,
  isDetail,
  tone,
  menu,
  onShare,
  onGesture,
}: {
  readonly postId: string;
  readonly authorId: string | undefined;
  readonly authorName: string;
  readonly text: string | undefined;
  /** LE TEXTE TEL QUE L'AUTEUR L'A ÉCRIT (#7534, `card-model.ts#FeedCardText.original`)
   * — ce que la feuille d'édition ouvre, JAMAIS `text` (la traduction servie
   * par le Prisme) : `EditPostSheet.swift` hydrate depuis `post.content`,
   * l'original, pas l'affiché. */
  readonly originalText: string | undefined;
  readonly bookmarked: boolean;
  readonly isDetail: boolean;
  /** `card` sur le fond de la carte, `overlay` sur un média (le réel). */
  readonly tone: 'card' | 'overlay';
  readonly menu: PostMenuHost;
  readonly onShare?: ((postId: string) => void) | undefined;
  readonly onGesture?: ((postId: string, kind: PostToggleKind) => void) | undefined;
}) {
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const entries = postMenuEntries({
    viewerId: menu.viewerId,
    authorId,
    isDetail,
    hasText: text !== undefined && text.trim() !== '',
    canShare: onShare !== undefined,
    canSave: onGesture !== undefined,
  });

  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });
  const { open, setOpen, closeAndFocusButton, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: entries.length,
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  if (entries.length === 0) return null;

  const measure = () => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor === undefined) return;
    const placement = placePopover({ anchorRight: anchor.right, viewportWidth: window.innerWidth, preferredWidth: MENU_WIDTH, margin: MENU_MARGIN });
    const vertical = placePopoverVertical({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      viewportHeight: window.innerHeight,
      estimatedHeight: entries.length * MENU_ITEM_HEIGHT + MENU_PADDING,
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    setBox({ top: vertical.top, right: window.innerWidth - anchor.right + placement.right, width: placement.width });
  };

  const label = translate(currentInterfaceLanguage(), 'feed.post.more_options');
  const overlay = tone === 'overlay';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-feed-post-menu
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!open) measure();
          setOpen((value) => !value);
        }}
        /* UNE VRAIE BOÎTE DE 44 (`check-profile.mjs` mesure la boîte, pas un
           débord `::after`) ; le DISQUE visible garde 34, la cote iOS. */
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ outlineColor: overlay ? 'white' : 'var(--color-ios-brand)' }}
      >
        <span
          aria-hidden
          className="grid place-items-center rounded-chip"
          style={{
            width: DISC_SIZE,
            height: DISC_SIZE,
            color: overlay ? 'white' : 'var(--color-ios-ink-3)',
            backgroundColor: overlay ? 'rgba(0,0,0,0.35)' : 'transparent',
          }}
        >
          <GlyphSvg glyph={THREAD_MENU_GLYPHS.dotsThree} size={20} />
        </span>
      </button>

      {open || reporting || editing ? (
        <Suspense fallback={null}>
          <PostMenuPanel
            open={open}
            entries={entries}
            postId={postId}
            authorName={authorName}
            text={text}
            originalText={originalText}
            bookmarked={bookmarked}
            menu={menu}
            onShare={onShare}
            onGesture={onGesture}
            box={box}
            label={label}
            activeIndex={activeIndex}
            menuRef={menuRef}
            itemRefs={itemRefs}
            onMenuKeyDown={onMenuKeyDown}
            closeAndFocusButton={closeAndFocusButton}
            reporting={reporting}
            setReporting={setReporting}
            editing={editing}
            setEditing={setEditing}
          />
        </Suspense>
      ) : null}
    </>
  );
}
