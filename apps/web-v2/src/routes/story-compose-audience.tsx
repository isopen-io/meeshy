import { useId } from 'react';

import type { PostVisibility } from '@meeshy/shared/types/post';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { Sheet } from '@/components/sheet';
import { STORY_AUDIENCE_GLYPHS } from '@/components/glyphs-story-audience';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { audienceAvailability, audienceGlyph, audienceLabelKey, audienceSubtitleKey, offeredAudiences } from '@/lib/stories/publication-audience';

/**
 * **LA PASTILLE ET LA FEUILLE D'AUDIENCE DU STUDIO** (#7683, première tranche
 * du registre #7463 — ligne « audience »). Présentation PURE, sans état ni
 * réseau : l'orchestration (la valeur choisie, la mémoire, l'ouverture de la
 * feuille) vit dans `story-compose.tsx`, comme le reste des pièces du studio
 * (`story-compose-parts.tsx`).
 *
 * Miroir iOS : la pastille du socle (`MeeshyComposerHost+Socle.swift:196-229`)
 * et la feuille `ComposerAudienceSheet.swift`. La FORME diffère par endroits —
 * voir le tableau § 1.6 de la spécification — mais la disposition, la
 * hiérarchie et les gestes viennent de là.
 */

const TARGET = 44;

export function AudiencePastille({
  lang,
  value,
  source,
  open,
  onOpen,
}: {
  readonly lang: InterfaceLanguage;
  /** Ce qui PARTIRA — l'audience CHOISIE, ou le défaut de la passerelle pour
   * le format en cours (`defaultAudienceOf`) quand `source === 'default'`. */
  readonly value: PostVisibility;
  readonly source: 'chosen' | 'default';
  readonly open: boolean;
  readonly onOpen: () => void;
}) {
  const valueId = useId();
  return (
    <button
      type="button"
      data-story-audience
      data-audience-value={value}
      data-audience-source={source}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={translate(lang, 'story.studio.audience.pastille.label')}
      aria-describedby={valueId}
      className="grid shrink-0 place-items-center gap-0.5 rounded-chip px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minWidth: TARGET,
        minHeight: TARGET,
        color: 'var(--color-ios-ink)',
        backgroundColor: 'var(--color-ios-card)',
        outlineColor: 'var(--color-ios-brand)',
      }}
    >
      <GlyphSvg glyph={STORY_AUDIENCE_GLYPHS[audienceGlyph(value)]} size={18} />
      <span id={valueId} className="text-mini font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(lang, audienceLabelKey(value))}
      </span>
    </button>
  );
}

export function AudienceSheet({
  lang,
  repostOfId,
  selected,
  onChoose,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  /** `null` hors republication — le studio n'a pas encore de flux de
   * republication (#7463, seconde tranche) : toujours `null` en pratique
   * aujourd'hui, la loi D-100 étant déjà branchée pour le jour où il en a un. */
  readonly repostOfId: string | null;
  readonly selected: PostVisibility | null;
  readonly onChoose: (visibility: PostVisibility) => void;
  readonly onClose: () => void;
}) {
  return (
    <Sheet title={translate(lang, 'story.studio.audience.title')} onClose={onClose}>
      {offeredAudiences({ repostOfId }).map((visibility) => {
        const availability = audienceAvailability(visibility);
        const isSelected = visibility === selected;
        return (
          <li key={visibility}>
            <button
              type="button"
              data-audience-choice={visibility}
              aria-disabled={!availability.choosable}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => {
                if (availability.choosable) onChoose(visibility);
              }}
              className="flex w-full items-center gap-3 px-4 text-left"
              style={{ minHeight: 60, color: availability.choosable ? 'var(--color-ios-ink)' : 'var(--color-ios-ink-3)' }}
            >
              <GlyphSvg glyph={STORY_AUDIENCE_GLYPHS[audienceGlyph(visibility)]} size={22} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-medium">{translate(lang, audienceLabelKey(visibility))}</span>
                <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
                  {availability.choosable ? translate(lang, audienceSubtitleKey(visibility)) : translate(lang, availability.reasonKey)}
                </span>
              </span>
              {isSelected ? <Glyph name="check" size={16} style={{ color: 'var(--accent)' }} /> : null}
            </button>
          </li>
        );
      })}
      <li data-audience-scope className="px-4 py-3 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
        {translate(lang, 'story.studio.audience.scope')}
      </li>
    </Sheet>
  );
}
