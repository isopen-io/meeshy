import type { ReactNode } from 'react';

import {
  SCENE_BACKDROPS,
  SCENE_BACKDROP_TINT,
  SCENE_FIT_MODES,
  type SceneBackdrop,
  type SceneFitMode,
} from '@/lib/canvas/backdrop';
import type { StoryFilterId } from '@/lib/canvas/media-filter';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StoryFrame } from '@/lib/stories/story-document';
import type { StudioBackgroundSection } from '@/lib/stories/studio-background-tools';
import { pageWithVisualFilter } from '@/lib/stories/studio-page';
import type { StudioPageEdit } from '@/lib/stories/studio-page-edit';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { STUDIO_PLATE, StudioToolClose } from '@/routes/story-compose-chrome';
import { StudioAltField, StudioFilterSection } from '@/routes/story-compose-media-fields';

/**
 * **LES CONTRÔLES D'UN OUTIL DU FOND, SOUS LA SCÈNE** (#8849, jumelle de
 * `ComposerBackgroundToolPanel` iOS, #8847) — l'ancien panneau Cadre (#8414)
 * portait tout d'un bloc : Ajuster/Remplir, la légende, l'alt, les fonds, le
 * filtre, le retrait. Il se découpe en OUTILS que le rail droit porte ; chaque
 * plaque ne rend que les contrôles de l'outil touché, à la place de ce qui
 * était sous la scène. Le retrait est devenu un geste du rail.
 *
 * Le verre est celui de la barre, des rails et du socle (`glass`, retour de
 * revue #8425) ; les libellés sont à l'encre pleine : l'encre secondaire ne
 * tient pas AA sur ce verre en clair (3,58:1, #6308).
 *
 * Un choix s'APPLIQUE sur-le-champ (la scène le montre au-dessus) et se défait
 * par l'historique comme tout geste sur la scène. Échap et le retour matériel
 * rangent la plaque, elle seule (#8517) : le rail des outils reste.
 */

const FIT_KEY = { fit: 'story.studio.frame.fit', fill: 'story.studio.frame.fill' } as const;
const FIT_HINT_KEY = { fit: 'story.studio.frame.fit.hint', fill: 'story.studio.frame.fill.hint' } as const;
const BACKDROP_KEY = {
  blur: 'story.studio.backdrop.blur',
  black: 'story.studio.backdrop.black',
  white: 'story.studio.backdrop.white',
  indigo: 'story.studio.backdrop.indigo',
  sand: 'story.studio.backdrop.sand',
} as const;

/** Le nom de chaque outil — celui de sa tuile au rail. */
export const STUDIO_BACKGROUND_SECTION_KEYS = {
  frame: 'story.studio.tile.frame',
  filter: 'story.studio.editor.filter',
  describe: 'story.studio.background.tools.describe',
} as const satisfies Record<StudioBackgroundSection, InterfaceCatalogKey>;

/** La pastille du flou : un dégradé qui dit « le média, flouté » sans en
 * être une copie (`iPad.dc.html`, `.sw`). */
const BLUR_SWATCH = 'linear-gradient(135deg, #fb923c, #4f46e5)';

const swatchOf = (backdrop: SceneBackdrop): string => (backdrop === 'blur' ? BLUR_SWATCH : SCENE_BACKDROP_TINT[backdrop]);

const HEADING = 'text-caption font-bold uppercase tracking-wide';
const FIELD_STYLE = { backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)', color: 'var(--color-ios-ink)' } as const;

function Token({
  on,
  probe,
  onPress,
  children,
}: {
  readonly on: boolean;
  readonly probe: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-story-frame-option={probe}
      onClick={onPress}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        outlineColor: 'var(--color-ios-brand)',
        color: on ? '#111' : 'var(--color-ios-ink)',
        backgroundColor: on ? '#fff' : 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-ios-ink) 14%, transparent)',
      }}
    >
      {children}
    </button>
  );
}

/** Ajuster ou Remplir, puis — autour d'un média AJUSTÉ seulement — ce qui se
 * peint autour : un choix sans effet n'est pas offert. */
