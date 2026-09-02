/**
 * L'ÉMETTEUR v3 du composer story — déplacé de `components/v2/StoryComposer.tsx`
 * (W5, absorption de la surface story dans le meuble unifié).
 *
 * Ce module ne connaît AUCUNE UI : il transforme un état de composition plat
 * (`CanvasComposerState`) en document `CanvasV3`, forme jumelle du
 * convertisseur gateway (`storyEffectsV3.ts`,
 * `services/gateway/src/services/posts/`) et d'iOS (`CanvasV3Migration.swift`).
 * Il existe pour être consommé par LES DEUX enrobages qui portent désormais le
 * format story — le dialogue autonome (`StoryComposer`) et le corps montable
 * dans le meuble (`StoryComposerSurface`), tous deux dans
 * `components/v2/StoryComposer.tsx` — sans qu'aucun des deux n'ait à
 * réécrire la règle.
 *
 * `getMediaCategory`, `isGradient` et `getCategoryLabelKey` restent dans le
 * composant : ce sont des aides d'UI (regroupement des médias pour les
 * compteurs de boutons, style du fond), pas des étapes de l'émission v3.
 */

import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';
import type { StoryTextEffect } from '@/lib/story-text-effect';

export type TextStyle = 'bold' | 'neon' | 'typewriter' | 'handwriting';

export type MediaCategory = 'image' | 'video' | 'audio';

export const MEDIA_LIMITS: Record<MediaCategory, number> = {
  image: 5,
  video: 2,
  audio: 3,
};

export const MEDIA_ACCEPT: Record<MediaCategory, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

export const BACKGROUND_COLORS = [
  { id: 'terracotta', value: '#C4704B', label: 'Terracotta' },
  { id: 'teal', value: '#1A6B5A', label: 'Teal' },
  { id: 'charcoal', value: '#2D3748', label: 'Charcoal' },
  { id: 'gold', value: '#E8C547', label: 'Gold' },
  { id: 'pink', value: '#E74C9B', label: 'Pink' },
  {
    id: 'gradient',
    value: 'linear-gradient(135deg, #C4704B, #1A6B5A)',
    label: 'Gradient',
  },
] as const;

export const TEXT_STYLES: { id: TextStyle; label: string }[] = [
  { id: 'bold', label: 'Aa' },
  { id: 'neon', label: 'Ne' },
  { id: 'typewriter', label: 'Tt' },
  { id: 'handwriting', label: 'Hh' },
];

export function getTextStyleClasses(style: TextStyle): string {
  switch (style) {
    case 'bold':
      return 'font-bold';
    case 'neon':
      return 'font-bold [text-shadow:0_0_8px_rgba(255,255,255,0.8),0_0_20px_rgba(255,255,255,0.4)]';
    case 'typewriter':
      return 'font-mono tracking-wider';
    case 'handwriting':
      return 'italic font-light tracking-wide';
    default:
      return 'font-bold';
  }
}

