import { useEffect, useRef, type CSSProperties } from 'react';
import { plainTextOf } from '@meeshy/shared/utils/text-plain';

import {
  renderConversationPreviewText,
  type ConversationPreview,
  type PreviewEffect,
  type PreviewFinish,
  type PreviewIcon,
  type PreviewTone,
} from '@meeshy/shared/utils/conversation-preview';

import { RAINBOW_SPECTRUM } from '@/lib/effects-playback';
import { BLUR_RADIUS_PX } from '@/lib/reading-mode/protection';
import { entranceAnimation, shouldPlayEntrance } from '@/lib/view/preview-entrance';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

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
  contact: 'user',
  location: LENS_PREVIEW_GLYPHS.mapPin,
  attachments: LENS_PREVIEW_GLYPHS.paperclip,
  effect: LENS_PREVIEW_GLYPHS.sparkle,
  forward: LENS_PREVIEW_GLYPHS.arrowBendUpRight,
  sticker: LENS_PREVIEW_GLYPHS.sticker,
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

const ICON_STYLE = 'me-1 inline-block align-[-2px]';

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

/**
 * L'EFFET PEINT FIGÉ (#16975) — une liste ne fait tourner AUCUNE animation en
 * boucle : la lueur est une ombre douce à l'accent, l'arc-en-ciel un dégradé
 * posé sur le texte, les paillettes et la pulsation teintent l'icône. Seul le
 * TEXTE servi porte le fini, jamais les libellés du catalogue.
 *
 * L'arc-en-ciel réutilise `RAINBOW_SPECTRUM` — LE SPECTRE DE LA MAISON
 * (`RainbowEffect.houseSpectrum`, miroir iOS `MessageEffectModifiers.swift`),
 * le MÊME spectre que la bulle joue dans `effects-runner`. La liste et la
 * bulle d'un même message chiffent ainsi le même arc-en-ciel : une jumelle
 * codée en dur ici divergeait des deux.
 */