function FrameControls({ lang, frame, onFrame }: { readonly lang: InterfaceLanguage; readonly frame: StoryFrame; readonly onFrame: (frame: StoryFrame) => void }) {
  const setFit = (fitMode: SceneFitMode) => onFrame({ ...frame, fitMode });
  const setBackdrop = (backdrop: SceneBackdrop) => onFrame({ ...frame, backdrop });
  return (
    <>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(lang, FIT_HINT_KEY[frame.fitMode])}
      </p>
      <p className={HEADING} style={{ color: 'var(--color-ios-ink)' }}>
        {translate(lang, 'story.studio.frame.media')}
      </p>
      <div role="radiogroup" aria-label={translate(lang, 'story.studio.frame.media')} className="flex flex-wrap gap-1.5">
        {SCENE_FIT_MODES.map((mode) => (
          <Token key={mode} on={frame.fitMode === mode} probe={mode} onPress={() => setFit(mode)}>
            {translate(lang, FIT_KEY[mode])}
          </Token>
        ))}
      </div>
      {frame.fitMode === 'fit' ? (
        <>
          <p className={HEADING} style={{ color: 'var(--color-ios-ink)' }}>
            {translate(lang, 'story.studio.frame.around')}
          </p>
          <div role="radiogroup" aria-label={translate(lang, 'story.studio.frame.around')} className="flex flex-wrap gap-1.5">
            {SCENE_BACKDROPS.map((backdrop) => (
              <Token key={backdrop} on={frame.backdrop === backdrop} probe={backdrop} onPress={() => setBackdrop(backdrop)}>
                <span aria-hidden="true" className="size-3.5 rounded-full" style={{ background: swatchOf(backdrop), border: '1px solid rgba(255,255,255,0.4)' }} />
                {translate(lang, BACKDROP_KEY[backdrop])}
              </Token>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export function StudioBackgroundToolPanel({
  lang,
  section,
  frame,
  onFrame,
  caption,
  media,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  readonly section: StudioBackgroundSection;
  readonly frame: StoryFrame;
  readonly onFrame: (frame: StoryFrame) => void;
  /** LA LÉGENDE du média de fond (`PostMedia.caption`) — hors retouche. */
  readonly caption?: { readonly value: string; readonly onChange: (value: string) => void };
  /** LE TEXTE ALTERNATIF (`PostMedia.alt`) et LE FILTRE du fond (#8518) — la
   * plaque écrit la page elle-même (`onPage`), pour que leur câblage vive
   * dans ce chunk à la demande, pas dans celui du studio. */
  readonly media?: { readonly alt: string; readonly filter: StoryFilterId | null; readonly onPage: StudioPageEdit };
  readonly onClose: () => void;
}) {
  useBackDismiss(onClose, { escape: true });

  const title = translate(lang, STUDIO_BACKGROUND_SECTION_KEYS[section]);
  return (
    <section
      data-story-background-tool={section}
      {...(section === 'frame' ? { 'data-story-frame-panel': '' } : {})}
      aria-label={title}
      className={`${STUDIO_PLATE} glass studio-plaque-rise flex flex-col gap-2 rounded-[22px] p-3`}
      style={{ color: 'var(--color-ios-ink)' }}
    >
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-body font-bold">{title}</h2>
        <StudioToolClose lang={lang} probe="frame" onClose={onClose} focusOnOpen />
      </div>
      {/* Le corps DÉFILE sous son titre (#8517) : la plaque ne mange pas la
          scène qu'elle règle, au téléphone comme au bureau. */}
      <div data-story-frame-body className="flex max-h-72 flex-col gap-2 overflow-y-auto [&>*]:shrink-0">
        {section === 'frame' ? <FrameControls lang={lang} frame={frame} onFrame={onFrame} /> : null}
        {section === 'filter' && media !== undefined ? (
          <StudioFilterSection lang={lang} heading="plate" filter={media.filter} onFilter={(filter) => media.onPage((page) => pageWithVisualFilter(page, 'visual', filter))} />
        ) : null}
        {section === 'describe' && caption !== undefined ? (
          <input
            id="story-studio-caption-visual"
            type="text"
            value={caption.value}
            aria-label={translate(lang, 'story.studio.caption.placeholder')}
            placeholder={translate(lang, 'story.studio.caption.placeholder')}
            onInput={(event) => caption.onChange(event.currentTarget.value)}
            className="h-11 rounded-xl px-3 text-body outline-none"
            style={FIELD_STYLE}
          />
        ) : null}
        {section === 'describe' && media !== undefined ? <StudioAltField lang={lang} door="visual" value={media.alt} onPage={media.onPage} /> : null}
      </div>
    </section>
  );
}
