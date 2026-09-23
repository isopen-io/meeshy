import type { ReactNode, RefObject, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import type { PostToggleKind } from '@/lib/feed/interactions';
import type { PostMenuEntry } from '@/lib/feed/publication-menu';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { href, navigate } from '@/routes/route-table';

import type { PostMenuHost } from './feed-post-menu';
import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { LINKS_GLYPHS } from './glyphs-links';
import { NOTIFICATIONS_GLYPHS } from './glyphs-notifications';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { ReportSheet } from './report-sheet';

/**
 * **LE PANNEAU DU MENU « ⋯ », CHARGÉ À LA DEMANDE** (#7533) — même discipline
 * que les feuilles du composeur (`effects-sheet`, `language-sheet`) : le fil
 * ne paie que le BOUTON ; les entrées, leurs icônes et la feuille de motifs
 * n'arrivent qu'au premier toucher. Le clavier (`useRovingMenu`) et le
 * placement restent chez le bouton, qui connaît l'ancre.
 */
const MENU_ITEM_HEIGHT = 44;
const DESTRUCTIVE: ReadonlySet<PostMenuEntry> = new Set(['delete', 'report']);

export type PostMenuPanelProps = {
  readonly open: boolean;
  readonly entries: readonly PostMenuEntry[];
  readonly postId: string;
  readonly authorName: string;
  readonly text: string | undefined;
  readonly bookmarked: boolean;
  readonly menu: PostMenuHost;
  readonly onShare?: ((postId: string) => void) | undefined;
  readonly onGesture?: ((postId: string, kind: PostToggleKind) => void) | undefined;
  readonly box: { readonly top: number; readonly right: number; readonly width: number };
  readonly label: string;
  readonly activeIndex: number;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly itemRefs: RefObject<(HTMLElement | null)[]>;
  readonly onMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  readonly closeAndFocusButton: () => void;
  readonly reporting: boolean;
  readonly setReporting: (value: boolean) => void;
};

export function PostMenuPanel(props: PostMenuPanelProps) {
  const { open, entries, postId, authorName, text, bookmarked, menu, onShare, onGesture, box, label, activeIndex, menuRef, itemRefs, onMenuKeyDown, closeAndFocusButton, reporting, setReporting } = props;
  const language = currentInterfaceLanguage();

  const items: readonly { readonly id: PostMenuEntry; readonly label: string; readonly icon: ReactNode; readonly run: () => void }[] = entries.map(
    (id) => {
      switch (id) {
        case 'open':
          return { id, label: translate(language, 'feed.post.menu.open'), icon: <GlyphSvg glyph={LINKS_GLYPHS.export} size={16} />, run: () => navigate(href('post', { post: postId })) };
        case 'copyText':
          return { id, label: translate(language, 'feed.post.menu.copy_text'), icon: <GlyphSvg glyph={THREAD_MENU_GLYPHS.copy} size={16} />, run: () => menu.onCopyText(text ?? '') };
        case 'share':
          return { id, label: translate(language, 'feed.post.action.share'), icon: <GlyphSvg glyph={FEED_GLYPHS.shareNetwork} size={16} />, run: () => onShare?.(postId) };
        case 'save':
          return {
            id,
            label: translate(language, bookmarked ? 'feed.post.menu.unsave' : 'feed.post.action.bookmark'),
            icon: <GlyphSvg glyph={bookmarked ? FEED_GLYPHS.bookmarkFill : FEED_GLYPHS.bookmark} size={16} />,
            run: () => onGesture?.(postId, 'bookmark'),
          };
        case 'pin':
          return { id, label: translate(language, 'feed.post.menu.pin'), icon: <Glyph name="pushPin" size={16} />, run: () => menu.onPin(postId) };
        case 'delete':
          return { id, label: translate(language, 'feed.post.menu.delete'), icon: <GlyphSvg glyph={NOTIFICATIONS_GLYPHS.trash} size={16} />, run: () => menu.onDelete(postId) };
        case 'report':
          return { id, label: translate(language, 'report.action'), icon: <Glyph name="warningCircle" size={16} />, run: () => setReporting(true) };
      }
    },
  );

  return (
    <>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              className="fixed z-30 overflow-hidden rounded-card py-1 shadow-cast"
              style={{ top: box.top, right: box.right, width: box.width, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
            >
              {items.map((item, index) => {
                const destructive = DESTRUCTIVE.has(item.id);
                /* Le séparateur d'iOS (`Divider()`) : AVANT « Supprimer », et
                   avant « Signaler » quand il ferme seul la liste. */
                const separe = item.id === 'delete' || (item.id === 'report' && !entries.includes('delete'));
                return (
                  <button
                    key={item.id}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    type="button"
                    role="menuitem"
                    data-feed-post-action={item.id}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      closeAndFocusButton();
                      item.run();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-title font-medium"
                    style={{
                      color: destructive ? 'var(--color-error)' : 'var(--color-ios-ink)',
                      minHeight: MENU_ITEM_HEIGHT,
                      ...(separe ? { borderTop: '0.5px solid var(--color-edge)' } : {}),
                    }}
                  >
                    <span className="grid place-items-center" style={{ color: destructive ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}

      {reporting ? (
        <ReportSheet
          name={authorName}
          title={translate(language, 'report.post.title')}
          busy={false}
          onPick={(reason) => {
            setReporting(false);
            menu.onReport(postId, reason);
          }}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </>
  );
}