const FINISH_TEXT: Readonly<Record<PreviewFinish, (accent: string) => CSSProperties | undefined>> = {
  glow: (accent) => ({ textShadow: `0 0 6px color-mix(in srgb, ${accent} 70%, transparent)` }),
  rainbow: () => ({
    backgroundImage: `linear-gradient(90deg, ${RAINBOW_SPECTRUM.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  }),
  sparkle: () => undefined,
  pulse: () => undefined,
};

const finishTints = (effect: PreviewEffect | undefined): boolean => effect?.finish === 'sparkle' || effect?.finish === 'pulse';

const VEIL_STYLE: CSSProperties = { filter: `blur(${BLUR_RADIUS_PX / 4}px)`, userSelect: 'none' };

const onScreen = (element: HTMLElement): boolean => {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
};

/**
 * L'APPARITION, JOUÉE UNE FOIS (#16975) — quand le dernier message de la ligne
 * CHANGE, jamais au premier rendu. Elle anime le BLOC de la ligne 2 (une
 * transformation ne s'applique pas à une boîte en ligne, et le bloc garde sa
 * troncature) ; `element.animate` la compose sur le GPU et s'arrête seule.
 */
function useEntrance(effect: PreviewEffect | undefined, key: string | null) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previousKey = previous.current;
    previous.current = key;
    const element = ref.current?.closest<HTMLElement>('[data-line2]') ?? ref.current;
    const entrance = effect?.entrance ?? null;
    if (element === null || entrance === null || typeof element.animate !== 'function') return;
    const play = shouldPlayEntrance({
      previousKey,
      currentKey: key,
      reducedMotion: prefersReducedMotion(),
      hidden: document.visibilityState === 'hidden',
      onScreen: onScreen(element),
    });
    if (!play) return;
    const { keyframes, options } = entranceAnimation(entrance);
    element.animate(keyframes, options);
  }, [key, effect?.entrance]);
  return ref;
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
  entranceKey,
}: {
  readonly preview: ConversationPreview;
  readonly interfaceLanguage: string;
  readonly accent: string;
  /** Langue d'origine du dernier message — celle d'un segment servi en ORIGINAL (`language: null`). */
  readonly originalLanguage?: string | undefined;
  /** L'identité du dernier message : son CHANGEMENT joue l'apparition (#16975). */
  readonly entranceKey?: string | null;
}) {
  const effect = preview.effect;
  const entranceRef = useEntrance(effect, entranceKey ?? null);
  const textStyle = effect?.finish ? FINISH_TEXT[effect.finish](accent) : undefined;
  const segments = preview.segments.map((segment, index) => (
    <span key={index} {...langOf(segment, preview, originalLanguage)}>
      {index === 0 ? '' : ' · '}
      {segment.kind === 'text' && textStyle !== undefined ? (
        <span data-preview-text style={textStyle}>
          {plainTextOf(segment.text)}
        </span>
      ) : (
        plainTextOf(segment.text)
      )}
    </span>
  ));
  const ink = TONE_INK[preview.tone];
  const italic = preview.kind === 'typing' || preview.kind === 'system' || preview.kind === 'empty';
  const authorColor = preview.author?.kind === 'draft' ? accent : undefined;
  const flat = plainTextOf(renderConversationPreviewText(preview, interfaceLanguage));
  const authorOnly = preview.author === null ? '' : renderConversationPreviewText({ ...preview, icon: null, segments: [] }, interfaceLanguage);

  return (
    <>
      <span data-line2-label className="sr-only">
        {flat}
      </span>
      <span
        ref={entranceRef}
        data-line2-visible
        aria-hidden="true"
        style={{ color: ink }}
        className={italic ? 'italic' : undefined}
        {...(effect?.veil === true ? { 'data-preview-veil': '' } : {})}
        {...(effect?.finish ? { 'data-preview-finish': effect.finish } : {})}
      >
        {preview.author === null ? null : (
          <span className={authorColor === undefined ? undefined : 'font-semibold'} style={authorColor === undefined ? undefined : { color: authorColor }}>
            {authorOnly}
          </span>
        )}
        {preview.direction === undefined ? null : (
          <GlyphSvg glyph={DIRECTION_GLYPH[preview.direction]} size={11} className={ICON_STYLE} />
        )}
        {preview.icon === null ? null : (
          <PreviewGlyph icon={preview.icon} {...(preview.tone === 'accent' || finishTints(effect) ? { style: { color: accent } } : {})} />
        )}
        {effect?.veil === true ? (
          <span data-preview-veiled style={VEIL_STYLE}>
            {segments}
          </span>
        ) : (
          segments
        )}
        {preview.kind === 'typing' ? <TypingDots color={accent} className="ms-1" /> : null}
      </span>
    </>
  );
}

export type JoinCallRequest = {
  readonly conversationId: string;
  readonly callId: string;
  readonly media: 'audio' | 'video';
  readonly title: string;
  readonly avatar: string | null;
  readonly isGroup: boolean;
  /** Le compte du pair d'un direct (#10956) : l'appel rejoint peint sa présence servie. */
  readonly peerKey?: string | null;
};

/**
 * « REJOINDRE » SUR LA LIGNE D'UN APPEL EN COURS (H4, #7616 iOS) — la ligne 2
 * DIT l'appel (`active-call`, vert) ; ce bouton le REJOINT. Il vit HORS du
 * lien de la rangée (un bouton dans un `<a>` est un contenu interactif
 * imbriqué, que ni le clavier ni le lecteur d'écran n'atteignent proprement) :
 * `lens-row.tsx` le pose en frère du lien, au bout de la rangée. D-113 le
 * réservait à « quand le web appelle » — c'est fait (#6382).
 *
 * L'encre est le vert SÉMANTIQUE de la ligne 2 (`--color-success`, AA dans
 * les deux schémas) sur son propre voile : un texte blanc sur l'émeraude du
 * schéma sombre descend sous AA. Le bouton ne tire pas le moteur — l'appelant
 * passe `callActions.join`, qui le charge au geste.
 */
export function LensJoinCallButton({
  request,
  label,
  text,
  onJoin,
  outOfTabOrder,
}: {
  readonly request: JoinCallRequest;
  /** Le nom accessible — « Rejoindre l’appel avec {name} ». */
  readonly label: string;
  /** Le mot visible — « Rejoindre ». */
  readonly text: string;
  readonly onJoin: (request: JoinCallRequest) => void;
  /** Hors du parcours `Tab` : la rangée y mène aux flèches (#11227). */
  readonly outOfTabOrder?: boolean;
}) {
  return (
    <button
      type="button"
      data-lens-join={request.callId}
      {...(outOfTabOrder === true ? { tabIndex: -1 } : {})}
      aria-label={label}
      onClick={() => onJoin(request)}
      className="relative z-10 grid min-h-11 min-w-11 shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ outlineColor: 'var(--color-success)' }}
    >
      <span
        aria-hidden="true"
        data-lens-join-pill
        className="flex items-center gap-1 whitespace-nowrap rounded-chip px-2.5 text-check font-semibold"
        style={{ height: 28, color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)' }}
      >
        <PreviewGlyph icon={request.media === 'video' ? 'call-video' : 'call-audio'} />
        {text}
      </span>
    </button>
  );
}
