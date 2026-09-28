import type { ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind, StudioOrigin } from '@/lib/stories/publication-kind';
import { ROUND_GLASS } from '@/routes/story-compose-chrome';
import { Link } from '@/routes/route-table';

const TITLE_KEY = { STORY: 'story.studio.title', POST: 'story.studio.title.post', REEL: 'story.studio.title.reel' } as const;

/** La barre haute d'iOS (`ComposerTopBar.swift:49-71`) : ✕ · rail · ⋯. Le
 * rail des scènes (#7684) prend la place du titre dès la deuxième page — le
 * titre reste pour le lecteur d'écran, et la scène ne change pas de hauteur
 * quand le rail apparaît.
 *
 * PLEIN ÉCRAN (maquette 2026-09-27, #8370, retour porteur #8413) : l'écran est
 * une COLONNE — la barre haute, la zone de la scène, le socle. Ni ✕ ni ⋯ ni le
 * socle ne se posent sur le dessin : la scène se cadre dans ce qui reste
 * entre eux (`ComposerSceneSurface`, `.padding(.top, ComposerTopBar.height)`).
 * Le SOL (`floor`) est peint sous les trois, sur l'écran entier ; les
 * contrôles flottent dessus en verre, aucune bande opaque ne le coupe. */
export function StudioShell({
  kind,
  origin,
  rail,
  menu,
  floor,
  onCancel,
  children,
}: {
  readonly kind: PublicationKind;
  readonly origin: StudioOrigin | null;
  readonly rail?: ReactNode;
  /** Le menu `⋯` (`StudioMoreMenu`), au bout de la barre. */
  readonly menu?: ReactNode;
  /** Le SOL de la scène (`StudioFloorLayer`). */
  readonly floor?: ReactNode;
  /** ✕ d'une RETOUCHE (#8416) — l'hôte referme la couche, aucune navigation. */
  readonly onCancel?: () => void;
  readonly children: ReactNode;
}) {
  const lang = currentInterfaceLanguage();
  return (
    <main data-story-studio className="relative flex h-dvh flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-ios-surface)' }}>
      {floor}
      {/* LA BARRE AU PLUS HAUT (lot 6) — ✕ et ⋯ collent à la zone sûre du haut
          (`pt-safe`), sans marge en plus, et la scène monte avec eux. Ils ne passent pas DANS la barre d'état : iOS
          l'efface, le web ne le peut pas (l'horloge y resterait dessous). */}
      <header
        data-story-studio-top
        className="relative z-20 flex shrink-0 items-center gap-3 px-3 pt-safe pb-1"
      >
        {onCancel !== undefined ? (
          <button
            type="button"
            data-story-retouch-cancel
            onClick={onCancel}
            aria-label={translate(lang, 'story.studio.retouch.cancel')}
            className={ROUND_GLASS}
            style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
          >
            <Glyph name="x" size={18} />
          </button>
        ) : (
          <Link
            to={origin === 'onboarding' ? 'onboarding' : kind === 'STORY' ? 'list' : 'feed'}
            aria-label={translate(lang, 'story.studio.cancel')}
            className={ROUND_GLASS}
            style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
          >
            <Glyph name="x" size={18} />
          </Link>
        )}
        {/* Aucun titre peint (maquette : ✕ et ⋯ seuls, « le type se choisit à
            l'ENVOI ») — il reste pour le lecteur d'écran. */}
        {rail ?? <span aria-hidden="true" className="flex-1" />}
        <h1 className="offscreen">{translate(lang, onCancel !== undefined ? 'story.studio.retouch.title' : TITLE_KEY[kind])}</h1>
        {menu}
      </header>
      {children}
    </main>
  );
}