function generateStoryObjectId(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoRef.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/// Fond canonique du fil (`#hex` | `gradient:from,to` | url) : la palette du
/// composer parle CSS (`linear-gradient(135deg, A, B)`), forme qu'aucun
/// lecteur — ni `CanvasV3Scene`, ni le chemin legacy, ni iOS — ne sait lire.
const CSS_GRADIENT_STOPS = /^linear-gradient\([^,]*,(.*)\)$/;

function canonicalBackground(value: string): string {
  const stops = CSS_GRADIENT_STOPS.exec(value)?.[1];
  if (stops === undefined) return value;
  return `gradient:${stops.split(',').map((stop) => stop.trim()).filter(Boolean).join(',')}`;
}

const NEUTRAL_TRANSFORM: ObjectV3['transform'] = { scale: 1, rotation: 0, opacity: 1 };

type UnrankedObjectV3 = Omit<ObjectV3, 'z'>;

export type CanvasMediaSource = {
  postMediaId: string;
  mediaType: 'image' | 'video';
  x: number;
  y: number;
  isBackground: boolean;
  duration?: number;
};

export type CanvasAudioSource = {
  postMediaId: string;
  placement: string;
  x: number;
  y: number;
  volume: number;
  isBackground: boolean;
  duration?: number;
};

export type CanvasComposerState = {
  background: string;
  textStyle: TextStyle;
  content?: string;
  media?: readonly CanvasMediaSource[];
  audio?: readonly CanvasAudioSource[];
};

/// Constat 23 — forme jumelle du convertisseur gateway
/// (`baseObject({ id: 'bg' }, 'media', 'bg', z++)`, `storyEffectsV3.ts:73`)
/// et d'iOS (`ObjectV3(id: "bg", …)`, `CanvasV3Migration.swift:174`) : l'objet
/// de fond porte l'id LITTÉRAL, jamais un id généré.
function backgroundObject(background: string): UnrankedObjectV3 {
  return {
    id: 'bg',
    kind: 'media',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'bg',
    transform: NEUTRAL_TRANSFORM,
    payload: { background: canonicalBackground(background) },
  };
}

/// G3 — le stylage RACINE devient un objet texte seulement en l'absence
/// d'objet texte : l'écran web n'a pas de famille `textObjects`, son contenu
/// est donc toujours ce texte-là. Sans lui, `StoryViewer` en v3 n'affiche plus
/// rien (le bloc legacy `story.content` ne se monte plus).
///
/// Constat 4 (BLOQUANT, rejet DoD de F7d, arbitrage 4 vs 8) — ce texte
/// racine ne pose JAMAIS de `locale` ICI, et c'est définitif : le composer
/// web n'a aucun sélecteur de langue EXPLICITE pour l'auteur (contre iOS,
/// `StoryComposerViewModel+Elements.swift:674`), et ce texte ne porte
/// JAMAIS un `content` vide (G3 ci-dessus) — le résolveur partagé avec
/// `originalLanguage` (`resolveOriginalLanguageForCreate`) refuserait donc
/// TOUJOURS de deviner ici, rendant tout appel à cet endroit une branche
/// morte. La règle 3 du Prisme (l'origine doit concourir à SON rang) reste
/// néanmoins honorée : le serveur détecte la vraie langue à la création
/// (`PostService.ts` `detectLanguage(data.content)`) et la persiste sur
/// `post.originalLanguage` ; `postToStoryData` (`lib/story-transforms.ts`,
/// `withOriginLocale`) la reporte à la LECTURE sur tout objet texte
/// dépourvu de sa propre `locale` — jamais devinée, jamais dupliquée ici.
function rootTextObject(content: string, textStyle: TextStyle): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'text',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'fg',
    transform: NEUTRAL_TRANSFORM,
    payload: { text: content, textStyle, ...presetTextEffect(textStyle) },
  };
}

/// **Les quatre « styles » de ce composer sont des PRESETS** : une police ET,
/// pour « neon », une lueur — c'est ce que `getTextStyleClasses('neon')` montre
/// à l'auteur pendant qu'il tape. Depuis #4870 la lueur n'est plus un
/// sous-entendu de la police chez les lecteurs : elle est l'axe EFFET, et ce
/// preset l'ÉCRIT (`textEffect: 'glow'`) pour que ce que l'auteur a vu soit ce
/// qui part — sur iOS aussi, qui n'a jamais fait briller « neon ». Le jour où
/// ce composer aura son propre contrôle d'effet, ce preset se retire.
function presetTextEffect(textStyle: TextStyle): { textEffect: StoryTextEffect } | Record<string, never> {
  return textStyle === 'neon' ? { textEffect: 'glow' } : {};
}

function mediaObject(media: CanvasMediaSource): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'media',
    anchor: { t: 'free', x: media.x, y: media.y },
    plane: 'content',
    transform: NEUTRAL_TRANSFORM,
    payload: {
      postMediaId: media.postMediaId,
      mediaType: media.mediaType,
      isBackground: media.isBackground,
      ...(media.duration !== undefined ? { duration: media.duration } : {}),
    },
  };
}

/// `volume` n'est émis que s'il s'écarte de 1 et `waveformSamples` reste
/// DEHORS (spec §C2bis) : les deux côtés décodent 1 par défaut, et les golden
/// v1→v3 ne portent pas l'échantillonnage de composition.
function audioObject(audio: CanvasAudioSource): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'audio',
    anchor: { t: 'free', x: audio.x, y: audio.y },
    plane: 'content',
    transform: NEUTRAL_TRANSFORM,
    payload: {
      postMediaId: audio.postMediaId,
      placement: audio.placement,
      isBackground: audio.isBackground,
      ...(audio.volume !== 1 ? { volume: audio.volume } : {}),
      ...(audio.duration !== undefined ? { duration: audio.duration } : {}),
    },
  };
}

/// O3 — jamais de cadre vide servi au fil : la palette a toujours une valeur,
/// le porteur de fond existe donc TOUJOURS et la scène ne peut pas être vide.
/// `z` est le rang d'INSERTION (fond, texte racine, porteur, audio), pas un
/// ordre par plan — le plan porte déjà l'empilement à la lecture.
export function buildCanvasV3(state: CanvasComposerState): CanvasV3 {
  const objects: ObjectV3[] = [
    backgroundObject(state.background),
    ...(state.content?.trim() ? [rootTextObject(state.content, state.textStyle)] : []),
    ...(state.media ?? []).map(mediaObject),
    ...(state.audio ?? []).map(audioObject),
  ].map((object, index) => ({ ...object, z: index }));

  return { v: 3, scenes: [{ id: 's1', objects }] };
}
