import type { QuotedMediaKind } from '@/lib/view/quoted-preview';

import type { GlyphShape } from './glyph';
import { GLYPHS } from './glyphs';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';

/**
 * LE GLYPHE D'UN GENRE CITÉ — miroir `previewGlyph`
 * (`BubbleQuotedReply.swift:452-476`), qui nomme un TYPE. Partagé par la
 * citation de la bulle et la bande de réponse du composeur (#18392) : un même
 * genre se dit par la même icône sur les deux surfaces.
 */
export const QUOTE_GLYPH: Readonly<Record<QuotedMediaKind, GlyphShape>> = {
  image: GLYPHS.image,
  video: THREAD_STATES_GLYPHS.videoCamera,
  audio: GLYPHS.microphone,
  file: GLYPHS.file,
  contact: GLYPHS.user,
};
