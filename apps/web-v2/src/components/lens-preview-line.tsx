import type { CSSProperties } from 'react';

import {
  renderConversationPreviewText,
  type ConversationPreview,
  type PreviewIcon,
  type PreviewTone,
} from '@meeshy/shared/utils/conversation-preview';

import { Glyph, GlyphSvg, type GlyphShape } from './glyph';
import type { GlyphName } from './glyphs';
import { LENS_PREVIEW_GLYPHS } from './glyphs-lens-preview';
import { TypingDots } from './typing-dots';

/**
 * L'ICONOGRAPHIE WEB DES ICÔNES DU COMPOSEUR (#7547) — le composeur partagé
 * nomme une icône, chaque client la dessine avec la sienne (doc-comment de
 * `PREVIEW_ICON_GLYPH`, `@meeshy/shared`). Le socle porte les glyphes déjà
 * vus sur cette ligne ; `glyphs-lens-preview.ts` porte les autres.
 */
const ICONS: Readonly<Record<PreviewIcon, GlyphShape | GlyphName>> = {
  'call-audio': 'phone',
  'call-video': LENS_PREVIEW_GLYPHS.videoCamera,
  voice: 'microphone',
  audio: LENS_PREVIEW_GLYPHS.musicNote,
  video: LENS_PREVIEW_GLYPHS.filmStrip,
  photo: 'image',
  file: 'file',
  location: LENS_PREVIEW_GLYPHS.mapPin,
  attachments: LENS_PREVIEW_GLYPHS.paperclip,
  effect: LENS_PREVIEW_GLYPHS.sparkle,
  forward: LENS_PREVIEW_GLYPHS.arrowBendUpRight,
  'view-once': 'eye',
  ephemeral: 'flameFill',
  expired: 'timer',
  hidden: 'eyeSlash',
  encrypted: 'lock',
};

/**
 * L'ENCRE DE LA LIGNE — `ink-2` pour tout ce qui est texte : l'accent d'une
 * conversation ne franchit pas le plancher AA sur cette ligne
 * (`checkRowInkMeetsAA`, `check-list-actions.mjs`). Le TON se porte donc par
 * l'icône et par l'étiquette d'auteur, jamais par le corps du texte — sauf le
 * rouge d'un appel manqué et le vert d'un appel en cours, deux jetons
 * sémantiques de la table partagée.
 */
const TONE_INK: Readonly<Record<PreviewTone, string>> = {
  default: 'var(--color-ios-ink-2)',
  accent: 'var(--color-ios-ink-2)',
  system: 'var(--color-ios-ink-2)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
};

const ICON_STYLE = 'mr-1 inline-block align-[-2px]';

function PreviewGlyph({ icon, style }: { readonly icon: PreviewIcon; readonly style?: CSSProperties }) {
  const glyph = ICONS[icon];
  return typeof glyph === 'string' ? (
    <Glyph name={glyph} size={13} className={ICON_STYLE} {...(style === undefined ? {} : { style })} />
  ) : (
    <GlyphSvg glyph={glyph} size={13} className={ICON_STYLE} {...(style === undefined ? {} : { style })} />
  );
}

/**
 * LA LANGUE DITE AU LECTEUR D'ÉCRAN — celle que le Prisme a servie, ou, pour
 * l'original d'un DERNIER MESSAGE, sa langue d'origine. Omise quand elle est
 * inconnue : `lang=""` ferait quitter au lecteur la voix du document, et dire
 * « je ne sais pas » est ici pire que se taire.
 */
function langOf(
  segment: ConversationPreview['segments'][number],
  preview: ConversationPreview,
  originalLanguage: string | undefined,
): { readonly lang?: string } {
  if (segment.kind !== 'text') return {};
  if (segment.language !== null) return { lang: segment.language };
  return preview.kind === 'message' && originalLanguage !== undefined && originalLanguage !== '' ? { lang: originalLanguage } : {};
}

const DIRECTION_GLYPH = {
  incoming: LENS_PREVIEW_GLYPHS.arrowDownLeft,
  outgoing: LENS_PREVIEW_GLYPHS.arrowUpRight,
} as const;

/**
 * LA LIGNE 2 DE LA LENTILLE (#7547) — dessine la valeur que
 * `composeConversationPreview` a rendue, sans rien y ajouter : ni libellé, ni
 * priorité, ni règle de protection ne se décident ici.
 *
 * DEUX LECTURES, UN TEXTE. Le lecteur d'écran lit `data-line2-label`, la mise
 * à plat du composeur (`renderConversationPreviewText`) — exactement ce que
 * l'œil lit, l'icône y étant dite par son glyphe texte. Le rendu visible est
 * `aria-hidden` : sans cela, chaque ligne serait annoncée deux fois.
 *
 * `lang` porte la langue SERVIE par le Prisme sur chaque segment de contenu,
 * et seulement quand elle est connue (`language: null` = l'original, dont la
 * langue est celle du message) : un lecteur d'écran prononce un aperçu traduit
 * avec la voix de sa langue.
 */
export function LensPreviewLine({
  preview,
  interfaceLanguage,
  accent,
  originalLanguage,
}: {
  readonly preview: ConversationPreview;
  readonly interfaceLanguage: string;
  readonly accent: string;
  /** Langue d'origine du dernier message — celle d'un segment servi en ORIGINAL (`language: null`). */
  readonly originalLanguage?: string | undefined;
}) {
  const ink = TONE_INK[preview.tone];
  const italic = preview.kind === 'typing' || preview.kind === 'system' || preview.kind === 'empty';
  const authorColor = preview.author?.kind === 'draft' ? accent : undefined;
  const flat = renderConversationPreviewText(preview, interfaceLanguage);
  const authorOnly = preview.author === null ? '' : renderConversationPreviewText({ ...preview, icon: null, segments: [] }, interfaceLanguage);

  return (
    <>
      <span data-line2-label className="sr-only">
        {flat}
      </span>
      <span data-line2-visible aria-hidden="true" style={{ color: ink }} className={italic ? 'italic' : undefined}>
        {preview.author === null ? null : (
          <span className={authorColor === undefined ? undefined : 'font-semibold'} style={authorColor === undefined ? undefined : { color: authorColor }}>
            {authorOnly}
          </span>
        )}
        {preview.direction === undefined ? null : (
          <GlyphSvg glyph={DIRECTION_GLYPH[preview.direction]} size={11} className={ICON_STYLE} />
        )}
        {preview.icon === null ? null : (
          <PreviewGlyph icon={preview.icon} {...(preview.tone === 'accent' ? { style: { color: accent } } : {})} />
        )}
        {preview.segments.map((segment, index) => (
          <span key={index} {...langOf(segment, preview, originalLanguage)}>
            {index === 0 ? '' : ' · '}
            {segment.text}
          </span>
        ))}
        {preview.kind === 'typing' ? <TypingDots color={accent} className="ml-1" /> : null}
      </span>
    </>
  );
}
