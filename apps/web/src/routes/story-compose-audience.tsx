import { RELATION_LEVEL_PRESENTATION, postCircleAudienceFloor } from '@meeshy/shared/utils/relation-levels';
import { memo, useId } from 'react';

import { GlyphSvg, type GlyphShape } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { STORY_AUDIENCE_GLYPHS } from '@/components/glyphs-story-audience';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { audienceLabelKey, type AudienceSource, type ShownAudience, type StudioAudience } from '@/lib/stories/publication-audience';

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
export const CHOOSABLE_AUDIENCE_GLYPH = {
  PUBLIC: STORY_AUDIENCE_GLYPHS.globe,
  COMMUNITY: STORY_AUDIENCE_GLYPHS.usersThree,
  FRIENDS: GLYPHS.users,
  PRIVATE: GLYPHS.lock,
} as const satisfies Readonly<Record<string, GlyphShape>>;

export type { AudienceSource };

/**
 * **L'ICÔNE D'UNE AUDIENCE** — un glyphe pour les audiences historiques, l'icône
 * PARTAGÉE du cercle pour Connaissances, Proches et Sang (`RELATION_LEVEL_PRESENTATION`,
 * 👋 🔥 🩸 : la même que « Mes cercles » et `GET /relations/config`), le cadenas
 * pour une audience servie qu'on ne sait pas lire. Les deux modes nominatifs ont
 * leur glyphe dans la feuille, seule à les peindre ; la pastille d'une
 * publication rouverte nominative montre la personne seule.
 */
export function AudienceIcon({ visibility, size, nominal }: { readonly visibility: StudioAudience | 'RESTRICTED'; readonly size: number; readonly nominal?: GlyphShape }) {
  const circle = postCircleAudienceFloor(visibility);
  if (circle !== null) {
    return (
      <span aria-hidden="true" data-audience-icon={visibility} className="inline-grid shrink-0 place-items-center leading-none" style={{ width: size, height: size, fontSize: size * 0.85 }}>
        {RELATION_LEVEL_PRESENTATION[circle].icon}
      </span>
    );
  }
  const glyph =
    visibility === 'EXCEPT' || visibility === 'ONLY' ? (nominal ?? GLYPHS.user) : visibility === 'RESTRICTED' ? GLYPHS.lock : CHOOSABLE_AUDIENCE_GLYPH[visibility as keyof typeof CHOOSABLE_AUDIENCE_GLYPH];
  return <GlyphSvg glyph={glyph} size={size} className="shrink-0" />;
}

const shownLabel = (lang: InterfaceLanguage, value: ShownAudience['value']): string =>
  translate(lang, value === 'RESTRICTED' ? 'story.studio.audience.restricted' : audienceLabelKey(value));

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
  disabled = false,
}: {
  readonly lang: InterfaceLanguage;
  /** Ce qui PARTIRA — l'audience CHOISIE, le défaut de la passerelle pour le
   * format en cours (`source === 'default'`), ou l'audience SERVIE d'une
   * publication rouverte que le studio ne sait pas choisir (`'served'`). */
  readonly value: ShownAudience['value'];
  readonly source: AudienceSource;
  readonly open: boolean;
  readonly onOpen: () => void;
  /** VERROUILLÉE pendant l'envoi (#7707, revue-correction) — le plan publié
   * porte l'audience du geste ; en changer après coup serait ignoré en
   * silence par la séquence déjà partie. */
  readonly disabled?: boolean;
}) {
  const valueId = useId();
  const label = shownLabel(lang, value);
  return (
    <button
      type="button"
      data-story-audience
      data-audience-value={value}
      data-audience-source={source}
      onClick={onOpen}
      disabled={disabled}
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
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <AudienceIcon visibility={value} size={16} />
      <span id={valueId} className="hidden min-w-0 truncate text-caption font-semibold min-[360px]:block">
        {label}
        {source === 'default' ? <span className="sr-only">{` · ${translate(lang, 'story.studio.audience.defaultMark')}`}</span> : null}
      </span>
    </button>
  );
});
