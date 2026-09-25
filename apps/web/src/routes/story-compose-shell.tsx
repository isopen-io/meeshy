import type { ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind, StudioOrigin } from '@/lib/stories/publication-kind';
import { Link } from '@/routes/route-table';

const TITLE_KEY = { STORY: 'story.studio.title', POST: 'story.studio.title.post', REEL: 'story.studio.title.reel' } as const;

/** La barre haute d'iOS (`ComposerTopBar.swift:49-71`) : ✕ · rail · ⋯. Le
 * rail des scènes (#7684) prend la place du titre dès la deuxième page — le
 * titre reste pour le lecteur d'écran, et la scène ne change pas de hauteur
 * quand le rail apparaît. */
export function StudioShell({
  kind,
  origin,
  rail,
  children,
}: {
  readonly kind: PublicationKind;
  readonly origin: StudioOrigin | null;
  readonly rail?: ReactNode;
  readonly children: ReactNode;
}) {
  const lang = currentInterfaceLanguage();
  return (
    <main data-story-studio className="flex h-dvh flex-col overflow-hidden pt-safe" style={{ backgroundColor: 'var(--color-ios-surface)' }}>
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to={origin === 'onboarding' ? 'onboarding' : kind === 'STORY' ? 'list' : 'feed'}
          aria-label={translate(lang, 'story.studio.cancel')}
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
        >
          <Glyph name="x" size={18} />
        </Link>
        {rail}
        <h1 className={rail === undefined ? 'flex-1 text-body font-semibold' : 'offscreen'} style={{ color: 'var(--color-ios-ink)' }}>
          {translate(lang, TITLE_KEY[kind])}
        </h1>
      </header>
      {children}
    </main>
  );
}
