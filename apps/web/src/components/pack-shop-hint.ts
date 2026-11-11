import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import type { InfoHint } from '@/components/info-hint';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/** Le (i) d'une boutique de packs (#17594) : une seule question, trois réponses — stickers, cadres, boutique entière. */
export const packShopHint = (language: InterfaceLanguage, text: 'stickerPacks.shop.hint' | 'packs.frames.hint' | 'packs.shop.hint'): InfoHint => ({
  label: translateStickerPacks(language, 'packs.hint.question'),
  text: translateStickerPacks(language, text),
  glyph: SETTINGS_GLYPHS.info,
});
