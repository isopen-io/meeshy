import { memo } from 'react';

import { backgroundCss } from '@/lib/canvas/background';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { STORY_PLAIN_BACKGROUND } from '@/lib/stories/story-document';
import { isStudioPagePublishable, type StudioPage } from '@/lib/stories/studio-page';
import { Glyph } from '@/components/glyph';

/**
 * **LE RAIL DES SCÈNES — LA RANGÉE HAUTE** (#7684, §1.2) — miroir de
 * `ComposerSlideRail.swift:39-79` : une tuile 9:16 de 44 px de haut par PAGE,
 * la COURANTE cerclée de la couleur de marque, une corbeille sur la tuile
 * courante SEULEMENT et jamais sous deux pages
 * (`ComposerHeaderTiles.showsDelete`, :171-173).
 *
 * **LES CIBLES** (règle web ≥ 44 px, revue-correction #7684) : le VISUEL de la
 * tuile garde la forme d'une scène (24,75 × 44), sa CIBLE fait 44 × 44. La
 * corbeille a sa PROPRE cible de 44 × 44, posée À CÔTÉ de la tuile courante —
 * jamais par-dessus : une corbeille qui recouvrait la tuile faisait qu'un tap
 * sur la scène courante la SUPPRIMAIT. Seule sa pastille (14 px) mord le coin
 * du visuel, comme la croix d'iOS (`offset(x: 4, y: -4)`).
 *
 * **La tuile montre la vignette du FOND**, jamais un moteur de scène monté ;
 * elle est MÉMOÏSÉE sur des primitives : taper dans le texte d'une page ne
 * re-rend aucune tuile (Zero Unnecessary Re-render). Une page dont un média a
 * ÉCHOUÉ le dit sur SA tuile (`data-page-phase="failed"`) — sans quoi Publier
 * resterait inerte pour une raison que l'écran courant ne montre pas.
 */
const TARGET = 44;
const TILE_HEIGHT = 44;
const TILE_VISUAL_WIDTH = TILE_HEIGHT * (9 / 16);
const RAIL_GAP = 8;
const BADGE = 14;
const BADGE_BITE = 10;

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
      className="scrollbar-none flex min-w-0 flex-1 items-start overflow-x-auto"
      style={{ gap: RAIL_GAP }}
    >
      {pages.flatMap((page, index) => {
        const current = page.id === currentPageId;
        const tile = (
          <StudioPageTile
            key={page.id}
            lang={lang}
            id={page.id}
            index={index}
            count={pages.length}
            current={current}
            failed={!isStudioPagePublishable(page)}
            previewUrl={page.background?.previewUrl ?? null}
            mediaType={page.background?.mediaType ?? null}
            onSelect={onSelect}
          />
        );
        return current ? [tile, <StudioPageDelete key={`${page.id}:delete`} lang={lang} id={page.id} index={index} onDelete={onDelete} />] : [tile];
      })}
    </div>
  );
}

const StudioPageTile = memo(function StudioPageTile({
  lang,
  id,
  index,
  count,
  current,
  failed,
  previewUrl,
  mediaType,
  onSelect,
}: {
  readonly lang: InterfaceLanguage;
  readonly id: string;
  readonly index: number;
  readonly count: number;
  readonly current: boolean;
  readonly failed: boolean;
  readonly previewUrl: string | null;
  readonly mediaType: 'image' | 'video' | null;
  readonly onSelect: (id: string) => void;
}) {
  const position = translate(lang, 'story.studio.page.position', { index: String(index + 1), count: String(count) });
  return (
    <button
      type="button"
      data-story-studio-page={id}
      data-story-studio-page-tile
      {...(failed ? { 'data-page-phase': 'failed' } : {})}
      aria-current={current ? 'true' : undefined}
      aria-label={failed ? `${position} — ${translate(lang, 'story.studio.page.failed')}` : position}
      onClick={() => onSelect(id)}
      className="relative grid shrink-0 place-items-center rounded focus-visible:outline-2"
      style={{ width: TARGET, height: TILE_HEIGHT, outlineColor: 'var(--color-ios-brand)' }}
    >
      <span
        aria-hidden="true"
        className="block overflow-hidden"
        style={{
          width: TILE_VISUAL_WIDTH,
          height: TILE_HEIGHT,
          borderRadius: 4,
          border: current ? '1.5px solid var(--color-ios-brand)' : '0.5px solid var(--color-edge)',
          backgroundColor: backgroundCss(STORY_PLAIN_BACKGROUND, 'var(--color-ios-card)'),
        }}
      >
        {previewUrl === null ? null : mediaType === 'video' ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- vignette muette et décorative, pas un lecteur.
          <video src={previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <img src={previewUrl} alt="" decoding="async" className="h-full w-full object-cover" />
        )}
      </span>
      {failed ? (
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{ width: 8, height: 8, bottom: 3, insetInlineStart: '50%', marginInlineStart: -4, backgroundColor: 'var(--color-error)' }}
        />
      ) : null}
    </button>
  );
});

const StudioPageDelete = memo(function StudioPageDelete({
  lang,
  id,
  index,
  onDelete,
}: {
  readonly lang: InterfaceLanguage;
  readonly id: string;
  readonly index: number;
  readonly onDelete: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-story-studio-page-delete
      aria-label={translate(lang, 'story.studio.page.remove', { index: String(index + 1) })}
      onClick={() => onDelete(id)}
      className="relative shrink-0 focus-visible:outline-2"
      style={{ width: TARGET, height: TARGET, marginInlineStart: -RAIL_GAP, outlineColor: 'var(--color-ios-brand)' }}
    >
      <span
        aria-hidden="true"
        className="absolute grid place-items-center rounded-full text-white"
        style={{
          width: BADGE,
          height: BADGE,
          top: 0,
          insetInlineStart: -((TARGET - TILE_VISUAL_WIDTH) / 2 + BADGE_BITE),
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
      >
        <Glyph name="x" size={8} />
      </span>
    </button>
  );
});
