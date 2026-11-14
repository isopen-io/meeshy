import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import type { InfoHint } from '@/components/info-hint';
import type { SessionsCatalogKey, SessionsText } from '@/lib/i18n-sessions-catalog';

/** Un (i) de la Sécurité (#17594) : la QUESTION nomme le bouton, la réponse est la note — deux clés du catalogue des sessions. */
export const sessionsHint = (t: SessionsText, question: SessionsCatalogKey, text: SessionsCatalogKey): InfoHint => ({
  label: t(question),
  text: t(text),
  glyph: SETTINGS_GLYPHS.info,
});
