import { memo, useId } from 'react';

import { GlyphSvg, type GlyphShape } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { STORY_AUDIENCE_GLYPHS } from '@/components/glyphs-story-audience';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { audienceLabelKey, type ChoosableAudience } from '@/lib/stories/publication-audience';

/**
 * **LA PASTILLE D'AUDIENCE DU STUDIO** (#7683, première tranche du registre
 * #7463 — ligne « audience »). Présentation PURE, sans état ni réseau :
 * l'orchestration (la valeur choisie, la mémoire, l'ouverture de la feuille)
 * vit dans `story-compose.tsx`, comme le reste des pièces du studio
 * (`story-compose-parts.tsx`). Sa FEUILLE vit à part
 * (`story-compose-audience-sheet.tsx`) et se charge À LA DEMANDE, comme
 * `LanguageSheet` et `EffectsSheet` du composeur du fil : elle ne pèse sur le
 * chunk du studio que si l'auteur touche la pastille.
 *
 * Miroir iOS : `MeeshyComposerHost+Socle.swift:196-229` — une icône et un mot
 * côte à côte (`HStack(spacing: 4)`, `lineLimit(1)`), cible 44 × 44, le nom
 * accessible reste « Audience » et la valeur s'annonce comme valeur.
 */

/**
 * **LE GLYPHE DE CHAQUE AUDIENCE CHOISISSABLE** — miroir de
 * `PostVisibility.icon` (`PostVisibility.swift:22-31`). `users` et `lock`
 * viennent du SOCLE, déjà payé avant le premier pixel ; `globe` et
 * `usersThree` du jeu de la pastille (`scripts/extract-glyphs.mjs`). La
 * feuille l'ÉTEND des deux modes nominatifs, qu'elle seule peint
 * (`story-compose-audience-sheet.tsx`) — jamais une seconde table.
 */
export const CHOOSABLE_AUDIENCE_GLYPH: Readonly<Record<ChoosableAudience, GlyphShape>> = {
  PUBLIC: STORY_AUDIENCE_GLYPHS.globe,
  COMMUNITY: STORY_AUDIENCE_GLYPHS.usersThree,
  FRIENDS: GLYPHS.users,
  PRIVATE: GLYPHS.lock,
};

/** D'où vient la valeur que la pastille affiche : l'auteur l'a CHOISIE, ou
 * c'est le défaut que la passerelle posera pour le format en cours. */
export type AudienceSource = 'chosen' | 'default';

const TARGET = 44;

/**
 * `memo` : le studio se re-rend à chaque frappe (le brouillon change) ; la
 * pastille ne reçoit que des primitives et un rappel STABLE, elle ne se
 * repeint que si l'audience ou l'ouverture changent (Zero Unnecessary
 * Re-render).
 *
 * Le mot visible est la VALEUR seule : « Contacts · par défaut » ne tient pas
 * à côté de la capsule Publier. La mention « par défaut » part dans la
 * DESCRIPTION accessible, et se lit en clair dans la feuille, sur la rangée du
 * défaut (`story-compose-audience-sheet.tsx`). Sous 360 px, le mot s'efface et
 * l'icône reste — comme iOS aux paliers d'accessibilité (#4057,
 * `socleShowsLabels`) : un « C… » tronqué ne dit rien, l'icône dit l'audience,
 * et le nom accessible ne bouge pas (`aria-describedby` lit un nœud masqué).
 */
export const AudienceChip = memo(function AudienceChip({
  lang,
  value,
  source,
  open,
  onOpen,
}: {
  readonly lang: InterfaceLanguage;
  /** Ce qui PARTIRA — l'audience CHOISIE, ou le défaut de la passerelle pour
   * le format en cours (`defaultAudienceOf`) quand `source === 'default'`. */
  readonly value: ChoosableAudience;
  readonly source: AudienceSource;
  readonly open: boolean;
  readonly onOpen: () => void;
}) {
  const valueId = useId();
  const label = translate(lang, audienceLabelKey(value));
  return (
    <button
      type="button"
      data-story-audience
      data-audience-value={value}
      data-audience-source={source}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={translate(lang, 'story.studio.audience.chip.label')}
      aria-describedby={valueId}
      className="inline-flex min-w-0 items-center gap-1 rounded-chip px-3 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minWidth: TARGET,
        minHeight: TARGET,
        color: 'var(--color-ios-ink-2)',
        backgroundColor: 'var(--color-ios-card)',
        outlineColor: 'var(--color-ios-brand)',
      }}
    >
      <GlyphSvg glyph={CHOOSABLE_AUDIENCE_GLYPH[value]} size={16} className="shrink-0" />
      <span id={valueId} className="hidden min-w-0 truncate text-caption font-semibold min-[360px]:block">
        {label}
        {source === 'default' ? <span className="sr-only">{` · ${translate(lang, 'story.studio.audience.defaultMark')}`}</span> : null}
      </span>
    </button>
  );
});
