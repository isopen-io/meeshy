import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { publicationLayoutLabelKey, PUBLICATION_LAYOUT_ORDER } from '@/lib/stories/publication-layout-modes';

import { Glyph } from './glyph';
import { LayoutMark } from './layout-mark';

/**
 * **LES CINQ LIGNES DU SOUS-MENU DE DISPOSITION, CHARGÉES À LA DEMANDE**
 * (#7684) — `PublishSplitButton` ne les monte que lorsque l'auteur a
 * effectivement déplié la ligne « Post » (`layoutOpen`), jamais au premier
 * rendu du studio : c'est ce qui garde `mosaicTiles`
 * (`lib/feed/mosaic-layout.ts`, la géométrie des cinq modes) HORS du chemin
 * statique du chunk `story_studio` (revue-correction du poids, #7684).
 */
export function PublishLayoutMenu({
  language,
  value,
  onChoose,
}: {
  readonly language: InterfaceLanguage;
  readonly value: MosaicLayoutMode;
  readonly onChoose: (mode: MosaicLayoutMode) => void;
}) {
  return (
    <div role="group" aria-label={translate(language, 'story.studio.layout.title')} className="pb-1">
      <p className="px-3 pt-1 pb-0.5 text-mini font-semibold" style={{ color: 'var(--color-ios-ink-3)' }}>
        {translate(language, 'story.studio.layout.title')}
      </p>
      {PUBLICATION_LAYOUT_ORDER.map((mode) => (
        <button
          key={mode}
          type="button"
          role="menuitem"
          data-publish-layout-choice={mode}
          aria-current={mode === value ? 'true' : undefined}
          onClick={() => onChoose(mode)}
          className="flex w-full items-center gap-2 px-4 text-left text-caption"
          style={{ minHeight: 40, color: 'var(--color-ios-ink)' }}
        >
          <LayoutMark mode={mode} size={16} />
          {translate(language, publicationLayoutLabelKey(mode))}
          {mode === value ? <Glyph name="check" size={12} /> : null}
        </button>
      ))}
    </div>
  );
}
