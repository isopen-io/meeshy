import { useEffect, useState, type ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { STORY_FILTERS, storyFilterCss, type StoryFilterId } from '@/lib/canvas/media-filter';
import { SCENE_TRANSITIONS, type SceneTransition } from '@/lib/canvas/scene-transition';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { cachedFilterThumbnail, filterThumbnail } from '@/lib/stories/studio-filter-thumbnails';
import { STUDIO_EFFECT_LABEL_KEYS, type StudioEffectChoice, type StudioSceneEffect } from '@/lib/stories/studio-scene-columns';
import { STUDIO_PLATE } from '@/routes/story-compose-chrome';
import { STUDIO_FILTER_KEYS } from '@/routes/story-compose-media-fields';
import { StudioChip } from '@/routes/story-compose-parts';
import { EffectMark } from '@/routes/story-compose-scene-marks';

/**
 * **LE CARROUSEL D'EFFETS, à la place de l'audience et de Publier** (#8715,
 * #8794 — jumelles de `ComposerSceneEffectCarousel`, #8712 / #8792) : une
 * plaque de verre qui porte le nom de la famille, sa sortie, et ses choix.
 * Chargé à la demande : il ne pèse sur le studio que si l'auteur touche un
 * effet de la colonne.
 *
 * La sortie est EXPLICITE : retoucher l'icône de la colonne referme aussi le
 * carrousel, mais un geste qu'il faut deviner n'est pas un chemin.
 */

const TRANSITION_KEYS = {
  fade: 'story.studio.transition.fade',
  zoom: 'story.studio.transition.zoom',
  slide: 'story.studio.transition.slide',
  reveal: 'story.studio.transition.reveal',
} as const satisfies Record<SceneTransition, InterfaceCatalogKey>;

export function StudioEffectCarousel({
  lang,
  effect,
  onClose,
  children,
}: {
  readonly lang: InterfaceLanguage;
  readonly effect: StudioSceneEffect;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const title = translate(lang, STUDIO_EFFECT_LABEL_KEYS[effect]);
  return (
    <section data-story-effect-carousel={effect} aria-label={title} className={`glass flex flex-col gap-2 rounded-[22px] ps-3.5 pe-2 pt-1 pb-2.5 ${STUDIO_PLATE}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" style={{ color: 'var(--color-ios-ink)' }}>
          <EffectMark effect={effect} size={18} />
        </span>
        <h2 className="flex-1 text-check font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {title}
        </h2>
        <button
          type="button"
          data-story-effect-close
          aria-label={translate(lang, 'story.studio.effect.close')}
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
        >
          <Glyph name="x" size={16} />
        </button>
      </div>
      {children}
    </section>
  );
}

/** **L'OUVERTURE porte l'entrée ET la sortie de la scène** (#8792) — deux
 * rangées de puces : une fermeture réglée ailleurs que son ouverture serait
 * une seconde porte vers le même couple. */
export function StudioTransitionRows({
  lang,
  opening,
  closing,
  onChoose,
  locked,
}: {
  readonly lang: InterfaceLanguage;
  readonly opening: SceneTransition | null;
  readonly closing: SceneTransition | null;
  readonly onChoose: (choice: StudioEffectChoice) => void;
  readonly locked: boolean;
}) {
  const row = (kind: 'opening' | 'closing', selection: SceneTransition | null) => {
    const title = translate(lang, kind === 'opening' ? 'story.studio.effect.row.opening' : 'story.studio.effect.row.closing');
    return (
      <div role="group" aria-label={title} data-story-transition-row={kind} className="flex flex-col gap-1">
        <span aria-hidden="true" className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
          {title}
        </span>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <StudioChip
            label={translate(lang, 'story.studio.editor.none')}
            pressed={selection === null}
            onPress={() => onChoose({ kind, effect: null })}
            probe={`${kind}:none`}
            disabled={locked}
          />
          {SCENE_TRANSITIONS.map((transition) => (
            <StudioChip
              key={transition}
              label={translate(lang, TRANSITION_KEYS[transition])}
              pressed={selection === transition}
              onPress={() => onChoose({ kind, effect: transition })}
              probe={`${kind}:${transition}`}
              disabled={locked}
            >
              {translate(lang, TRANSITION_KEYS[transition])}
            </StudioChip>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      {row('opening', opening)}
      {row('closing', closing)}
    </div>
  );
}

/** Le rendu réduit du fond — relu du cache au premier rendu, sinon calculé
 * hors du fil principal ; `null` le temps du calcul (la tuile garde sa place). */
function useFilterThumbnail(source: string, aspectRatio: number | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => cachedFilterThumbnail(source));
  useEffect(() => {
    let alive = true;
    setUrl(cachedFilterThumbnail(source));
    void filterThumbnail({ source, aspectRatio }).then((rendered) => {
      if (alive) setUrl(rendered ?? source);
    });
    return () => {
      alive = false;
    };
  }, [source, aspectRatio]);
  return url;
}

/** **LES EFFETS VISUELS, en MINIATURES du fond réel** (#8792) — « Aucun »,
 * puis chaque filtre de `StoryFilter`, peint sur la même petite image. */
export function StudioVisualEffects({
  lang,
  source,
  aspectRatio,
  filter,
  onChoose,
  locked,
}: {
  readonly lang: InterfaceLanguage;
  readonly source: string;
  readonly aspectRatio: number | undefined;
  readonly filter: StoryFilterId | null;
  readonly onChoose: (choice: StudioEffectChoice) => void;
  readonly locked: boolean;
}) {
  const thumbnail = useFilterThumbnail(source, aspectRatio);
  const tile = (id: StoryFilterId | null) => {
    const label = translate(lang, id === null ? 'story.studio.editor.none' : STUDIO_FILTER_KEYS[id]);
    const pressed = filter === id;
    return (
      <button
        key={id ?? 'none'}
        type="button"
        data-story-option={`filter:${id ?? 'none'}`}
        data-story-filter-thumbnail={thumbnail === null ? 'pending' : 'ready'}
        aria-pressed={pressed}
        aria-label={label}
        title={label}
        disabled={locked}
        onClick={() => onChoose({ kind: 'visual', filter: id })}
        className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--color-ios-brand)', opacity: locked ? 0.4 : 1 }}
      >
        <span
          aria-hidden="true"
          className="block h-20 w-16 overflow-hidden rounded-xl"
          style={{
            backgroundColor: 'var(--color-ios-card)',
            boxShadow: pressed ? '0 0 0 3px var(--color-ios-brand)' : 'none',
          }}
        >
          {thumbnail !== null ? (
            <img src={thumbnail} alt="" draggable={false} className="size-full object-cover" style={id === null ? undefined : { filter: storyFilterCss(id) }} />
          ) : null}
        </span>
        <span className="max-w-full truncate text-caption font-semibold" style={{ color: pressed ? 'var(--color-ios-brand)' : 'var(--color-ios-ink)' }}>
          {label}
        </span>
      </button>
    );
  };
  return (
    <div role="group" aria-label={translate(lang, 'story.studio.effect.visual')} data-story-visual-effects className="flex gap-2 overflow-x-auto pb-0.5">
      {tile(null)}
      {STORY_FILTERS.map(tile)}
    </div>
  );
}
