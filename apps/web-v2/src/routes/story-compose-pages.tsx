import { backgroundCss } from '@/lib/canvas/background';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { STORY_PLAIN_BACKGROUND } from '@/lib/stories/story-document';
import type { StudioPage } from '@/lib/stories/studio-page';
import { Glyph } from '@/components/glyph';

/**
 * **LE RAIL DES SCÈNES — LA RANGÉE HAUTE** (#7684, §1.2) — miroir de
 * `ComposerSlideRail.swift:39-79` : une tuile 9:16 de 44 px de haut par PAGE,
 * la COURANTE cerclée de la couleur de marque, une corbeille sur la tuile
 * courante SEULEMENT et jamais sous deux pages
 * (`ComposerHeaderTiles.showsDelete`, :171-173).
 *
 * **La tuile montre la vignette du FOND**, jamais un moteur de scène monté —
 * dix moteurs pour dix tuiles de 25 px re-rendraient à chaque frappe (Zero
 * Unnecessary Re-render) ; le rail ne sert qu'à NAVIGUER. Chargé À LA DEMANDE
 * par `story-compose.tsx`, seulement quand `pages.length > 1`.
 */
const TILE_HEIGHT = 44;
const TILE_WIDTH = TILE_HEIGHT * (9 / 16);

export function StudioPageRail({
  lang,
  pages,
  currentPageId,
  onSelect,
  onDelete,
}: {
  readonly lang: InterfaceLanguage;
  readonly pages: readonly StudioPage[];
  readonly currentPageId: string;
  readonly onSelect: (id: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  if (pages.length <= 1) return null;
  return (
    <div
      role="group"
      aria-label={translate(lang, 'story.studio.pages.label')}
      data-story-studio-page-rail
      className="flex shrink-0 gap-2 overflow-x-auto px-2 pb-2"
    >
      {pages.map((page, index) => {
        const current = page.id === currentPageId;
        return (
          <div key={page.id} className="relative shrink-0" style={{ width: TILE_WIDTH, height: TILE_HEIGHT }} data-story-studio-page={page.id}>
            <button
              type="button"
              data-story-studio-page-tile
              aria-current={current ? 'true' : undefined}
              aria-label={translate(lang, 'story.studio.page.select', { index: String(index + 1) })}
              title={translate(lang, 'story.studio.page.position', { index: String(index + 1), count: String(pages.length) })}
              onClick={() => onSelect(page.id)}
              className="block h-full w-full overflow-hidden rounded"
              style={{ border: current ? '1.5px solid var(--color-ios-brand)' : '0.5px solid rgba(255,255,255,0.25)' }}
            >
              {page.background !== null ? (
                page.background.mediaType === 'video' ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption -- vignette muette et décorative, pas un lecteur.
                  <video src={page.background.previewUrl} muted className="h-full w-full object-cover" />
                ) : (
                  <img src={page.background.previewUrl} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <span aria-hidden="true" className="block h-full w-full" style={{ backgroundColor: backgroundCss(STORY_PLAIN_BACKGROUND, 'var(--color-ios-card)') }} />
              )}
            </button>
            {current ? (
              <button
                type="button"
                data-story-studio-page-delete
                aria-label={translate(lang, 'story.studio.page.remove')}
                onClick={() => onDelete(page.id)}
                className="absolute grid place-items-center focus-visible:outline-2"
                style={{ width: 44, height: 44, top: -14, right: -14, outlineColor: 'var(--color-ios-brand)' }}
              >
                <span
                  aria-hidden="true"
                  className="grid place-items-center rounded-full"
                  style={{ width: 18, height: 18, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff' }}
                >
                  <Glyph name="x" size={10} />
                </span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
