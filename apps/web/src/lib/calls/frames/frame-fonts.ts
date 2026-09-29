import '@/styles/story-fonts.css';

import { STORY_FONT_FAMILIES, STORY_FONT_STYLES, type StoryFontStyle } from '@/lib/canvas/story-fonts';
import { CANVAS_NATIVE_STACK } from '@/lib/export/message-card-templates';

import type { FrameFont, FrameLook } from './frame-spec';

/**
 * **LES POLICES D'UN CADRE** (#8743) — les dix-huit `StoryTextStyle` des
 * images de message et de commentaire (Imager), en chaîne `font` de canevas :
 * la famille EMBARQUÉE (`story-fonts.ts`) puis la pile native, jamais un
 * générique qui ferait croire que le fichier a chargé. Les cinq familles sans
 * fichier reprennent les piles de `text-appearance.ts`.
 */

export type FrameFontFace = { readonly family: string | null; readonly weight: number; readonly italic: boolean };

const FREE_FACES: Readonly<Record<'bold' | 'neon' | 'typewriter' | 'classic' | 'italic', FrameFontFace>> = {
  bold: { family: null, weight: 800, italic: false },
  neon: { family: null, weight: 600, italic: false },
  typewriter: { family: '"Courier New", Courier, monospace', weight: 400, italic: false },
  classic: { family: 'Georgia, "Times New Roman", serif', weight: 500, italic: false },
  italic: { family: 'Georgia, "Times New Roman", serif', weight: 400, italic: true },
};

const isEmbedded = (font: FrameFont): font is StoryFontStyle => (STORY_FONT_STYLES as readonly string[]).includes(font);

export function frameFontFace(font: FrameFont): FrameFontFace {
  if (isEmbedded(font)) return { family: `"${STORY_FONT_FAMILIES[font].css}", ${CANVAS_NATIVE_STACK}`, weight: STORY_FONT_FAMILIES[font].weight, italic: false };
  return FREE_FACES[font];
}

/** La chaîne `font` d'un contexte 2D pour `font` à `px` pixels. */
export function frameCanvasFont(font: FrameFont, px: number): string {
  const face = frameFontFace(font);
  return `${face.italic ? 'italic ' : ''}${face.weight} ${Math.max(1, Math.round(px * 10) / 10)}px ${face.family ?? CANVAS_NATIVE_STACK}`;
}

/** La police du mot « meeshy » quand le cadre n'en nomme pas : l'arrondie (Fredoka 600, SF Rounded côté iOS). */
export const BRAND_FONT: FrameFont = 'bubble';

/** Les polices qu'un cadre PEINT : noms, titre, sous-titre, marque. */
export function framesFonts(frames: readonly Pick<FrameLook, 'names' | 'title' | 'subtitle' | 'brand'>[]): readonly FrameFont[] {
  const used = frames.flatMap((frame) => [
    ...(frame.names.show === 'none' ? [] : [frame.names.font]),
    ...(frame.title.source === 'none' ? [] : [frame.title.font]),
    ...(frame.subtitle === undefined || frame.subtitle.source === 'none' ? [] : [frame.subtitle.font]),
    ...(frame.brand.mark === 'logo' ? [] : [frame.brand.font ?? BRAND_FONT]),
  ]);
  return [...new Set(used)];
}

/**
 * Attend les fichiers des polices EMBARQUÉES que ces cadres peignent, avant
 * le premier rendu (§ 4.5) : un canevas peint avec une police absente la
 * remplace pour toujours. Un chargement qui échoue rend la pile native, sans
 * lever ; sans `document.fonts` (témoins, vieux moteurs), rien à attendre.
 */
export async function loadFrameFonts(
  frames: readonly Pick<FrameLook, 'names' | 'title' | 'subtitle' | 'brand'>[],
  fonts: Pick<FontFaceSet, 'load'> | undefined = typeof document === 'undefined' ? undefined : document.fonts,
): Promise<void> {
  if (fonts === undefined) return;
  await Promise.all(framesFonts(frames).filter(isEmbedded).map((font) => fonts.load(frameCanvasFont(font, 40)).catch(() => undefined)));
}
