import type { ReactNode } from 'react';

import { STORY_FILTERS, storyFilterCss, type StoryFilterId } from '@/lib/canvas/media-filter';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { StudioChip } from './story-compose-parts';

/**
 * **CE QUI RÈGLE UN MÉDIA, OÙ QU'IL SOIT** (#8518) — le calque se règle dans
 * sa plaque d'édition, le fond dans le Cadre ; le filtre et le texte
 * alternatif y sont les MÊMES contrôles, écrits une fois (deux champs écrits
 * côte à côte divergent au premier réglage — iOS l'a payé sur les légendes,
 * `ComposerObjectEditorView+Media.swift:88-92`).
 */

export function StudioSection({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-check font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** Une clé de libellé par filtre de `StoryFilter` — un INVENTAIRE que la
 * compilation tient (lot 7). */
export const STUDIO_FILTER_KEYS = {
  vintage: 'story.studio.filter.vintage',
  bw: 'story.studio.filter.bw',
  warm: 'story.studio.filter.warm',
  cool: 'story.studio.filter.cool',
  dramatic: 'story.studio.filter.dramatic',
  vivid: 'story.studio.filter.vivid',
  fade: 'story.studio.filter.fade',
  chrome: 'story.studio.filter.chrome',
} as const satisfies Record<StoryFilterId, InterfaceCatalogKey>;

/** LE FILTRE D'UN MÉDIA (lot 7, #8474) — il ne s'applique qu'à CE média,
 * jamais à la scène : l'éditeur d'un objet n'offre que ce qui le modifie. La
 * pastille se peint du filtre qu'elle nomme. */
export function StudioFilterSection({
  lang,
  filter,
  onFilter,
}: {
  readonly lang: InterfaceLanguage;
  readonly filter: StoryFilterId | null;
  readonly onFilter: (filter: StoryFilterId | null) => void;
}) {
  return (
    <StudioSection label={translate(lang, 'story.studio.editor.filter')}>
      <StudioChip label={translate(lang, 'story.studio.editor.none')} pressed={filter === null} onPress={() => onFilter(null)} probe="filter:none" />
      {STORY_FILTERS.map((id) => (
        <StudioChip key={id} label={translate(lang, STUDIO_FILTER_KEYS[id])} pressed={filter === id} onPress={() => onFilter(id)} probe={`filter:${id}`}>
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <span className="block size-3.5 rounded-full" style={{ background: 'linear-gradient(135deg, #fb923c, #4f46e5)', filter: storyFilterCss(id) }} />
            {translate(lang, STUDIO_FILTER_KEYS[id])}
          </span>
        </StudioChip>
      ))}
    </StudioSection>
  );
}

/** LE TEXTE ALTERNATIF D'UN MÉDIA (#8518, « ⌾ Décrire » d'iOS) —
 * `PostMedia.alt`, ce que dit un lecteur d'écran ; distinct de la légende,
 * qui s'affiche. Il part en `mediaAlt` à la publication. */
export function StudioAltField({
  lang,
  door,
  value,
  onChange,
}: {
  readonly lang: InterfaceLanguage;
  readonly door: 'visual' | 'overlay';
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <input
      id={`story-studio-alt-${door}`}
      data-story-media-alt={door}
      type="text"
      value={value}
      maxLength={1000}
      aria-label={translate(lang, 'story.studio.media.alt')}
      placeholder={translate(lang, 'story.studio.media.alt.placeholder')}
      onInput={(event) => onChange(event.currentTarget.value)}
      className="h-11 rounded-xl px-3 text-body outline-none"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)', color: 'var(--color-ios-ink)' }}
    />
  );
}
